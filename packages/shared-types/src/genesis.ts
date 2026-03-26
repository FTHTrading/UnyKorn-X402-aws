/**
 * @unykorn/shared-types — Genesis Ledger Models
 *
 * UNY Genesis is the internal machine settlement and operating ledger.
 * It is NOT a second token — it is a controlled accounting layer
 * derived from UNY Core deposits and governed by policy.
 */

// ═══════════════════════════════════════════════════════════
// Balance Classes
// ═══════════════════════════════════════════════════════════

export type GenesisBalanceClass =
  | "OPERATING"              // UNY-O: day-to-day agent spending
  | "ESCROW"                 // UNY-E: locked pending task completion
  | "RESERVED"               // UNY-R: pre-allocated for approved work
  | "STAKED_RELIABILITY"     // UNY-S: bonded for SLA guarantees
  | "PROOF_RECEIPT"          // UNY-P: settled, receipt-linked, immutable
  | "COMPLIANCE_CLEARED";    // UNY-C: policy-verified for external settlement

export const BALANCE_CLASS_CODES: Record<GenesisBalanceClass, string> = {
  OPERATING: "UNY-O",
  ESCROW: "UNY-E",
  RESERVED: "UNY-R",
  STAKED_RELIABILITY: "UNY-S",
  PROOF_RECEIPT: "UNY-P",
  COMPLIANCE_CLEARED: "UNY-C",
};

// ═══════════════════════════════════════════════════════════
// Ledger Entry
// ═══════════════════════════════════════════════════════════

export type LedgerEntryType =
  | "deposit"          // UNY Core → Genesis
  | "withdrawal"       // Genesis → UNY Core
  | "transfer"         // Agent → Agent
  | "escrow_lock"      // Operating → Escrow
  | "escrow_release"   // Escrow → Operating (task complete)
  | "escrow_refund"    // Escrow → Operating (task failed)
  | "reserve"          // Operating → Reserved
  | "unreserve"        // Reserved → Operating
  | "stake"            // Operating → Staked
  | "unstake"          // Staked → Operating
  | "settle"           // Any → Proof Receipt (final)
  | "compliance_clear" // Any → Compliance Cleared
  | "burn"             // Permanent removal
  | "treasury_refill"  // Treasury → Agent Operating
  | "dispute_hold"     // Any → Escrow (dispute)
  | "dispute_release"; // Escrow → Operating (dispute resolved)

export interface LedgerEntry {
  entryId: string;
  /** Ledger sequence number — monotonically increasing */
  sequence: bigint;
  /** Type of ledger operation */
  type: LedgerEntryType;
  /** Source agent (null for deposits from UNY Core) */
  fromAgentId: string | null;
  /** Destination agent (null for withdrawals to UNY Core) */
  toAgentId: string | null;
  /** Amount in smallest unit (bigint string, 18 decimals) */
  amount: string;
  /** Source balance class */
  fromClass: GenesisBalanceClass | null;
  /** Destination balance class */
  toClass: GenesisBalanceClass | null;
  /** Reference to the task that triggered this entry */
  taskId: string | null;
  /** Policy decision that authorized this entry */
  policyDecisionId: string | null;
  /** Memo */
  memo: string;
  /** ISO timestamp */
  timestamp: string;
  /** Hash of this entry for audit chain */
  entryHash: string;
  /** Hash of previous entry (audit chain) */
  previousHash: string;
  /** Idempotency key */
  idempotencyKey: string;
}

// ═══════════════════════════════════════════════════════════
// Genesis Account
// ═══════════════════════════════════════════════════════════

export interface GenesisAccount {
  accountId: string;
  /** Owner agent ID */
  agentId: string;
  /** Organization */
  orgId: string;
  /** Per-class balances (bigint strings, 18 decimals) */
  balances: Record<GenesisBalanceClass, string>;
  /** Is this a sub-account (departmental)? */
  isSubAccount: boolean;
  /** Parent account ID if sub-account */
  parentAccountId: string | null;
  /** Account status */
  status: "active" | "frozen" | "closed";
  /** Total deposited from UNY Core */
  totalDeposited: string;
  /** Total withdrawn back to UNY Core */
  totalWithdrawn: string;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════
// Escrow Object
// ═══════════════════════════════════════════════════════════

export type EscrowStatus =
  | "locked"
  | "partially_released"
  | "fully_released"
  | "refunded"
  | "disputed"
  | "expired";

export interface EscrowObject {
  escrowId: string;
  /** Task this escrow is for */
  taskId: string;
  /** Depositor agent */
  depositorAgentId: string;
  /** Beneficiary agent */
  beneficiaryAgentId: string;
  /** Total escrowed amount */
  amount: string;
  /** Amount released so far */
  releasedAmount: string;
  /** Amount refunded so far */
  refundedAmount: string;
  /** Current status */
  status: EscrowStatus;
  /** Release conditions */
  releaseConditions: EscrowCondition[];
  /** Expiry — if not settled by this time, auto-refund */
  expiresAt: string;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

export interface EscrowCondition {
  conditionId: string;
  /** Type of condition */
  type: "task_delivery" | "milestone" | "approval" | "time_based" | "policy_check";
  /** Is this condition met? */
  met: boolean;
  /** Amount released when this condition is met */
  releaseAmount: string;
  /** Description */
  description: string;
}

// ═══════════════════════════════════════════════════════════
// Treasury
// ═══════════════════════════════════════════════════════════

export interface TreasuryState {
  /** Total UNY Core held by the Genesis system */
  totalCoreDeposits: string;
  /** Total operating balances across all agents */
  totalOperating: string;
  /** Total escrowed */
  totalEscrowed: string;
  /** Total reserved */
  totalReserved: string;
  /** Total staked */
  totalStaked: string;
  /** Total settled (proof receipts) */
  totalSettled: string;
  /** Total compliance-cleared */
  totalComplianceCleared: string;
  /** Must equal totalCoreDeposits minus withdrawals */
  totalGenesisSupply: string;
  /** Last reconciliation timestamp */
  reconciledAt: string;
  /** Reconciliation matches */
  balanced: boolean;
}

// ═══════════════════════════════════════════════════════════
// Streaming Balance
// ═══════════════════════════════════════════════════════════

export interface StreamingBalance {
  streamId: string;
  /** Source agent */
  fromAgentId: string;
  /** Destination agent */
  toAgentId: string;
  /** Total budget for the stream */
  totalBudget: string;
  /** Rate per second (bigint string) */
  ratePerSecond: string;
  /** Amount streamed so far */
  streamedAmount: string;
  /** Stream status */
  status: "active" | "paused" | "completed" | "cancelled";
  /** Associated task */
  taskId: string | null;
  /** ISO timestamps */
  startedAt: string;
  pausedAt: string | null;
  endsAt: string;
}
