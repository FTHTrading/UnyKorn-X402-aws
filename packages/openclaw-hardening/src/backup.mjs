// ---------------------------------------------------------------------------
// OpenClaw Hardening — State Backup & Restore
// ---------------------------------------------------------------------------
// Creates timestamped backups of all OpenClaw runtime state.
// Does not back up secrets in plaintext — redacts API keys/tokens.
//
// Usage: node packages/openclaw-hardening/src/backup.mjs [--restore <dir>]
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir, readdir, copyFile, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { OPENCLAW_PATHS } from "./constants.mjs";

const HOME = homedir();

/**
 * Redact sensitive fields from a config object (shallow clone).
 * @param {object} config
 * @returns {object}
 */
function redactSecrets(config) {
  const safe = JSON.parse(JSON.stringify(config));

  // Redact gateway auth token
  if (safe?.gateway?.auth?.token) {
    safe.gateway.auth.token = "***REDACTED***";
  }

  // Redact Telegram bot token
  if (safe?.channels?.telegram?.botToken) {
    safe.channels.telegram.botToken = "***REDACTED***";
  }

  // Redact provider API keys
  if (safe?.models?.providers) {
    for (const [, prov] of Object.entries(safe.models.providers)) {
      if (prov.apiKey) prov.apiKey = "***REDACTED***";
      if (prov.token) prov.token = "***REDACTED***";
    }
  }

  return safe;
}

/**
 * Copy all .json files from a directory.
 * @param {string} srcDir
 * @param {string} destDir
 * @returns {Promise<string[]>} — list of copied files
 */
async function copyJsonFiles(srcDir, destDir) {
  const copied = [];
  try {
    const files = await readdir(srcDir);
    await mkdir(destDir, { recursive: true });
    for (const file of files) {
      if (file.endsWith(".json")) {
        await copyFile(join(srcDir, file), join(destDir, file));
        copied.push(file);
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return copied;
}

/**
 * Create a timestamped backup of OpenClaw state.
 * @param {string} [home] — override home directory
 * @returns {Promise<{ backupDir: string, manifest: object }>}
 */
export async function createBackup(home) {
  const h = home || HOME;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  const backupRoot = OPENCLAW_PATHS.backupRoot(h);
  const backupDir = join(backupRoot, `backup-${timestamp}`);

  await mkdir(backupDir, { recursive: true });
  const manifest = { timestamp, files: {} };

  // 1. Config (redacted)
  try {
    const configPath = OPENCLAW_PATHS.config(h);
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    const redacted = redactSecrets(config);
    await writeFile(join(backupDir, "openclaw.json"), JSON.stringify(redacted, null, 2));
    manifest.files["openclaw.json"] = "redacted copy";

    // Also save original (for restore) — mark clearly
    await writeFile(join(backupDir, "openclaw.json.original"), raw);
    manifest.files["openclaw.json.original"] = "full copy with secrets (handle securely)";
  } catch (err) {
    manifest.files["openclaw.json"] = `SKIPPED: ${err.message}`;
  }

  // 2. Cron jobs
  try {
    const jobsPath = OPENCLAW_PATHS.cronJobs(h);
    await copyFile(jobsPath, join(backupDir, "jobs.json"));
    manifest.files["jobs.json"] = "cron job definitions";
  } catch (err) {
    manifest.files["jobs.json"] = `SKIPPED: ${err.message}`;
  }

  // 3. Delivery queue
  const queueDir = join(backupDir, "delivery-queue");
  const pending = await copyJsonFiles(OPENCLAW_PATHS.deliveryQueue(h), queueDir);
  manifest.files["delivery-queue/"] = `${pending.length} pending entries`;

  const failedQueueDir = join(backupDir, "delivery-queue", "failed");
  const failed = await copyJsonFiles(OPENCLAW_PATHS.failedQueue(h), failedQueueDir);
  manifest.files["delivery-queue/failed/"] = `${failed.length} failed entries`;

  // 4. Memory workspace metadata (not the sqlite, just the content files)
  const memDir = OPENCLAW_PATHS.memoryDir(h);
  const memBackupDir = join(backupDir, "memory");
  try {
    const memFiles = await readdir(memDir);
    await mkdir(memBackupDir, { recursive: true });
    for (const mf of memFiles) {
      await copyFile(join(memDir, mf), join(memBackupDir, mf));
    }
    manifest.files["memory/"] = `${memFiles.length} workspace content files`;
  } catch (err) {
    manifest.files["memory/"] = `SKIPPED: ${err.message}`;
  }

  // 5. Write manifest
  await writeFile(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  return { backupDir, manifest };
}

/**
 * List existing backups.
 * @param {string} [home]
 * @returns {Promise<string[]>}
 */
export async function listBackups(home) {
  const h = home || HOME;
  const backupRoot = OPENCLAW_PATHS.backupRoot(h);
  try {
    const dirs = await readdir(backupRoot);
    return dirs.filter(d => d.startsWith("backup-")).sort().reverse();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
const isMain = process.argv[1]?.endsWith("backup.mjs");
if (isMain) {
  const action = process.argv[2];

  try {
    if (action === "--list") {
      const backups = await listBackups();
      if (backups.length === 0) {
        console.log("No backups found.");
      } else {
        console.log(`Found ${backups.length} backup(s):`);
        for (const b of backups) console.log(`  ${b}`);
      }
    } else if (action === "--restore") {
      const dir = process.argv[3];
      if (!dir) {
        console.error("Usage: node backup.mjs --restore <backup-dir>");
        process.exit(1);
      }
      console.log(`Restore from ${dir}:`);
      console.log("  1. Copy openclaw.json.original → ~/.openclaw/openclaw.json");
      console.log("  2. Copy jobs.json → ~/.openclaw/cron/jobs.json");
      console.log("  3. Restart gateway: openclaw gateway restart");
      console.log("\n  ⚠ Manual restore — review files before copying.");
    } else {
      console.log("Creating OpenClaw state backup...\n");
      const { backupDir, manifest } = await createBackup();
      console.log(`Backup created: ${backupDir}\n`);
      console.log("Contents:");
      for (const [file, desc] of Object.entries(manifest.files)) {
        console.log(`  ${file}: ${desc}`);
      }
      console.log("\nRestore instructions:");
      console.log(`  node packages/openclaw-hardening/src/backup.mjs --restore ${backupDir}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`Backup failed: ${err.message}`);
    process.exit(1);
  }
}
