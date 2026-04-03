/**
 * x407 Session Manager
 *
 * After a challenge is verified, the SessionManager issues a metered
 * session that tracks spend, request count, and accumulates metering
 * events until the session is settled.
 */

import { createHmac, randomBytes } from "crypto";
import type {
  MeteringAccumulator,
  SessionStatus,
  TrustTier,
  X407Session,
} from "./types";

export interface SessionCreateParams {
  agentId: string;
  namespace: string;
  trustTier: TrustTier;
  spendLimit?: string;        // override default
  requestLimit?: number;      // override default
  ttlSeconds?: number;        // override default
}

export class SessionManager {
  private readonly sessions = new Map<string, X407Session>();
  private readonly signingKey: Buffer;
  private readonly defaultSpendLimit: string;
  private readonly defaultRequestLimit: number;
  private readonly defaultTtl: number;

  constructor(opts: {
    signingKeyHex: string;
    defaultSpendLimit?: string;
    defaultRequestLimit?: number;
    defaultTtlSeconds?: number;
  }) {
    this.signingKey = Buffer.from(opts.signingKeyHex, "hex");
    this.defaultSpendLimit = opts.defaultSpendLimit ?? "1000000000000000000000"; // 1000 UNY
    this.defaultRequestLimit = opts.defaultRequestLimit ?? 10000;
    this.defaultTtl = opts.defaultTtlSeconds ?? 3600;
  }

  // ── Create ───────────────────────────────────────────────────────
  create(params: SessionCreateParams): X407Session {
    const sessionId = randomBytes(16).toString("hex");
    const now = new Date();
    const ttl = params.ttlSeconds ?? this.defaultTtl;

    const session: X407Session = {
      sessionId,
      agentId: params.agentId,
      namespace: params.namespace,
      trustTierAtCreation: params.trustTier,
      spendLimit: params.spendLimit ?? this.defaultSpendLimit,
      spendUsed: "0",
      requestLimit: params.requestLimit ?? this.defaultRequestLimit,
      requestCount: 0,
      meteringAccumulator: {
        apiRequests: 0,
        aiTokensConsumed: 0,
        computeSeconds: 0,
        totalCostAccrued: "0",
      },
      status: "active",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
      lastActivityAt: now.toISOString(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  // ── Validation ───────────────────────────────────────────────────
  /**
   * Validate that a session is active and has budget remaining.
   * Returns the session or an error string.
   */
  validate(sessionId: string): { ok: true; session: X407Session } | { ok: false; error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { ok: false, error: "session_not_found" };
    if (session.status !== "active") return { ok: false, error: `session_${session.status}` };
    if (new Date(session.expiresAt) < new Date()) {
      session.status = "expired";
      return { ok: false, error: "session_expired" };
    }
    if (BigInt(session.spendUsed) >= BigInt(session.spendLimit)) {
      return { ok: false, error: "spend_limit_reached" };
    }
    if (session.requestCount >= session.requestLimit) {
      return { ok: false, error: "request_limit_reached" };
    }
    return { ok: true, session };
  }

  // ── Metering ─────────────────────────────────────────────────────
  /**
   * Record a metered event against a session.
   * Returns false if the session is invalid or if limits would be exceeded.
   */
  record(
    sessionId: string,
    event: {
      apiRequests?: number;
      aiTokens?: number;
      computeSeconds?: number;
      cost: string; // bigint string
    }
  ): boolean {
    const check = this.validate(sessionId);
    if (!check.ok) return false;
    const session = check.session;

    // Pre-flight spend check
    const newSpend = BigInt(session.spendUsed) + BigInt(event.cost);
    if (newSpend > BigInt(session.spendLimit)) return false;

    session.spendUsed = newSpend.toString();
    session.requestCount += event.apiRequests ?? 1;
    session.lastActivityAt = new Date().toISOString();

    const acc = session.meteringAccumulator;
    acc.apiRequests += event.apiRequests ?? 1;
    acc.aiTokensConsumed += event.aiTokens ?? 0;
    acc.computeSeconds += event.computeSeconds ?? 0;
    acc.totalCostAccrued = (BigInt(acc.totalCostAccrued) + BigInt(event.cost)).toString();

    return true;
  }

  // ── Session Controls ─────────────────────────────────────────────
  pause(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return false;
    session.status = "paused";
    return true;
  }

  resume(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "paused") return false;
    session.status = "active";
    return true;
  }

  revoke(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.status = "revoked";
    return true;
  }

  /**
   * Settle a session — freeze it and return the final accumulator
   * for the RevenueRouter to process.
   */
  settle(sessionId: string, receiptId: string): X407Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (session.status === "settled") return session;

    session.status = "settled";
    session.settledAt = new Date().toISOString();
    session.settlementReceiptId = receiptId;
    return session;
  }

  // ── Queries ──────────────────────────────────────────────────────
  get(sessionId: string): X407Session | undefined {
    return this.sessions.get(sessionId);
  }

  getByAgent(agentId: string): X407Session[] {
    return [...this.sessions.values()].filter((s) => s.agentId === agentId);
  }

  getActive(): X407Session[] {
    return [...this.sessions.values()].filter((s) => s.status === "active");
  }

  /** Sign a session token (for bearer auth on downstream calls). */
  signSessionToken(sessionId: string): string {
    return createHmac("sha256", this.signingKey)
      .update(sessionId)
      .digest("hex");
  }

  /** Verify a session token. */
  verifySessionToken(sessionId: string, token: string): boolean {
    const expected = this.signSessionToken(sessionId);
    if (expected.length !== token.length) return false;
    // Constant-time comparison
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return diff === 0;
  }

  /** Evict all expired sessions. */
  purgeExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (
        session.status === "active" &&
        new Date(session.expiresAt).getTime() < now
      ) {
        session.status = "expired";
        count++;
      }
    }
    return count;
  }

  get size(): number {
    return this.sessions.size;
  }
}
