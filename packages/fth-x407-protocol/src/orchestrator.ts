/**
 * x407 Orchestrator
 *
 * Unified entry point for the x407 Monetization & Trust Operating Layer.
 * Coordinates the full lifecycle of AI‑to‑AI commerce:
 *
 *   authenticate()  → Challenge‑response identity verification
 *   authorize()     → Policy + trust + compliance gate
 *   openSession()   → Create metered session with spend limits
 *   meter()         → Record usage against active session
 *   settleSession() → Close session, generate revenue events + receipt
 *   audit()         → Append to tamper‑evident audit chain
 *
 * All amounts are bigint strings with 18 decimal places.
 */

import { ChallengeEngine } from "./challenge";
import { TrustRegistry } from "./trust";
import { SessionManager } from "./session";
import { RevenueRouter, type RevenueRouterConfig } from "./revenue";
import { ComplianceGateway } from "./compliance";
import { AuditTrail } from "./audit";
import type {
  ChallengeResponse,
  ChallengeType,
  ComplianceContext,
  ComplianceRule,
  ComplianceVerdict,
  FeeSchedule,
  RevenueEvent,
  TrustProfile,
  TrustTier,
  X407Challenge,
  X407Config,
  X407Session,
} from "./types";
import { DEFAULT_CONFIG, X407_PROTOCOL_VERSION } from "./types";

// ─── Result Types ────────────────────────────────────────────────────

export interface AuthenticateResult {
  success: boolean;
  challenge?: X407Challenge;
  error?: string;
}

export interface AuthorizeResult {
  authorized: boolean;
  trustProfile: TrustProfile;
  complianceVerdict: ComplianceVerdict;
  effectiveTier: TrustTier;
  sessionSpendLimit: string;
  error?: string;
}

export interface OpenSessionResult {
  session: X407Session;
  sessionToken: string;
}

export interface SettleResult {
  session: X407Session;
  revenueEvents: RevenueEvent[];
  receiptId: string;
}

// ─── Orchestrator ────────────────────────────────────────────────────

export class X407Orchestrator {
  readonly protocolVersion = X407_PROTOCOL_VERSION;
  readonly challenge: ChallengeEngine;
  readonly trust: TrustRegistry;
  readonly sessions: SessionManager;
  readonly revenue: RevenueRouter;
  readonly compliance: ComplianceGateway;
  readonly audit: AuditTrail;

  constructor(config: X407Config) {
    this.challenge = new ChallengeEngine({
      serverSecretHex: config.signingKeyHex,
      ttlSeconds: config.challengeTtlSeconds,
    });

    this.trust = new TrustRegistry(config.trustTierThresholds);

    this.sessions = new SessionManager({
      signingKeyHex: config.signingKeyHex,
      defaultSpendLimit: config.defaultSessionSpendLimit,
      defaultRequestLimit: config.defaultSessionRequestLimit,
      defaultTtlSeconds: config.sessionTtlSeconds,
    });

    const revenueConfig: RevenueRouterConfig = {
      defaultSchedule: config.defaultFeeSchedule,
      destinations: {
        facilitatorWallet: "",  // Set via setDestinations()
        treasuryWallet: "",
        burnAddress: "",
        lpPoolId: "",
      },
    };
    this.revenue = new RevenueRouter(revenueConfig);

    this.compliance = new ComplianceGateway(config.complianceRules);

    this.audit = new AuditTrail();
  }

  // ── 1. Authenticate ──────────────────────────────────────────────

  /**
   * Issue a challenge to an agent.
   * The agent must respond with a signed proof before proceeding.
   */
  issueChallenge(params: {
    agentId: string;
    serviceId: string;
    type?: ChallengeType;
    minTrustTier?: TrustTier;
    minBalance?: string;
  }): X407Challenge {
    const ch = this.challenge.issue({
      type: params.type ?? "identity",
      subjectAgentId: params.agentId,
      issuerServiceId: params.serviceId,
      minTrustTier: params.minTrustTier,
      minBalance: params.minBalance,
    });

    this.audit.record({
      severity: "info",
      action: "challenge.issued",
      actorAgentId: params.serviceId,
      targetId: params.agentId,
      targetType: "agent",
      data: { challengeId: ch.challengeId, type: ch.type },
    });

    return ch;
  }

  /**
   * Verify a challenge response.
   * On success, the agent is authenticated and can proceed to authorization.
   */
  async authenticate(response: ChallengeResponse): Promise<AuthenticateResult> {
    const result = await this.challenge.verify(response);

    this.audit.record({
      severity: result.verified ? "info" : "warn",
      action: result.verified ? "challenge.verified" : "challenge.failed",
      actorAgentId: response.respondentAgentId,
      targetId: response.challengeId,
      targetType: "challenge",
      data: { error: result.error },
    });

    if (!result.verified) {
      return { success: false, error: result.error };
    }

    // Auto-register agent in trust registry if not already known
    if (!this.trust.getProfile(response.respondentAgentId)) {
      this.trust.register(response.respondentAgentId);
    }

    return { success: true, challenge: result.challenge };
  }

  // ── 2. Authorize ─────────────────────────────────────────────────

  /**
   * Evaluate whether an agent is authorized for a transaction.
   * Checks trust score, compliance rules, and spending limits.
   */
  authorize(params: {
    agentId: string;
    context: ComplianceContext;
    requiredTier?: TrustTier;
  }): AuthorizeResult {
    // Ensure agent is registered
    let profile = this.trust.getProfile(params.agentId);
    if (!profile) {
      profile = this.trust.register(params.agentId);
    }

    // Trust tier check
    const requiredTier = params.requiredTier ?? "provisional";
    const requiredScore = this.trust["thresholds"][requiredTier];
    if (profile.trustScore < requiredScore) {
      this.audit.record({
        severity: "warn",
        action: "authorize.denied.trust",
        actorAgentId: params.agentId,
        data: {
          trustScore: profile.trustScore,
          requiredTier,
          requiredScore,
        },
      });
      return {
        authorized: false,
        trustProfile: profile,
        complianceVerdict: "cleared",
        effectiveTier: profile.tier,
        sessionSpendLimit: "0",
        error: `Trust score ${profile.trustScore} below ${requiredTier} threshold (${requiredScore})`,
      };
    }

    // Compliance check
    const complianceResult = this.compliance.evaluate(
      params.agentId,
      params.context,
      profile,
      "pre_transaction"
    );

    if (
      complianceResult.verdict === "blocked" ||
      complianceResult.verdict === "sanctions_hit"
    ) {
      this.audit.record({
        severity: "critical",
        action: "authorize.denied.compliance",
        actorAgentId: params.agentId,
        data: {
          verdict: complianceResult.verdict,
          rules: complianceResult.triggeredRules,
        },
      });
      return {
        authorized: false,
        trustProfile: profile,
        complianceVerdict: complianceResult.verdict,
        effectiveTier: profile.tier,
        sessionSpendLimit: "0",
        error: complianceResult.details,
      };
    }

    // Calculate session spend limit based on trust tier
    const spendLimit = this.tierSpendLimit(profile.tier);

    this.audit.record({
      severity: complianceResult.verdict === "flagged" ? "warn" : "info",
      action: "authorize.granted",
      actorAgentId: params.agentId,
      data: {
        tier: profile.tier,
        score: profile.trustScore,
        complianceVerdict: complianceResult.verdict,
        spendLimit,
      },
    });

    return {
      authorized: true,
      trustProfile: profile,
      complianceVerdict: complianceResult.verdict,
      effectiveTier: profile.tier,
      sessionSpendLimit: spendLimit,
    };
  }

  // ── 3. Open Session ──────────────────────────────────────────────

  /**
   * Create a metered session after successful authentication + authorization.
   */
  openSession(params: {
    agentId: string;
    namespace: string;
    trustTier: TrustTier;
    spendLimit?: string;
    ttlSeconds?: number;
  }): OpenSessionResult {
    const session = this.sessions.create({
      agentId: params.agentId,
      namespace: params.namespace,
      trustTier: params.trustTier,
      spendLimit: params.spendLimit,
      ttlSeconds: params.ttlSeconds,
    });

    const sessionToken = this.sessions.signSessionToken(session.sessionId);

    this.audit.record({
      severity: "info",
      action: "session.opened",
      actorAgentId: params.agentId,
      sessionId: session.sessionId,
      data: {
        namespace: params.namespace,
        spendLimit: session.spendLimit,
        expiresAt: session.expiresAt,
      },
    });

    return { session, sessionToken };
  }

  // ── 4. Meter ─────────────────────────────────────────────────────

  /**
   * Record a usage event against an active session.
   * Returns false if session is expired, over limit, or invalid.
   */
  meter(
    sessionId: string,
    event: {
      apiRequests?: number;
      aiTokens?: number;
      computeSeconds?: number;
      cost: string;
    }
  ): boolean {
    const ok = this.sessions.record(sessionId, event);

    if (!ok) {
      const session = this.sessions.get(sessionId);
      this.audit.record({
        severity: "warn",
        action: "meter.rejected",
        actorAgentId: session?.agentId ?? "unknown",
        sessionId,
        data: { reason: "session_invalid_or_limit_exceeded", cost: event.cost },
      });
    }

    return ok;
  }

  // ── 5. Settle Session ────────────────────────────────────────────

  /**
   * Close a session and generate revenue events.
   * Returns the settlement summary.
   */
  settleSession(
    sessionId: string,
    params: { asset: string; rail: string }
  ): SettleResult | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const receiptId = `rcpt_${sessionId}_${Date.now().toString(36)}`;

    // Generate revenue split
    const revenueEvents = this.revenue.recordSessionRevenue({
      sessionId,
      agentId: session.agentId,
      namespace: session.namespace,
      grossAmount: session.meteringAccumulator.totalCostAccrued,
      asset: params.asset,
      rail: params.rail,
    });

    // Close session
    const settled = this.sessions.settle(sessionId, receiptId);
    if (!settled) return undefined;

    // Record transaction in trust registry
    this.trust.recordTransaction(
      session.agentId,
      session.meteringAccumulator.totalCostAccrued
    );

    this.audit.record({
      severity: "info",
      action: "session.settled",
      actorAgentId: session.agentId,
      sessionId,
      data: {
        receiptId,
        totalCost: session.meteringAccumulator.totalCostAccrued,
        requests: session.requestCount,
        revenueEvents: revenueEvents.length,
      },
    });

    return { session: settled, revenueEvents, receiptId };
  }

  // ── Full Flow Helper ─────────────────────────────────────────────

  /**
   * Convenience: run the complete x407 flow in a single call.
   *
   *   1. Issue challenge
   *   2. (caller signs externally)
   *   3. Verify challenge response
   *   4. Authorize
   *   5. Open session
   *
   * Returns the session + token, or an error.
   */
  async authenticateAndOpen(params: {
    agentId: string;
    serviceId: string;
    namespace: string;
    challengeResponse: ChallengeResponse;
    transactionContext: ComplianceContext;
    requiredTier?: TrustTier;
    sessionTtl?: number;
  }): Promise<
    | { ok: true; session: X407Session; sessionToken: string }
    | { ok: false; error: string }
  > {
    // Verify challenge
    const authResult = await this.authenticate(params.challengeResponse);
    if (!authResult.success) {
      return { ok: false, error: authResult.error ?? "authentication_failed" };
    }

    // Authorize
    const authzResult = this.authorize({
      agentId: params.agentId,
      context: params.transactionContext,
      requiredTier: params.requiredTier,
    });
    if (!authzResult.authorized) {
      return { ok: false, error: authzResult.error ?? "authorization_denied" };
    }

    // Open session
    const { session, sessionToken } = this.openSession({
      agentId: params.agentId,
      namespace: params.namespace,
      trustTier: authzResult.effectiveTier,
      spendLimit: authzResult.sessionSpendLimit,
      ttlSeconds: params.sessionTtl,
    });

    return { ok: true, session, sessionToken };
  }

  // ── Tier‑Based Spend Limits ──────────────────────────────────────

  private tierSpendLimit(tier: TrustTier): string {
    // All values are bigint strings (18 decimals)
    const limits: Record<TrustTier, string> = {
      untrusted: "0",                                 // cannot transact
      provisional: "100000000000000000000",            // 100 UNY
      standard: "1000000000000000000000",              // 1,000 UNY
      trusted: "10000000000000000000000",              // 10,000 UNY
      elite: "100000000000000000000000",               // 100,000 UNY
      institutional: "1000000000000000000000000",      // 1,000,000 UNY
    };
    return limits[tier];
  }

  // ── Periodic Maintenance ─────────────────────────────────────────

  /**
   * Call periodically (e.g., every 60s) to clean up expired state.
   */
  maintenance(): { expiredChallenges: number; expiredSessions: number } {
    const expiredChallenges = this.challenge.purgeExpired();
    const expiredSessions = this.sessions.purgeExpired();
    return { expiredChallenges, expiredSessions };
  }

  // ── Stats ────────────────────────────────────────────────────────

  stats(): {
    activeSessions: number;
    trustedAgents: number;
    totalAuditEntries: number;
    totalRevenueEvents: number;
    auditChainIntact: boolean;
  } {
    return {
      activeSessions: this.sessions.getActive().length,
      trustedAgents: this.trust.size,
      totalAuditEntries: this.audit.size,
      totalRevenueEvents: this.revenue.totalEvents,
      auditChainIntact: this.audit.verifyChain() === -1,
    };
  }
}
