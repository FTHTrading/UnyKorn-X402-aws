// ---------------------------------------------------------------------------
// OpenClaw Hardening — Delivery Mode Validation
// ---------------------------------------------------------------------------
// Single source of truth for delivery mode validation and normalization.
// "silent" is explicitly rejected — it was the root cause of ghost delivery
// attempts and misleading recovery behavior.
// ---------------------------------------------------------------------------

import {
  VALID_DELIVERY_MODES,
  NO_DELIVERY_MODE,
  KNOWN_INVALID_MODES,
} from "./constants.mjs";

/**
 * Normalize a delivery mode string: trim whitespace and lowercase.
 * Does NOT convert invalid modes — returns the normalized form for validation.
 * @param {string} mode
 * @returns {string}
 */
export function normalizeDeliveryMode(mode) {
  if (typeof mode !== "string") return String(mode);
  return mode.trim().toLowerCase();
}

/**
 * Validate a delivery mode. Returns { valid, mode, error }.
 * @param {string} rawMode
 * @returns {{ valid: boolean, mode: string, error?: string }}
 */
export function validateDeliveryMode(rawMode) {
  if (rawMode === undefined || rawMode === null) {
    return {
      valid: false,
      mode: String(rawMode),
      error: `Delivery mode is ${rawMode}. Must be one of: ${VALID_DELIVERY_MODES.join(", ")}. ` +
             `If no delivery is intended, use "${NO_DELIVERY_MODE}".`,
    };
  }

  const mode = normalizeDeliveryMode(rawMode);

  if (VALID_DELIVERY_MODES.includes(mode)) {
    return { valid: true, mode };
  }

  // Specific error for known-invalid modes
  if (KNOWN_INVALID_MODES.includes(mode)) {
    return {
      valid: false,
      mode,
      error: `"${rawMode}" is NOT a valid delivery mode. ` +
             `It was a known bug: "${mode}" falls through to default "announce" behavior, ` +
             `causing unwanted delivery attempts. ` +
             `Valid modes: ${VALID_DELIVERY_MODES.join(", ")}. ` +
             `For no delivery, use "${NO_DELIVERY_MODE}".`,
    };
  }

  return {
    valid: false,
    mode,
    error: `Invalid delivery mode "${rawMode}". ` +
           `Valid modes: ${VALID_DELIVERY_MODES.join(", ")}. ` +
           `For no delivery, use "${NO_DELIVERY_MODE}".`,
  };
}

/**
 * Check if a delivery mode means "do not deliver".
 * @param {string} mode — already-validated mode
 * @returns {boolean}
 */
export function isNoDelivery(mode) {
  return normalizeDeliveryMode(mode) === NO_DELIVERY_MODE;
}

/**
 * Validate all delivery modes in a jobs array.
 * @param {Array<{id: string, name?: string, delivery?: {mode?: string}}>} jobs
 * @returns {{ valid: boolean, results: Array<{jobId: string, jobName: string, result: object}> }}
 */
export function validateAllJobDeliveryModes(jobs) {
  const results = [];
  let allValid = true;

  for (const job of jobs) {
    const mode = job?.delivery?.mode;
    const result = validateDeliveryMode(mode);
    if (!result.valid) allValid = false;
    results.push({
      jobId: job.id || "unknown",
      jobName: job.name || job.label || job.id || "unnamed",
      result,
    });
  }

  return { valid: allValid, results };
}
