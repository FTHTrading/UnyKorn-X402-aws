/**
 * x407 Compliance Gateway
 *
 * Pre‑ and post‑transaction compliance checks that gate AI‑to‑AI
 * commerce.  Evaluates jurisdiction restrictions, transaction
 * thresholds, sanctions screening status, and KYC levels.
 *
 * Verdicts:
 *   cleared              — proceed
 *   flagged              — proceed but audit
 *   blocked              — deny immediately
 *   pending_review       — escalate to human compliance officer
 *   sanctions_hit        — hard block + report
 *   jurisdiction_restricted — geographic restriction
 */

import { randomBytes, createHash } from "crypto";
import type {
  ComplianceCheck,
  ComplianceContext,
  ComplianceRule,
  ComplianceVerdict,
  TrustProfile,
} from "./types";

export class ComplianceGateway {
  private readonly rules: ComplianceRule[] = [];
  private readonly checks: ComplianceCheck[] = [];
  /** Previous audit hash for chain integrity */
  private lastCheckHash = "0".repeat(64);

  constructor(initialRules?: ComplianceRule[]) {
    if (initialRules) {
      this.rules.push(...initialRules);
    }
  }

  // ── Rule Management ──────────────────────────────────────────────

  addRule(rule: ComplianceRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex((r) => r.ruleId === ruleId);
    if (idx < 0) return false;
    this.rules.splice(idx, 1);
    return true;
  }

  getActiveRules(): ComplianceRule[] {
    return this.rules.filter((r) => r.active);
  }

  // ── Evaluation ───────────────────────────────────────────────────

  /**
   * Run a full compliance check against all active rules.
   * Returns the worst‑case verdict across all matched rules.
   */
  evaluate(
    agentId: string,
    context: ComplianceContext,
    trustProfile?: TrustProfile,
    checkType: ComplianceCheck["checkType"] = "pre_transaction"
  ): ComplianceCheck {
    const triggeredRules: string[] = [];
    let worstVerdict: ComplianceVerdict = "cleared";
    const details: string[] = [];

    for (const rule of this.getActiveRules()) {
      const result = this.evaluateRule(rule, context, trustProfile);
      if (result.triggered) {
        triggeredRules.push(rule.ruleId);
        details.push(`[${rule.ruleId}] ${rule.name}: ${result.reason}`);

        const newVerdict = this.mapActionToVerdict(rule.action, result.reason);
        if (this.severityOf(newVerdict) > this.severityOf(worstVerdict)) {
          worstVerdict = newVerdict;
        }
      }
    }

    const check: ComplianceCheck = {
      checkId: randomBytes(12).toString("hex"),
      agentId,
      checkType,
      context,
      verdict: worstVerdict,
      triggeredRules,
      details: details.join("; ") || "No rules triggered",
      checkedAt: new Date().toISOString(),
    };

    // Append to audit chain
    this.lastCheckHash = createHash("sha256")
      .update(this.lastCheckHash + check.checkId + check.verdict + check.checkedAt)
      .digest("hex");

    this.checks.push(check);
    return check;
  }

  // ── Internal Rule Evaluation ─────────────────────────────────────

  private evaluateRule(
    rule: ComplianceRule,
    ctx: ComplianceContext,
    trust?: TrustProfile
  ): { triggered: boolean; reason: string } {
    // Threshold check
    if (rule.threshold && BigInt(ctx.amount) >= BigInt(rule.threshold)) {
      return {
        triggered: true,
        reason: `Amount ${ctx.amount} exceeds threshold ${rule.threshold}`,
      };
    }

    // Jurisdiction check — evaluate if rule's jurisdiction list is non-empty
    if (rule.jurisdictions.length > 0) {
      if (ctx.jurisdictionFrom && rule.jurisdictions.includes(ctx.jurisdictionFrom)) {
        return {
          triggered: true,
          reason: `Source jurisdiction ${ctx.jurisdictionFrom} restricted`,
        };
      }
      if (ctx.jurisdictionTo && rule.jurisdictions.includes(ctx.jurisdictionTo)) {
        return {
          triggered: true,
          reason: `Destination jurisdiction ${ctx.jurisdictionTo} restricted`,
        };
      }
    }

    // Sanctions screening — if trust profile says not cleared
    if (trust && !trust.sanctionsCleared && rule.action === "block") {
      return {
        triggered: true,
        reason: "Agent has not passed sanctions screening",
      };
    }

    // KYC level check — institutional rules require KYC ≥ 2
    if (
      trust &&
      rule.name.toLowerCase().includes("kyc") &&
      trust.kycLevel < 2
    ) {
      return {
        triggered: true,
        reason: `KYC level ${trust.kycLevel} below required minimum`,
      };
    }

    return { triggered: false, reason: "" };
  }

  private mapActionToVerdict(
    action: ComplianceRule["action"],
    reason: string
  ): ComplianceVerdict {
    if (reason.toLowerCase().includes("sanction")) return "sanctions_hit";
    if (reason.toLowerCase().includes("jurisdiction")) return "jurisdiction_restricted";

    switch (action) {
      case "block":
        return "blocked";
      case "flag":
        return "flagged";
      case "require_review":
        return "pending_review";
      case "log_only":
        return "cleared";
      default:
        return "cleared";
    }
  }

  private severityOf(verdict: ComplianceVerdict): number {
    const severity: Record<ComplianceVerdict, number> = {
      cleared: 0,
      flagged: 1,
      pending_review: 2,
      jurisdiction_restricted: 3,
      blocked: 4,
      sanctions_hit: 5,
    };
    return severity[verdict];
  }

  // ── Queries ──────────────────────────────────────────────────────

  getCheckHistory(agentId?: string, limit = 100): ComplianceCheck[] {
    const filtered = agentId
      ? this.checks.filter((c) => c.agentId === agentId)
      : this.checks;
    return filtered.slice(-limit);
  }

  getCheck(checkId: string): ComplianceCheck | undefined {
    return this.checks.find((c) => c.checkId === checkId);
  }

  /** Return the current audit chain hash (for integrity verification). */
  get auditChainHash(): string {
    return this.lastCheckHash;
  }
}
