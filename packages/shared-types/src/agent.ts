/**
 * @unykorn/shared-types — Agent Identity & Core Models
 *
 * Canonical types for agent identity, wallets, tasks, and budgets.
 * Every agent in the UnyKorn mesh is represented by these types.
 */

// ═══════════════════════════════════════════════════════════
// Agent Identity
// ═══════════════════════════════════════════════════════════

export type AgentStatus = "active" | "paused" | "revoked" | "draining";

export type AgentTier =
  | "control"      // Tier 1: can authorize or block
  | "execution"    // Tier 2: performs work
  | "intelligence" // Tier 3: observes and recommends
  | "interface";   // Tier 4: interacts with humans/external

export type AgentRole =
  | "treasury"
  | "compliance"
  | "policy"
  | "approval"
  | "risk"
  | "treasury-control"
  | "document-drafting"
  | "listing-packet"
  | "onboarding"
  | "wallet-ops"
  | "reconciliation"
  | "market-monitor"
  | "news-signals"
  | "counterparty-risk"
  | "anomaly-detection"
  | "concierge"
  | "portal"
  | "email-telecom"
  | "partner-api"
  | "exchange-listing"
  | "intelligence"
  | "incident-response"
  | "chain-ops"
  | "rwa-structuring"
  | "settlement"
  | "customer-desk"
  | "documentation"
  | "market-structure"
  | "validator-health"
  | "capital-routing";

export interface AgentIdentity {
  /** Unique agent ID (e.g., "agent:treasury-001") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Organization ID */
  orgId: string;
  /** Primary role */
  role: AgentRole;
  /** Tier classification */
  tier: AgentTier;
  /** Ed25519 public key for signing */
  publicKey: string;
  /** Current status */
  status: AgentStatus;
  /** Trust score 0-100, computed from performance history */
  trustScore: number;
  /** MCP tools this agent may invoke */
  allowedTools: string[];
  /** Data scopes this agent may read */
  allowedDataScopes: string[];
  /** Maximum daily spend in UNY (bigint string) */
  spendLimitDaily: string;
  /** Maximum per-task spend in UNY (bigint string) */
  spendLimitPerTask: string;
  /** Approval threshold — tasks above this amount require human approval */
  approvalThreshold: string;
  /** Last heartbeat ISO timestamp */
  lastHeartbeat: string | null;
  /** Kill switch — if true, agent is immediately halted */
  killSwitch: boolean;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Optional description */
  description?: string;
  /** Version of the agent definition */
  version: string;
}

// ═══════════════════════════════════════════════════════════
// Agent Wallet
// ═══════════════════════════════════════════════════════════

export interface AgentWallet {
  walletId: string;
  agentId: string;
  /** Operating balance — available for spending (bigint string) */
  operatingBalance: string;
  /** Escrowed — locked pending task completion */
  escrowBalance: string;
  /** Reserved — pre-allocated for approved work */
  reservedBalance: string;
  /** Staked — bonded for SLA guarantees */
  stakedBalance: string;
  /** Compliance-cleared balance — verified for external settlement */
  complianceClearedBalance: string;
  /** Total = operating + escrow + reserved + staked + complianceCleared */
  totalBalance: string;
  /** Last settlement timestamp */
  lastSettledAt: string | null;
  /** ISO timestamp */
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════
// Agent Task
// ═══════════════════════════════════════════════════════════

export type TaskStatus =
  | "requested"
  | "quoted"
  | "approved"
  | "budget-reserved"
  | "executing"
  | "delivered"
  | "settled"
  | "disputed"
  | "failed"
  | "cancelled"
  | "escalated";

export type TaskPriority = "critical" | "high" | "normal" | "low";

export interface AgentTask {
  taskId: string;
  /** Agent requesting the work */
  requesterAgentId: string;
  /** Agent performing the work (assigned after acceptance) */
  performerAgentId: string | null;
  /** Capability being requested (matches A2A capability ID) */
  capability: string;
  /** Human-readable description */
  description: string;
  /** Quoted cost from performer (bigint string) */
  quotedCost: string | null;
  /** Maximum budget the requester will pay */
  maxBudget: string;
  /** Current status */
  status: TaskStatus;
  /** Priority level */
  priority: TaskPriority;
  /** References to proof artifacts */
  proofRefs: string[];
  /** Hash of the delivered artifact */
  artifactHash: string | null;
  /** Policy decision ID that approved this task */
  policyDecisionId: string | null;
  /** Error message if failed */
  errorMessage: string | null;
  /** ISO timestamps */
  requestedAt: string;
  quotedAt: string | null;
  approvedAt: string | null;
  executionStartedAt: string | null;
  deliveredAt: string | null;
  settledAt: string | null;
  /** TTL — task expires if not accepted by this time */
  expiresAt: string | null;
  /** Idempotency key for retry-safe execution */
  idempotencyKey: string;
}

// ═══════════════════════════════════════════════════════════
// Agent Budget
// ═══════════════════════════════════════════════════════════

export type BudgetPeriod = "daily" | "weekly" | "monthly" | "per-task" | "unlimited";

export interface AgentBudget {
  budgetId: string;
  agentId: string;
  /** Period type */
  period: BudgetPeriod;
  /** Maximum spend for this period (bigint string) */
  limit: string;
  /** Amount spent so far in current period */
  spent: string;
  /** Amount reserved (pending tasks) */
  reserved: string;
  /** Period start */
  periodStart: string;
  /** Period end */
  periodEnd: string | null;
  /** Auto-refill from treasury */
  autoRefill: boolean;
  /** Refill amount when balance drops below threshold */
  refillAmount: string | null;
  /** Refill threshold */
  refillThreshold: string | null;
}

// ═══════════════════════════════════════════════════════════
// Agent Heartbeat
// ═══════════════════════════════════════════════════════════

export interface AgentHeartbeat {
  agentId: string;
  timestamp: string;
  /** ms since last heartbeat */
  interval: number;
  /** Agent-reported health */
  healthy: boolean;
  /** Current task count */
  activeTaskCount: number;
  /** Operating balance remaining */
  balanceRemaining: string;
  /** CPU / memory / request metrics */
  metrics?: {
    cpuPercent?: number;
    memoryMb?: number;
    requestsPerMinute?: number;
    errorRate?: number;
  };
}

// ═══════════════════════════════════════════════════════════
// Organization
// ═══════════════════════════════════════════════════════════

export interface Organization {
  orgId: string;
  name: string;
  legalEntity: string;
  jurisdiction: string;
  agents: string[]; // agent IDs
  treasuryWalletId: string;
  createdAt: string;
}
