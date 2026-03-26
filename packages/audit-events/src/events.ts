/**
 * @unykorn/audit-events — Structured Audit Event Types
 *
 * Append-only audit trail types for the security layer.
 * Mirrors the audit_log table in rust-signer's SQLite store.
 */

/** Audit event categories — what kind of operation was attempted. */
export type AuditCategory =
  | "key_generate"
  | "key_rotate"
  | "key_revoke"
  | "sign_request"
  | "sign_reject"
  | "sign_success"
  | "verify"
  | "policy_evaluation"
  | "config_change"
  | "access_denied";

/** Audit event result. */
export type AuditResult = "success" | "rejected" | "error";

/**
 * A single audit event — immutable once created.
 */
export interface AuditEvent {
  id: string;
  timestamp: string; // ISO-8601
  category: AuditCategory;
  result: AuditResult;

  /** Which key was involved (if any). */
  keyId?: string;

  /** Wallet domain of the operation. */
  domain?: string;

  /** Who initiated the operation. */
  actorId: string;

  /** SHA-256 of the payload that was signed (if applicable). */
  payloadHash?: string;

  /** Human-readable reason / description. */
  reason: string;

  /** Structured metadata (action, amount, counterparty, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * Create an audit event with auto-generated timestamp.
 */
export function createAuditEvent(
  params: Omit<AuditEvent, "id" | "timestamp"> & { id?: string }
): AuditEvent {
  return {
    id: params.id ?? crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...params,
  };
}

/**
 * Create a key-generation audit event.
 */
export function auditKeyGenerate(
  keyId: string,
  domain: string,
  actorId: string
): AuditEvent {
  return createAuditEvent({
    category: "key_generate",
    result: "success",
    keyId,
    domain,
    actorId,
    reason: `generated key for domain ${domain}`,
  });
}

/**
 * Create a sign-success audit event.
 */
export function auditSignSuccess(
  keyId: string,
  domain: string,
  actorId: string,
  payloadHash: string,
  action: string
): AuditEvent {
  return createAuditEvent({
    category: "sign_success",
    result: "success",
    keyId,
    domain,
    actorId,
    payloadHash,
    reason: `signed ${action} for domain ${domain}`,
    metadata: { action },
  });
}

/**
 * Create a sign-rejection audit event.
 */
export function auditSignReject(
  keyId: string,
  domain: string,
  actorId: string,
  reason: string,
  action: string
): AuditEvent {
  return createAuditEvent({
    category: "sign_reject",
    result: "rejected",
    keyId,
    domain,
    actorId,
    reason,
    metadata: { action },
  });
}

/**
 * Create an access-denied audit event.
 */
export function auditAccessDenied(
  actorId: string,
  reason: string,
  metadata?: Record<string, unknown>
): AuditEvent {
  return createAuditEvent({
    category: "access_denied",
    result: "rejected",
    actorId,
    reason,
    metadata,
  });
}

/**
 * Minimal audit sink interface — implementations persist events.
 */
export interface AuditSink {
  /** Append an event. Must not throw; failures should be logged internally. */
  append(event: AuditEvent): Promise<void>;

  /** Query recent events. */
  recent(limit?: number): Promise<AuditEvent[]>;

  /** Query events for a specific key. */
  byKey(keyId: string, limit?: number): Promise<AuditEvent[]>;
}

/**
 * In-memory audit sink for development / testing.
 */
export class InMemoryAuditSink implements AuditSink {
  private readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async recent(limit = 50): Promise<AuditEvent[]> {
    return this.events.slice(-limit).reverse();
  }

  async byKey(keyId: string, limit = 50): Promise<AuditEvent[]> {
    return this.events
      .filter((e) => e.keyId === keyId)
      .slice(-limit)
      .reverse();
  }

  /** Total events stored (for testing). */
  get count(): number {
    return this.events.length;
  }
}
