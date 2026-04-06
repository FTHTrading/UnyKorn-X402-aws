// ---------------------------------------------------------------------------
// OpenClaw Hardening — Delivery Recovery Safety
// ---------------------------------------------------------------------------
// Audits delivery queue entries for validity. Skips/purges stale entries
// that reference invalid modes, missing jobs, or unreachable recipients.
// ---------------------------------------------------------------------------

import { readdir, readFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { validateDeliveryMode, isNoDelivery } from "./validate-delivery.mjs";

/**
 * Load and classify all delivery queue entries.
 * @param {string} queueDir — path to delivery-queue/
 * @returns {Promise<{ entries: object[], errors: string[] }>}
 */
export async function loadQueueEntries(queueDir) {
  const entries = [];
  const errors = [];

  let files;
  try {
    files = await readdir(queueDir);
  } catch (err) {
    if (err.code === "ENOENT") return { entries: [], errors: [] };
    errors.push(`Cannot read queue directory ${queueDir}: ${err.message}`);
    return { entries, errors };
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const fullPath = join(queueDir, file);
    try {
      const raw = await readFile(fullPath, "utf-8");
      const data = JSON.parse(raw);
      entries.push({ file, path: fullPath, data, valid: true, reason: null });
    } catch (err) {
      entries.push({ file, path: fullPath, data: null, valid: false, reason: `Parse error: ${err.message}` });
    }
  }

  return { entries, errors };
}

/**
 * Classify a single queue entry as valid, stale, or invalid.
 * @param {object} entry       — loaded entry from loadQueueEntries
 * @param {Set}    validJobIds — set of known job IDs from jobs.json
 * @param {object} jobsMap     — jobId → job config (for checking delivery mode)
 * @returns {{ action: "keep"|"skip"|"purge", reasons: string[] }}
 */
export function classifyQueueEntry(entry, validJobIds, jobsMap) {
  const reasons = [];

  // Unparseable
  if (!entry.valid || !entry.data) {
    return { action: "purge", reasons: [`Invalid JSON: ${entry.reason || "no data"}`] };
  }

  const d = entry.data;

  // Missing required shape
  if (!d.jobId && !d.job_id) {
    reasons.push("No jobId in queue entry.");
  }

  const jobId = d.jobId || d.job_id;

  // References nonexistent job
  if (jobId && !validJobIds.has(jobId)) {
    reasons.push(`References unknown job "${jobId}".`);
  }

  // Job exists but delivery mode is "none"
  if (jobId && jobsMap[jobId]) {
    const job = jobsMap[jobId];
    const mode = job?.delivery?.mode;
    if (mode && isNoDelivery(mode)) {
      reasons.push(`Job "${jobId}" has delivery.mode="none" — should never have been queued.`);
    }
  }

  // Invalid delivery mode in the entry itself
  if (d.mode || d.deliveryMode) {
    const modeResult = validateDeliveryMode(d.mode || d.deliveryMode);
    if (!modeResult.valid) {
      reasons.push(`Entry has invalid mode: ${modeResult.error}`);
    }
  }

  // Target/recipient validation
  if (d.target || d.recipient) {
    const target = d.target || d.recipient;
    // @heartbeat is a known invalid Telegram target
    if (target === "@heartbeat" || target === "heartbeat") {
      reasons.push(`Target "${target}" is a known-invalid placeholder (not a real Telegram user/channel).`);
    }
  }

  if (reasons.length > 0) {
    return { action: "purge", reasons };
  }

  return { action: "keep", reasons: [] };
}

/**
 * Audit the entire delivery queue. Returns actionable results without modifying anything.
 * @param {string} queueDir   — path to delivery-queue/
 * @param {string} failedDir  — path to delivery-queue/failed/
 * @param {object} jobsData   — parsed jobs.json
 * @returns {Promise<{ keep: object[], purge: object[], skip: object[], errors: string[] }>}
 */
export async function auditDeliveryQueue(queueDir, failedDir, jobsData) {
  // Build job maps
  let jobs = [];
  if (Array.isArray(jobsData)) {
    jobs = jobsData;
  } else if (jobsData && typeof jobsData === "object") {
    if (Array.isArray(jobsData.jobs)) jobs = jobsData.jobs;
    else jobs = Object.entries(jobsData).map(([id, v]) => ({ id, ...v }));
  }

  const validJobIds = new Set(jobs.map(j => j.id));
  const jobsMap = Object.fromEntries(jobs.map(j => [j.id, j]));

  const allErrors = [];
  const keep = [];
  const purge = [];
  const skip = [];

  // Audit pending queue
  const { entries: pending, errors: pendingErrors } = await loadQueueEntries(queueDir);
  allErrors.push(...pendingErrors);
  for (const entry of pending) {
    const result = classifyQueueEntry(entry, validJobIds, jobsMap);
    entry.classification = result;
    if (result.action === "keep") keep.push(entry);
    else if (result.action === "purge") purge.push(entry);
    else skip.push(entry);
  }

  // Audit failed queue
  const { entries: failed, errors: failedErrors } = await loadQueueEntries(failedDir);
  allErrors.push(...failedErrors);
  for (const entry of failed) {
    const result = classifyQueueEntry(entry, validJobIds, jobsMap);
    entry.classification = result;
    // Failed entries should generally be purged
    purge.push(entry);
  }

  return { keep, purge, skip, errors: allErrors };
}

/**
 * Purge entries marked for removal. Moves to a .purged/ archive by default.
 * @param {object[]} entries — entries with .path
 * @param {string}   archiveDir — where to move purged files (or null to delete)
 * @returns {Promise<{ purged: number, errors: string[] }>}
 */
export async function purgeEntries(entries, archiveDir) {
  const errors = [];
  let purged = 0;

  if (archiveDir) {
    try {
      await mkdir(archiveDir, { recursive: true });
    } catch (err) {
      errors.push(`Cannot create archive dir ${archiveDir}: ${err.message}`);
      return { purged, errors };
    }
  }

  for (const entry of entries) {
    try {
      if (archiveDir) {
        // Move to archive (copy then delete)
        const content = await readFile(entry.path, "utf-8");
        const archivePath = join(archiveDir, `purged-${Date.now()}-${entry.file}`);
        const { writeFile } = await import("node:fs/promises");
        await writeFile(archivePath, content, "utf-8");
      }
      await unlink(entry.path);
      purged++;
    } catch (err) {
      if (err.code !== "ENOENT") {
        errors.push(`Failed to purge ${entry.file}: ${err.message}`);
      }
    }
  }

  return { purged, errors };
}
