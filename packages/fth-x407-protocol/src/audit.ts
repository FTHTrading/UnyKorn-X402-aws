/**
 * x407 Audit Trail
 *
 * Immutable, hash‑chained audit log for every significant action
 * in the x407 protocol.  Each entry contains a SHA‑256 hash of
 * the previous entry, forming a tamper‑evident chain.
 */

import { createHash, randomBytes } from "crypto";
import type { AuditSeverity, X407AuditEntry } from "./types";

export class AuditTrail {
  private readonly entries: X407AuditEntry[] = [];
  private previousHash = "0".repeat(64);

  // ── Write ────────────────────────────────────────────────────────

  record(params: {
    severity: AuditSeverity;
    action: string;
    actorAgentId: string;
    targetId?: string;
    targetType?: string;
    sessionId?: string;
    data?: Record<string, unknown>;
  }): X407AuditEntry {
    const entryId = randomBytes(12).toString("hex");
    const timestamp = new Date().toISOString();

    const payload =
      entryId +
      params.action +
      params.actorAgentId +
      (params.targetId ?? "") +
      timestamp +
      this.previousHash;

    const entryHash = createHash("sha256").update(payload).digest("hex");

    const entry: X407AuditEntry = {
      entryId,
      severity: params.severity,
      action: params.action,
      actorAgentId: params.actorAgentId,
      targetId: params.targetId,
      targetType: params.targetType,
      sessionId: params.sessionId,
      data: params.data ?? {},
      previousHash: this.previousHash,
      entryHash,
      timestamp,
    };

    this.previousHash = entryHash;
    this.entries.push(entry);
    return entry;
  }

  // ── Integrity ────────────────────────────────────────────────────

  /**
   * Walk the entire chain and verify hash continuity.
   * Returns the index of the first broken link, or -1 if intact.
   */
  verifyChain(): number {
    let prevHash = "0".repeat(64);

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      if (entry.previousHash !== prevHash) return i;

      const expectedHash = createHash("sha256")
        .update(
          entry.entryId +
            entry.action +
            entry.actorAgentId +
            (entry.targetId ?? "") +
            entry.timestamp +
            entry.previousHash
        )
        .digest("hex");

      if (entry.entryHash !== expectedHash) return i;
      prevHash = entry.entryHash;
    }

    return -1; // intact
  }

  // ── Queries ──────────────────────────────────────────────────────

  getAll(limit?: number): X407AuditEntry[] {
    if (limit) return this.entries.slice(-limit);
    return [...this.entries];
  }

  getByAgent(agentId: string, limit?: number): X407AuditEntry[] {
    const matched = this.entries.filter((e) => e.actorAgentId === agentId);
    return limit ? matched.slice(-limit) : matched;
  }

  getBySession(sessionId: string): X407AuditEntry[] {
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  getBySeverity(severity: AuditSeverity): X407AuditEntry[] {
    return this.entries.filter((e) => e.severity === severity);
  }

  get(entryId: string): X407AuditEntry | undefined {
    return this.entries.find((e) => e.entryId === entryId);
  }

  get size(): number {
    return this.entries.length;
  }

  get headHash(): string {
    return this.previousHash;
  }

  /** Export for persistence. */
  exportAll(): X407AuditEntry[] {
    return [...this.entries];
  }

  /** Bulk import (restores chain state). */
  importAll(entries: X407AuditEntry[]): void {
    this.entries.length = 0;
    this.entries.push(...entries);
    this.previousHash = entries.length > 0
      ? entries[entries.length - 1].entryHash
      : "0".repeat(64);
  }
}
