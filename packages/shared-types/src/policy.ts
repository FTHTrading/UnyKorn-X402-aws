/**
 * @unykorn/shared-types — Policy Engine Models
 *
 * Policy rules, decisions, and enforcement types.
 * Every agent action must be policy-scoped, permissioned, and logged.
 */

// ═══════════════════════════════════════════════════════════
// Policy Rule
// ═══════════════════════════════════════════════════════════

export type PolicyEffect = "allow" | "deny" | "require_approval" | "rate_limit" | "audit_only";
export type PolicyScope = "global" | "org" | "role" | "agent" | "task";

export interface PolicyRule {
  ruleId: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Effect when rule matches */
  effect: PolicyEffect;
  /** Scope of this rule */
  scope: PolicyScope;
  /** Priority — lower number = higher priority */
  priority: number;
  /** Conditions that must all be true for this rule to apply */
  conditions: PolicyCondition[];
  /** Actions this rule applies to */
  actions: string[];
  /** Agent roles this rule applies to */
  targetRoles: string[] | null; // null = all roles
  /** Maximum spend this rule allows (bigint string) */
  maxSpend: string | null;
  /** Restricted jurisdictions */
  restrictedJurisdictions: string[];
  /** Is this rule active? */
  active: boolean;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

export interface PolicyCondition {
  /** Field to evaluate (dot-notation path) */
  field: string;
  /** Operator */
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "contains" | "regex";
  /** Value to compare against */
  value: string | number | boolean | string[];
}

// ═══════════════════════════════════════════════════════════
// Policy Decision
// ═══════════════════════════════════════════════════════════

export type PolicyDecisionResult = "allowed" | "denied" | "pending_approval" | "rate_limited";

export interface PolicyDecision {
  decisionId: string;
  /** The action being evaluated */
  action: string;
  /** Agent requesting the action */
  agentId: string;
  /** Agent role at time of decision */
  agentRole: string;
  /** Task ID if task-related */
  taskId: string | null;
  /** Amount involved (bigint string) */
  amount: string | null;
  /** Result */
  result: PolicyDecisionResult;
  /** Rules that matched */
  matchedRules: string[];
  /** The rule that determined the final decision */
  decidingRuleId: string;
  /** Reason for the decision */
  reason: string;
  /** If pending_approval, who needs to approve */
  requiredApprover: string | null;
  /** ISO timestamp */
  evaluatedAt: string;
  /** Was this decision overridden by a human? */
  overridden: boolean;
  /** Override details if applicable */
  overrideBy: string | null;
  overrideReason: string | null;
  overrideAt: string | null;
}

// ═══════════════════════════════════════════════════════════
// Policy Approval
// ═══════════════════════════════════════════════════════════

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "escalated";

export interface PolicyApproval {
  approvalId: string;
  /** Decision this approval is for */
  decisionId: string;
  /** Agent or human who needs to approve */
  approverId: string;
  /** Status */
  status: ApprovalStatus;
  /** Reason for approval/denial */
  reason: string | null;
  /** ISO timestamps */
  requestedAt: string;
  respondedAt: string | null;
  expiresAt: string;
}

// ═══════════════════════════════════════════════════════════
// Emergency Controls
// ═══════════════════════════════════════════════════════════

export interface EmergencyPause {
  pauseId: string;
  /** What is paused */
  scope: "global" | "agent" | "role" | "mcp_server" | "a2a_route";
  /** Target ID (agent ID, role name, etc.) */
  targetId: string;
  /** Who initiated the pause */
  initiatedBy: string;
  /** Reason */
  reason: string;
  /** Is this pause active? */
  active: boolean;
  /** ISO timestamps */
  startedAt: string;
  endedAt: string | null;
}

// ═══════════════════════════════════════════════════════════
// Audit Log
// ═══════════════════════════════════════════════════════════

export type AuditAction =
  | "agent.create"
  | "agent.update"
  | "agent.pause"
  | "agent.revoke"
  | "agent.kill"
  | "task.create"
  | "task.execute"
  | "task.settle"
  | "task.dispute"
  | "task.escalate"
  | "budget.reserve"
  | "budget.spend"
  | "budget.refund"
  | "escrow.lock"
  | "escrow.release"
  | "escrow.refund"
  | "policy.evaluate"
  | "policy.override"
  | "approval.request"
  | "approval.grant"
  | "approval.deny"
  | "mcp.invoke"
  | "a2a.send"
  | "a2a.receive"
  | "treasury.deposit"
  | "treasury.withdraw"
  | "treasury.refill"
  | "emergency.pause"
  | "emergency.resume"
  | "receipt.sign"
  | "receipt.verify";

export interface AuditEntry {
  /** Unique entry ID */
  entryId: string;
  /** Monotonically increasing sequence */
  sequence: bigint;
  /** Action type */
  action: AuditAction;
  /** Agent that performed or triggered the action */
  agentId: string;
  /** Target entity ID */
  targetId: string | null;
  /** Target entity type */
  targetType: string | null;
  /** Amount involved (bigint string) */
  amount: string | null;
  /** Policy decision ID if applicable */
  policyDecisionId: string | null;
  /** Result of the action */
  result: "success" | "failure" | "partial";
  /** Details */
  details: Record<string, unknown>;
  /** IP/source */
  source: string;
  /** ISO timestamp */
  timestamp: string;
  /** Hash for audit chain integrity */
  entryHash: string;
  /** Previous entry hash */
  previousHash: string;
}
