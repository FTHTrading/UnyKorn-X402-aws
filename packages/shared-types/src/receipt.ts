/**
 * @unykorn/shared-types — Receipt & Proof Models
 *
 * Every completed task must emit a signed settlement receipt.
 * Every privileged action must be logged with proof.
 */

// ═══════════════════════════════════════════════════════════
// Settlement Receipt
// ═══════════════════════════════════════════════════════════

export type ReceiptStatus = "pending" | "signed" | "verified" | "anchored" | "disputed";

export interface SettlementReceipt {
  receiptId: string;
  /** Task this receipt settles */
  taskId: string;
  /** Payer agent */
  fromAgentId: string;
  /** Payee agent */
  toAgentId: string;
  /** Amount settled (bigint string) */
  amount: string;
  /** Genesis balance class used */
  assetClass: "UNY-O" | "UNY-E" | "UNY-R" | "UNY-S" | "UNY-P" | "UNY-C";
  /** Policy decision that authorized settlement */
  policyDecisionId: string;
  /** Released by policy engine? */
  releasedByPolicy: boolean;
  /** SHA-256 hash of the task artifact */
  artifactHash: string | null;
  /** Execution log reference */
  executionLogRef: string | null;
  /** Policy approval log reference */
  policyApprovalLogRef: string | null;
  /** Merkle proof hash (if anchored to L1) */
  merkleProofHash: string | null;
  /** Merkle tree index */
  merkleIndex: number | null;
  /** Batch ID (if batched) */
  batchId: string | null;
  /** Receipt status */
  status: ReceiptStatus;
  /** Ed25519 signature of receipt data */
  signature: string;
  /** Signer public key */
  signerPublicKey: string;
  /** ISO timestamp */
  signedAt: string;
  /** Anchor transaction hash on L1 */
  anchorTxHash: string | null;
  /** ISO timestamp of L1 anchor */
  anchoredAt: string | null;
}

// ═══════════════════════════════════════════════════════════
// Receipt Batch
// ═══════════════════════════════════════════════════════════

export interface ReceiptBatch {
  batchId: string;
  /** Merkle root of all receipts in this batch */
  merkleRoot: string;
  /** Number of receipts */
  receiptCount: number;
  /** Receipt IDs in this batch */
  receiptIds: string[];
  /** Total value settled in this batch */
  totalValue: string;
  /** Anchor transaction hash */
  anchorTxHash: string | null;
  /** ISO timestamps */
  createdAt: string;
  anchoredAt: string | null;
}

// ═══════════════════════════════════════════════════════════
// Proof Artifact
// ═══════════════════════════════════════════════════════════

export type ProofType =
  | "task_execution"
  | "settlement"
  | "policy_decision"
  | "approval"
  | "escrow_event"
  | "treasury_movement"
  | "agent_lifecycle"
  | "incident"
  | "mcp_invocation"
  | "a2a_message";

export interface ProofArtifact {
  proofId: string;
  /** Type of proof */
  type: ProofType;
  /** Agent that generated this proof */
  generatedBy: string;
  /** Reference entity ID */
  referenceId: string;
  /** Reference entity type */
  referenceType: string;
  /** SHA-256 hash of the proof content */
  contentHash: string;
  /** The actual proof content (JSON) */
  content: Record<string, unknown>;
  /** Ed25519 signature */
  signature: string;
  /** Signer public key */
  signerPublicKey: string;
  /** Merkle proof hash (if part of a batch) */
  merkleProofHash: string | null;
  /** ISO timestamp */
  generatedAt: string;
  /** Is this proof anchored to L1? */
  anchored: boolean;
  /** Anchor hash */
  anchorTxHash: string | null;
}

// ═══════════════════════════════════════════════════════════
// Merkle Tree
// ═══════════════════════════════════════════════════════════

export interface MerkleNode {
  hash: string;
  left: string | null;
  right: string | null;
  data: string | null; // leaf data
  index: number;
  level: number;
}

export interface MerkleTree {
  root: string;
  leaves: string[];
  nodes: MerkleNode[];
  depth: number;
  leafCount: number;
}

export interface MerkleProof {
  /** Leaf hash being proven */
  leafHash: string;
  /** Leaf index */
  leafIndex: number;
  /** Sibling hashes from leaf to root */
  siblings: string[];
  /** Direction at each level (true = right, false = left) */
  directions: boolean[];
  /** Expected root */
  root: string;
}
