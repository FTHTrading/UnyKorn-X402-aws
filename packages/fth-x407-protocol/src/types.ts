/**
 * x407 Protocol — Canonical Types
 *
 * HTTP 407 (Proxy Authentication Required) extended into a full
 * monetization + trust operating layer for AI‑to‑AI commerce.
 */

// ─── Protocol Version ────────────────────────────────────────────────
export const X407_PROTOCOL_VERSION = "fth-x407/1.0" as const;

// ─── Enums ───────────────────────────────────────────────────────────
export type ChallengeType =
  | "identity"      // Prove agent identity (Ed25519 sig)
  | "capability"    // Prove agent can perform task
  | "solvency"      // Prove agent has sufficient funds
  | "compliance";   // Prove agent meets regulatory requirements

export type ChallengeStatus =
  | "issued"
  | "responded"
  | "verified"
  | "failed"
  | "expired";

export type TrustTier =
  | "untrusted"     // 0–19  — no history
  | "provisional"   // 20–39 — new agent, limited track record
  | "standard"      // 40–59 — normal operating range
  | "trusted"       // 60–79 — established reliable agent
  | "elite"         // 80–94 — high-volume, zero disputes
  | "institutional";// 95–100 — KYC-enhanced, insured

export type SessionStatus =
  | "active"
  | "paused"
  | "expired"
  | "revoked"
  | "settled";

export type RevenueCategory =
  | "facilitator_fee"   // Per-verification processing fee
  | "protocol_fee"      // x407 protocol surcharge
  | "metering_fee"      // Usage-based billing
  | "treasury_yield"    // Reserve interest/yield
  | "buyback_burn"      // Buy-and-burn allocation
  | "lp_provision"      // LP reward allocation
  | "referral_rebate";  // Partner/referral rebate

export type ComplianceVerdict =
  | "cleared"
  | "flagged"
  | "blocked"
  | "pending_review"
  | "sanctions_hit"
  | "jurisdiction_restricted";

export type AuditSeverity = "info" | "warn" | "critical" | "fatal";

// ─── Challenge Protocol ──────────────────────────────────────────────
export interface X407Challenge {
  challengeId: string;
  type: ChallengeType;
  /** The agent being challenged */
  subjectAgentId: string;
  /** The service requesting the challenge */
  issuerServiceId: string;
  /** HMAC(challengeId + nonce + type, serverSecret) */
  challengeToken: string;
  nonce: string;
  /** Opaque payload the agent must sign/solve */
  payload: ChallengePayload;
  status: ChallengeStatus;
  issuedAt: string;
  expiresAt: string;
  respondedAt?: string;
  verifiedAt?: string;
}

export interface ChallengePayload {
  /** Random bytes (hex) the agent must sign */
  dataToSign: string;
  /** Required proof fields for this challenge type */
  requiredFields: string[];
  /** Optional: minimum trust tier required */
  minTrustTier?: TrustTier;
  /** Optional: minimum balance (bigint string, 18 decimals) */
  minBalance?: string;
  /** Optional: required capabilities */
  requiredCapabilities?: string[];
}

export interface ChallengeResponse {
  challengeId: string;
  respondentAgentId: string;
  /** Ed25519 signature over dataToSign */
  signature: string;
  signerPublicKey: string;
  /** Additional proof data keyed by requiredFields */
  proofData: Record<string, string>;
  respondedAt: string;
}

// ─── Trust Registry ──────────────────────────────────────────────────
export interface TrustProfile {
  agentId: string;
  trustScore: number; // 0–100
  tier: TrustTier;
  /** Lifetime counters */
  totalTransactions: number;
  totalVolume: string;          // bigint string, 18 decimals
  totalDisputes: number;
  disputesWon: number;
  disputesLost: number;
  /** Rolling 30-day metrics */
  recentTransactions: number;
  recentVolume: string;
  recentDisputeRate: number;    // 0.0–1.0
  /** Compliance flags */
  kycLevel: number;             // 0 = none, 1 = basic, 2 = enhanced, 3 = institutional
  sanctionsCleared: boolean;
  jurisdictions: string[];      // ISO 3166-1 alpha-2
  /** Accreditations */
  accreditations: Accreditation[];
  /** Timestamps */
  firstSeenAt: string;
  lastActiveAt: string;
  updatedAt: string;
}

export interface Accreditation {
  accreditationId: string;
  type: string;                 // e.g., "api-provider", "data-source", "settlement-node"
  issuedBy: string;             // agent or service that granted it
  issuedAt: string;
  expiresAt?: string;
  revoked: boolean;
  metadata?: Record<string, string>;
}

export interface TrustScoreFactors {
  /** Weight: 0.30 — Transaction success rate */
  completionRate: number;
  /** Weight: 0.25 — Dispute rate (inverse) */
  disputeScore: number;
  /** Weight: 0.15 — Volume consistency */
  volumeConsistency: number;
  /** Weight: 0.15 — KYC/compliance level */
  complianceScore: number;
  /** Weight: 0.10 — Time in network */
  tenureScore: number;
  /** Weight: 0.05 — Peer endorsements */
  endorsementScore: number;
}

// ─── Session Management ──────────────────────────────────────────────
export interface X407Session {
  sessionId: string;
  agentId: string;
  /** Service or namespace this session is scoped to */
  namespace: string;
  /** Trust tier at session creation */
  trustTierAtCreation: TrustTier;
  /** Spending limits for this session */
  spendLimit: string;           // bigint string
  spendUsed: string;            // bigint string
  /** Request limits */
  requestLimit: number;
  requestCount: number;
  /** Metering accumulator */
  meteringAccumulator: MeteringAccumulator;
  status: SessionStatus;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  settledAt?: string;
  /** Settlement receipt ID when session closes */
  settlementReceiptId?: string;
}

export interface MeteringAccumulator {
  apiRequests: number;
  aiTokensConsumed: number;
  computeSeconds: number;
  totalCostAccrued: string;     // bigint string
}

// ─── Revenue Routing ─────────────────────────────────────────────────
export interface RevenueEvent {
  eventId: string;
  sessionId: string;
  agentId: string;
  category: RevenueCategory;
  amount: string;               // bigint string
  asset: string;                // e.g., "USDF", "UNY"
  rail: string;                 // e.g., "unykorn-l1", "stellar"
  /** Where the revenue flows */
  destination: RevenueDestination;
  createdAt: string;
  settledAt?: string;
  receiptId?: string;
}

export interface RevenueDestination {
  type: "treasury" | "burn_address" | "lp_pool" | "agent_wallet" | "reserve";
  address?: string;
  agentId?: string;
  poolId?: string;
}

export interface FeeSchedule {
  scheduleId: string;
  namespace: string;
  /** Base fee per API request (bigint string) */
  baseFeePerRequest: string;
  /** Fee per AI token (bigint string) */
  feePerAiToken: string;
  /** Fee per compute second (bigint string) */
  feePerComputeSecond: string;
  /** Protocol fee rate (basis points, 1 = 0.01%) */
  protocolFeeBps: number;
  /** Facilitator fee rate (basis points) */
  facilitatorFeeBps: number;
  /** Buy-and-burn allocation (basis points of total revenue) */
  buybackBurnBps: number;
  /** LP provision allocation (basis points of total revenue) */
  lpProvisionBps: number;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface RevenueSnapshot {
  periodStart: string;
  periodEnd: string;
  totalRevenue: string;         // bigint string
  byCategory: Record<RevenueCategory, string>;
  totalBurned: string;
  totalToLp: string;
  totalToTreasury: string;
  transactionCount: number;
  uniqueAgents: number;
}

// ─── Compliance Gateway ──────────────────────────────────────────────
export interface ComplianceCheck {
  checkId: string;
  agentId: string;
  checkType: "pre_transaction" | "post_transaction" | "periodic";
  /** The transaction context being evaluated */
  context: ComplianceContext;
  verdict: ComplianceVerdict;
  /** Rule IDs that triggered the verdict */
  triggeredRules: string[];
  details: string;
  checkedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ComplianceContext {
  fromAgentId: string;
  toAgentId?: string;
  amount: string;               // bigint string
  asset: string;
  rail: string;
  jurisdictionFrom?: string;
  jurisdictionTo?: string;
  taskId?: string;
  sessionId?: string;
}

export interface ComplianceRule {
  ruleId: string;
  name: string;
  description: string;
  /** Transaction threshold that triggers this rule (bigint string) */
  threshold?: string;
  /** Jurisdictions this rule applies to (empty = global) */
  jurisdictions: string[];
  /** Actions to take: block, flag, require_review */
  action: "block" | "flag" | "require_review" | "log_only";
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Audit Trail ─────────────────────────────────────────────────────
export interface X407AuditEntry {
  entryId: string;
  severity: AuditSeverity;
  action: string;
  actorAgentId: string;
  targetId?: string;
  targetType?: string;
  sessionId?: string;
  /** Structured event data */
  data: Record<string, unknown>;
  /** SHA-256 hash of previous entry for chain integrity */
  previousHash: string;
  entryHash: string;
  timestamp: string;
}

// ─── Orchestrator Config ─────────────────────────────────────────────
export interface X407Config {
  protocolVersion: typeof X407_PROTOCOL_VERSION;
  /** Challenge expiry in seconds */
  challengeTtlSeconds: number;
  /** Session expiry in seconds */
  sessionTtlSeconds: number;
  /** Maximum spend per session (bigint string) */
  defaultSessionSpendLimit: string;
  /** Maximum requests per session */
  defaultSessionRequestLimit: number;
  /** Trust score thresholds for each tier */
  trustTierThresholds: Record<TrustTier, number>;
  /** Default fee schedule */
  defaultFeeSchedule: FeeSchedule;
  /** Compliance rules */
  complianceRules: ComplianceRule[];
  /** Whether to enforce challenges for all sessions */
  enforceChallenge: boolean;
  /** Signing key for challenge tokens and receipts */
  signingKeyHex: string;
}

export const DEFAULT_TRUST_TIER_THRESHOLDS: Record<TrustTier, number> = {
  untrusted: 0,
  provisional: 20,
  standard: 40,
  trusted: 60,
  elite: 80,
  institutional: 95,
};

export const DEFAULT_CONFIG: Omit<X407Config, "signingKeyHex" | "defaultFeeSchedule" | "complianceRules"> = {
  protocolVersion: X407_PROTOCOL_VERSION,
  challengeTtlSeconds: 120,
  sessionTtlSeconds: 3600,
  defaultSessionSpendLimit: "1000000000000000000000",  // 1000 UNY (18 decimals)
  defaultSessionRequestLimit: 10000,
  trustTierThresholds: DEFAULT_TRUST_TIER_THRESHOLDS,
  enforceChallenge: true,
};
