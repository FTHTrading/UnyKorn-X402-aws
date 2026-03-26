/**
 * @unykorn/policy-engine — Policy Evaluation & Enforcement
 *
 * Every agent action must be policy-scoped, permissioned, and logged.
 * The policy engine evaluates rules against agent context and returns decisions.
 */

import { nanoid } from "nanoid";
import type {
  PolicyRule,
  PolicyCondition,
  PolicyDecision,
  PolicyDecisionResult,
  PolicyEffect,
  PolicyApproval,
  EmergencyPause,
  AuditEntry,
  AuditAction,
} from "@unykorn/shared-types";

export class PolicyEngine {
  private rules: PolicyRule[] = [];
  private decisions = new Map<string, PolicyDecision>();
  private approvals = new Map<string, PolicyApproval>();
  private pauses = new Map<string, EmergencyPause>();
  private auditLog: AuditEntry[] = [];
  private auditSequence = 0n;
  private lastAuditHash = "audit:genesis";

  // ── Rule Management ──────────────────────────────────────

  addRule(params: Omit<PolicyRule, "ruleId" | "createdAt" | "updatedAt">): PolicyRule {
    const rule: PolicyRule = {
      ...params,
      ruleId: `rule:${nanoid(8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
    return rule;
  }

  // ── Evaluate ─────────────────────────────────────────────

  /**
   * Evaluate an action against all active rules.
   * Context should include: agentId, role, amount, action, taskId, etc.
   */
  evaluate(context: {
    agentId: string;
    agentRole: string;
    action: string;
    amount?: string;
    taskId?: string;
    metadata?: Record<string, unknown>;
  }): PolicyDecision {
    // Check emergency pauses first
    const globalPause = [...this.pauses.values()].find(
      (p) => p.active && p.scope === "global",
    );
    if (globalPause) {
      return this.createDecision(
        context,
        "denied",
        [],
        "emergency-pause",
        `Global emergency pause: ${globalPause.reason}`,
      );
    }

    const agentPause = [...this.pauses.values()].find(
      (p) => p.active && p.scope === "agent" && p.targetId === context.agentId,
    );
    if (agentPause) {
      return this.createDecision(
        context,
        "denied",
        [],
        "emergency-pause",
        `Agent paused: ${agentPause.reason}`,
      );
    }

    const matchedRules: PolicyRule[] = [];
    for (const rule of this.rules) {
      if (!rule.active) continue;
      if (rule.actions.length > 0 && !rule.actions.includes(context.action)) continue;
      if (
        rule.targetRoles &&
        rule.targetRoles.length > 0 &&
        !rule.targetRoles.includes(context.agentRole)
      )
        continue;
      if (rule.maxSpend && context.amount && BigInt(context.amount) > BigInt(rule.maxSpend)) {
        matchedRules.push(rule);
        continue;
      }
      if (this.evaluateConditions(rule.conditions, context)) {
        matchedRules.push(rule);
      }
    }

    if (matchedRules.length === 0) {
      // Default: allow with audit
      return this.createDecision(
        context,
        "allowed",
        [],
        "default-allow",
        "No matching rules, default allow",
      );
    }

    // First matching rule (sorted by priority) decides
    const decidingRule = matchedRules[0];
    const result = this.effectToResult(decidingRule.effect);
    const ruleIds = matchedRules.map((r) => r.ruleId);

    return this.createDecision(
      context,
      result,
      ruleIds,
      decidingRule.ruleId,
      `Rule: ${decidingRule.name}`,
    );
  }

  // ── Emergency Pause / Resume ─────────────────────────────

  emergencyPause(
    scope: EmergencyPause["scope"],
    targetId: string,
    initiatedBy: string,
    reason: string,
  ): EmergencyPause {
    const pause: EmergencyPause = {
      pauseId: `pause:${nanoid(8)}`,
      scope,
      targetId,
      initiatedBy,
      reason,
      active: true,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    this.pauses.set(pause.pauseId, pause);
    return pause;
  }

  emergencyResume(pauseId: string): boolean {
    const pause = this.pauses.get(pauseId);
    if (!pause) return false;
    pause.active = false;
    pause.endedAt = new Date().toISOString();
    return true;
  }

  // ── Audit Logging ────────────────────────────────────────

  audit(params: {
    action: AuditAction;
    agentId: string;
    targetId?: string;
    targetType?: string;
    amount?: string;
    policyDecisionId?: string;
    result: "success" | "failure" | "partial";
    details?: Record<string, unknown>;
    source?: string;
  }): AuditEntry {
    this.auditSequence += 1n;
    const entry: AuditEntry = {
      entryId: `audit:${nanoid(12)}`,
      sequence: this.auditSequence,
      action: params.action,
      agentId: params.agentId,
      targetId: params.targetId ?? null,
      targetType: params.targetType ?? null,
      amount: params.amount ?? null,
      policyDecisionId: params.policyDecisionId ?? null,
      result: params.result,
      details: params.details ?? {},
      source: params.source ?? "system",
      timestamp: new Date().toISOString(),
      entryHash: `hash:${nanoid(16)}`,
      previousHash: this.lastAuditHash,
    };
    this.auditLog.push(entry);
    this.lastAuditHash = entry.entryHash;
    return entry;
  }

  // ── Queries ──────────────────────────────────────────────

  getDecision(id: string): PolicyDecision | undefined {
    return this.decisions.get(id);
  }
  getRules(): PolicyRule[] {
    return [...this.rules];
  }
  getActiveRules(): PolicyRule[] {
    return this.rules.filter((r) => r.active);
  }
  getAuditLog(limit = 100): AuditEntry[] {
    return this.auditLog.slice(-limit);
  }
  getActivePauses(): EmergencyPause[] {
    return [...this.pauses.values()].filter((p) => p.active);
  }

  // ── Private Helpers ──────────────────────────────────────

  private createDecision(
    context: {
      agentId: string;
      agentRole: string;
      action: string;
      amount?: string;
      taskId?: string;
    },
    result: PolicyDecisionResult,
    matchedRules: string[],
    decidingRuleId: string,
    reason: string,
  ): PolicyDecision {
    const decision: PolicyDecision = {
      decisionId: `pd:${nanoid(10)}`,
      action: context.action,
      agentId: context.agentId,
      agentRole: context.agentRole,
      taskId: context.taskId ?? null,
      amount: context.amount ?? null,
      result,
      matchedRules,
      decidingRuleId,
      reason,
      requiredApprover: result === "pending_approval" ? "human:admin" : null,
      evaluatedAt: new Date().toISOString(),
      overridden: false,
      overrideBy: null,
      overrideReason: null,
      overrideAt: null,
    };
    this.decisions.set(decision.decisionId, decision);
    return decision;
  }

  private effectToResult(effect: PolicyEffect): PolicyDecisionResult {
    switch (effect) {
      case "allow":
        return "allowed";
      case "deny":
        return "denied";
      case "require_approval":
        return "pending_approval";
      case "rate_limit":
        return "rate_limited";
      case "audit_only":
        return "allowed";
    }
  }

  private evaluateConditions(
    conditions: PolicyCondition[],
    context: Record<string, unknown>,
  ): boolean {
    if (conditions.length === 0) return true;
    return conditions.every((c) => {
      const value = this.getNestedValue(context, c.field);
      if (value === undefined) return false;
      switch (c.operator) {
        case "eq":
          return value === c.value;
        case "neq":
          return value !== c.value;
        case "gt":
          return typeof value === "number" && typeof c.value === "number" && value > c.value;
        case "gte":
          return typeof value === "number" && typeof c.value === "number" && value >= c.value;
        case "lt":
          return typeof value === "number" && typeof c.value === "number" && value < c.value;
        case "lte":
          return typeof value === "number" && typeof c.value === "number" && value <= c.value;
        case "in":
          return Array.isArray(c.value) && c.value.includes(String(value));
        case "not_in":
          return Array.isArray(c.value) && !c.value.includes(String(value));
        case "contains":
          return (
            typeof value === "string" && typeof c.value === "string" && value.includes(c.value)
          );
        case "regex":
          return (
            typeof value === "string" &&
            typeof c.value === "string" &&
            new RegExp(c.value).test(value)
          );
        default:
          return false;
      }
    });
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((curr: unknown, key) => {
      if (curr && typeof curr === "object" && key in (curr as Record<string, unknown>)) {
        return (curr as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}
