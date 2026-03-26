/**
 * @unykorn/shared-types — A2A Protocol Models
 *
 * Agent-to-Agent protocol contracts for discovery, delegation,
 * negotiation, execution, and settlement between agents.
 * Aligned with Google A2A specification concepts.
 */

// ═══════════════════════════════════════════════════════════
// Agent Card (Discovery)
// ═══════════════════════════════════════════════════════════

export interface AgentCard {
  /** Unique agent identifier */
  agentId: string;
  /** Human-readable name */
  name: string;
  /** Description of what this agent does */
  description: string;
  /** Base URL for A2A communication */
  endpoint: string;
  /** Protocol version */
  protocolVersion: string;
  /** Authentication methods supported */
  authMethods: ("bearer" | "mtls" | "ed25519-sig")[];
  /** Capabilities this agent advertises */
  capabilities: AgentCapability[];
  /** Input content types accepted */
  inputContentTypes: string[];
  /** Output content types produced */
  outputContentTypes: string[];
  /** Rate limits */
  rateLimit?: { requestsPerMinute: number; burstSize: number };
  /** Trust score */
  trustScore: number;
  /** Status */
  status: "available" | "busy" | "offline" | "degraded";
  /** Last updated */
  updatedAt: string;
}

export interface AgentCapability {
  /** Unique capability ID (e.g., "generate-listing-packet") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Input schema (JSON Schema) */
  inputSchema: Record<string, unknown>;
  /** Output schema (JSON Schema) */
  outputSchema: Record<string, unknown>;
  /** Estimated cost range in UNY */
  estimatedCost: { min: string; max: string };
  /** Estimated execution time in seconds */
  estimatedDuration: { min: number; max: number };
  /** Required approval level */
  requiredApproval: "none" | "agent" | "human" | "policy";
}

// ═══════════════════════════════════════════════════════════
// A2A Messages
// ═══════════════════════════════════════════════════════════

export type A2AMessageType =
  | "task.request"
  | "task.quote"
  | "task.accept"
  | "task.reject"
  | "task.delegate"
  | "task.execute"
  | "task.progress"
  | "task.deliver"
  | "task.settle"
  | "task.dispute"
  | "task.cancel"
  | "task.escalate"
  | "approval.request"
  | "approval.grant"
  | "approval.deny"
  | "discovery.ping"
  | "discovery.pong"
  | "incident.notify"
  | "incident.ack"
  | "heartbeat";

export interface A2AMessage<T = unknown> {
  /** Unique message ID */
  messageId: string;
  /** Message type */
  type: A2AMessageType;
  /** Sender agent ID */
  fromAgentId: string;
  /** Recipient agent ID */
  toAgentId: string;
  /** Correlation ID for tracking conversation */
  correlationId: string;
  /** Task ID if task-related */
  taskId: string | null;
  /** Payload */
  payload: T;
  /** Ed25519 signature of the payload */
  signature: string;
  /** Protocol version */
  protocolVersion: string;
  /** ISO timestamp */
  timestamp: string;
  /** TTL — message expires after this time */
  expiresAt: string | null;
}

// ═══════════════════════════════════════════════════════════
// A2A Message Payloads
// ═══════════════════════════════════════════════════════════

export interface TaskRequestPayload {
  /** Capability being requested */
  capabilityId: string;
  /** Description of work */
  description: string;
  /** Input data */
  input: Record<string, unknown>;
  /** Maximum budget (bigint string) */
  maxBudget: string;
  /** Priority */
  priority: "critical" | "high" | "normal" | "low";
  /** Deadline */
  deadline: string | null;
}

export interface TaskQuotePayload {
  /** Quoted cost (bigint string) */
  quotedCost: string;
  /** Estimated completion time in seconds */
  estimatedDuration: number;
  /** Quote expiry */
  validUntil: string;
  /** Any conditions or requirements */
  conditions: string[];
}

export interface TaskAcceptPayload {
  /** Accepted quote cost */
  acceptedCost: string;
  /** Budget reservation ID */
  budgetReservationId: string;
  /** Escrow ID */
  escrowId: string;
}

export interface TaskRejectPayload {
  /** Reason for rejection */
  reason: string;
  /** Alternative agent suggested */
  alternativeAgentId: string | null;
}

export interface TaskDelegatePayload {
  /** Agent being delegated to */
  delegateToAgentId: string;
  /** Reason for delegation */
  reason: string;
  /** Forwarded task details */
  originalTaskId: string;
}

export interface TaskProgressPayload {
  /** Completion percentage 0-100 */
  percentComplete: number;
  /** Status message */
  statusMessage: string;
  /** Intermediate artifacts */
  intermediateArtifacts: string[];
}

export interface TaskDeliverPayload {
  /** Artifact content or reference */
  artifact: Record<string, unknown>;
  /** SHA-256 hash of the artifact */
  artifactHash: string;
  /** Proof references */
  proofRefs: string[];
  /** Execution log reference */
  executionLogRef: string;
}

export interface TaskSettlePayload {
  /** Settlement receipt ID */
  receiptId: string;
  /** Final amount settled */
  amount: string;
  /** Asset class used */
  assetClass: string;
  /** Merkle proof hash */
  merkleProofHash: string | null;
}

export interface TaskDisputePayload {
  /** Reason for dispute */
  reason: string;
  /** Evidence references */
  evidenceRefs: string[];
  /** Proposed resolution */
  proposedResolution: "refund" | "partial_payment" | "rework" | "escalate";
}

export interface ApprovalRequestPayload {
  /** What needs approval */
  subject: string;
  /** Amount involved */
  amount: string | null;
  /** Task reference */
  taskId: string | null;
  /** Policy rule being invoked */
  policyRuleId: string;
  /** Context */
  context: Record<string, unknown>;
}

export interface IncidentNotifyPayload {
  /** Severity level */
  severity: "SEV1" | "SEV2" | "SEV3" | "SEV4";
  /** Incident description */
  description: string;
  /** Affected systems */
  affectedSystems: string[];
  /** Affected agents */
  affectedAgentIds: string[];
  /** Incident ID */
  incidentId: string;
}

// ═══════════════════════════════════════════════════════════
// A2A Router
// ═══════════════════════════════════════════════════════════

export interface A2ARoute {
  /** Pattern matching for routing */
  pattern: string;
  /** Target agent IDs */
  targetAgentIds: string[];
  /** Load balancing strategy */
  strategy: "round-robin" | "least-busy" | "trust-weighted" | "capability-match";
  /** Priority */
  priority: number;
}

export interface A2ARoutingTable {
  routes: A2ARoute[];
  /** Default fallback agent */
  defaultAgentId: string | null;
  /** Last updated */
  updatedAt: string;
}
