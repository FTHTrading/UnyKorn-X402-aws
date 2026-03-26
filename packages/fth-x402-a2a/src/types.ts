/**
 * FTH x402 A2A — Core Protocol Types
 *
 * Implements the Google Agent-to-Agent (A2A) protocol type system,
 * extended with FTH x402 payment semantics.
 *
 * References:
 *   - https://google.github.io/A2A/specification/
 *   - FTH x402 protocol spec (fth-x402-core/types.ts)
 *
 * Architecture layers:
 *   L1 Discovery    — AgentCard, Skill, auth schemes
 *   L2 Control      — Orchestrator, Guardian, Compliance, Budget
 *   L3 Commerce     — Quote, Payment, Treasury, Receipt
 *   L4 Work         — Delivery, Search, Settlement, Outreach
 *   L5 Ecosystem    — Registry, Partner, Marketplace
 */

import type { Rail, PaymentRequirement } from "fth-x402-core";

// ═══════════════════════════════════════════════════════════
// Agent Card & Discovery
// ═══════════════════════════════════════════════════════════

/** Agent authentication scheme. */
export interface AgentAuthScheme {
  scheme: "x402" | "bearer" | "apiKey" | "oauth2" | "hmac" | string;
  description?: string;
  in?: "header" | "query";
  name?: string;
}

/** Agent authentication configuration. */
export interface AgentAuthentication {
  schemes: AgentAuthScheme[];
}

/** Agent provider info. */
export interface AgentProvider {
  organization: string;
  url: string;
  contact?: string;
}

/** Agent capability flags per A2A spec. */
export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

/** A single skill an agent offers. */
export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  inputModes: string[];
  outputModes: string[];
  examples?: SkillExample[];
}

/** Example input/output for a skill. */
export interface SkillExample {
  name: string;
  description?: string;
  input: unknown;
  output: unknown;
}

/**
 * A2A Agent Card — the canonical discovery document.
 *
 * Served at `/.well-known/agent.json`. This is what other agents,
 * orchestrators, and AI systems use to discover and interact with
 * an agent.
 */
export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocol: "a2a";
  protocolVersion: string;
  provider: AgentProvider;
  capabilities: AgentCapabilities;
  authentication: AgentAuthentication;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
  /** FTH extension: which layer this agent operates on. */
  layer?: AgentLayer;
  /** FTH extension: agent role within the architecture. */
  role?: AgentRole;
  /** FTH extension: x402 payment config for paid skills. */
  x402?: {
    facilitator: string;
    gateway: string;
    treasury: string;
    rails: Rail[];
  };
}

// ═══════════════════════════════════════════════════════════
// Architecture Layers & Roles
// ═══════════════════════════════════════════════════════════

/**
 * The 5-layer architecture:
 *   discovery — L1: Agent Card, .well-known, MCP
 *   control   — L2: Orchestrator, Guardian, Compliance, Budget
 *   commerce  — L3: Quote, Payment, Treasury, Receipt
 *   work      — L4: Delivery, Search, Settlement, Outreach
 *   ecosystem — L5: Registry, Partner, Marketplace
 */
export type AgentLayer =
  | "discovery"
  | "control"
  | "commerce"
  | "work"
  | "ecosystem";

/**
 * Canonical agent roles in the FTH A2A architecture.
 *
 *   Hub-and-spoke: orchestrator is the hub
 *   Control/execution split: control vs. commerce+work planes
 *   Async events: event-bus for long-running tasks
 *   Human escalation: human-in-the-loop via escalation role
 */
export type AgentRole =
  // L2 Control
  | "orchestrator"
  | "guardian"
  | "compliance"
  | "budget"
  // L3 Commerce
  | "quote"
  | "payment"
  | "treasury"
  | "receipt"
  // L4 Work
  | "delivery"
  | "search"
  | "settlement"
  | "outreach"
  // L5 Ecosystem
  | "registry"
  | "partner"
  | "marketplace"
  // Special
  | "human";

// ═══════════════════════════════════════════════════════════
// Task Lifecycle
// ═══════════════════════════════════════════════════════════

/**
 * A2A Task States — the canonical state machine.
 *
 *   submitted → working → [input-required] → completed
 *                       → failed
 *                       → canceled
 *
 * input-required enables human-in-the-loop escalation.
 */
export type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

/** Task status with optional message. */
export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp: string;
}

/** Unique task identifier. */
export interface TaskId {
  id: string;
  sessionId?: string;
}

/**
 * A2A Task — the unit of work in the A2A protocol.
 *
 * Agents receive tasks, process them, produce artifacts,
 * and transition through states.
 */
export interface Task {
  id: string;
  sessionId?: string;
  status: TaskStatus;
  history?: TaskStatus[];
  artifacts?: Artifact[];
  metadata?: TaskMetadata;
}

/** FTH-extended task metadata. */
export interface TaskMetadata {
  /** Which agent created the task. */
  sourceAgent?: string;
  /** Target agent role for routing. */
  targetRole?: AgentRole;
  /** Target agent ID for direct routing. */
  targetAgent?: string;
  /** Payment requirement if this is a paid task. */
  paymentRequired?: PaymentRequirement;
  /** Payment proof if provided. */
  paymentProofId?: string;
  /** Priority (0=lowest, 10=highest). */
  priority?: number;
  /** Max time budget in seconds. */
  timeoutSeconds?: number;
  /** Parent task ID if this is a sub-task. */
  parentTaskId?: string;
  /** Tags for filtering and routing. */
  tags?: string[];
  /** Whether human escalation is allowed. */
  allowHumanEscalation?: boolean;
  /** Custom key-value pairs. */
  extra?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// Messages & Parts
// ═══════════════════════════════════════════════════════════

/** Message role in the A2A conversation. */
export type MessageRole = "user" | "agent";

/** A2A Message — a turn in agent conversation. */
export interface Message {
  role: MessageRole;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

/**
 * Part types for message content.
 *
 *   text       — plain text content
 *   data       — structured JSON data
 *   file       — file reference (URI or inline base64)
 *   payment    — x402 payment part (FTH extension)
 *   escalation — human-in-the-loop request
 */
export type Part =
  | TextPart
  | DataPart
  | FilePart
  | PaymentPart
  | EscalationPart;

export interface TextPart {
  type: "text";
  text: string;
}

export interface DataPart {
  type: "data";
  mimeType: string;
  data: unknown;
}

export interface FilePart {
  type: "file";
  mimeType: string;
  uri?: string;
  data?: string; // base64
  name?: string;
}

/** FTH extension: payment part for x402 flow. */
export interface PaymentPart {
  type: "payment";
  action: "request" | "proof" | "receipt";
  paymentData: unknown;
}

/** FTH extension: human escalation request. */
export interface EscalationPart {
  type: "escalation";
  reason: string;
  context: unknown;
  urgency: "low" | "medium" | "high" | "critical";
}

// ═══════════════════════════════════════════════════════════
// Artifacts
// ═══════════════════════════════════════════════════════════

/**
 * A2A Artifact — output from agent work.
 *
 * Created during task processing and included in the final
 * task result.
 */
export interface Artifact {
  name?: string;
  description?: string;
  parts: Part[];
  index?: number;
  append?: boolean;
  lastChunk?: boolean;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// JSON-RPC 2.0 (A2A Transport)
// ═══════════════════════════════════════════════════════════

/** A2A JSON-RPC method names. */
export type A2AMethod =
  | "tasks/send"
  | "tasks/sendSubscribe"
  | "tasks/get"
  | "tasks/cancel"
  | "tasks/pushNotification/set"
  | "tasks/pushNotification/get"
  | "tasks/resubscribe"
  // FTH extensions
  | "agents/discover"
  | "agents/route"
  | "agents/health";

/** JSON-RPC 2.0 request. */
export interface JsonRpcRequest<P = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  method: A2AMethod;
  params: P;
}

/** JSON-RPC 2.0 success response. */
export interface JsonRpcResponse<R = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result: R;
}

/** JSON-RPC 2.0 error response. */
export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** Standard A2A error codes. */
export const A2A_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // A2A-specific error codes
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  // FTH extensions
  PAYMENT_REQUIRED: -32402,
  PAYMENT_INVALID: -32403,
  AGENT_NOT_FOUND: -32404,
  BUDGET_EXCEEDED: -32405,
  COMPLIANCE_REJECTED: -32406,
  ESCALATION_REQUIRED: -32407,
} as const;

export type A2AErrorCode = (typeof A2A_ERROR_CODES)[keyof typeof A2A_ERROR_CODES];

// ═══════════════════════════════════════════════════════════
// SSE Streaming
// ═══════════════════════════════════════════════════════════

/** SSE event types for tasks/sendSubscribe. */
export type SSEEventType =
  | "task-status-update"
  | "task-artifact-update"
  | "task-error";

/** SSE event envelope. */
export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
}

/** Status update event. */
export interface TaskStatusUpdateEvent {
  id: string;
  status: TaskStatus;
  final: boolean;
}

/** Artifact update event. */
export interface TaskArtifactUpdateEvent {
  id: string;
  artifact: Artifact;
}

// ═══════════════════════════════════════════════════════════
// Push Notifications
// ═══════════════════════════════════════════════════════════

/** Push notification config. */
export interface PushNotificationConfig {
  url: string;
  token?: string;
  authentication?: {
    schemes: string[];
    credentials?: string;
  };
}

// ═══════════════════════════════════════════════════════════
// Task Send Params
// ═══════════════════════════════════════════════════════════

/** Parameters for tasks/send and tasks/sendSubscribe. */
export interface TaskSendParams {
  id: string;
  sessionId?: string;
  message: Message;
  acceptedOutputModes?: string[];
  pushNotification?: PushNotificationConfig;
  metadata?: TaskMetadata;
}

/** Parameters for tasks/get. */
export interface TaskGetParams {
  id: string;
  historyLength?: number;
}

/** Parameters for tasks/cancel. */
export interface TaskCancelParams {
  id: string;
}

// ═══════════════════════════════════════════════════════════
// Agent Event Bus (Async Inter-Agent Communication)
// ═══════════════════════════════════════════════════════════

/** Event types for inter-agent communication. */
export type AgentEventType =
  | "task.created"
  | "task.updated"
  | "task.completed"
  | "task.failed"
  | "task.canceled"
  | "task.escalated"
  | "payment.required"
  | "payment.received"
  | "payment.settled"
  | "compliance.check"
  | "compliance.result"
  | "budget.check"
  | "budget.result"
  | "agent.registered"
  | "agent.healthCheck"
  | "agent.heartbeat"
  | "escalation.requested"
  | "receipt.issued";

/** Inter-agent event envelope. */
export interface AgentEvent<T = unknown> {
  type: AgentEventType;
  source: string;
  target?: string;
  taskId?: string;
  timestamp: string;
  payload: T;
}

/** Event handler function. */
export type AgentEventHandler<T = unknown> = (event: AgentEvent<T>) => Promise<void>;

// ═══════════════════════════════════════════════════════════
// Agent Registry
// ═══════════════════════════════════════════════════════════

/** Registry entry for a registered agent. */
export interface AgentRegistryEntry {
  id: string;
  card: AgentCard;
  layer: AgentLayer;
  role: AgentRole;
  endpoint: string;
  healthEndpoint?: string;
  status: "active" | "degraded" | "offline";
  lastHeartbeat: string;
  metadata?: Record<string, unknown>;
}

/** Route rule — maps task characteristics to agent roles. */
export interface RouteRule {
  id: string;
  description: string;
  /** Match conditions. */
  match: {
    tags?: string[];
    skills?: string[];
    roles?: AgentRole[];
    layers?: AgentLayer[];
    paymentRequired?: boolean;
    minPriority?: number;
  };
  /** Where to route. */
  target: {
    role: AgentRole;
    agentId?: string;
    fallback?: AgentRole;
  };
  /** Priority of this rule (higher = evaluated first). */
  priority: number;
  enabled: boolean;
}

// ═══════════════════════════════════════════════════════════
// Human-in-the-Loop
// ═══════════════════════════════════════════════════════════

/** Human escalation request. */
export interface EscalationRequest {
  taskId: string;
  agentId: string;
  reason: string;
  context: unknown;
  urgency: "low" | "medium" | "high" | "critical";
  timestamp: string;
  /** Callback info for returning to agent flow. */
  callback: {
    endpoint: string;
    taskId: string;
    sessionId?: string;
  };
}

/** Human response to an escalation. */
export interface EscalationResponse {
  taskId: string;
  decision: "approve" | "reject" | "modify" | "defer";
  message?: Message;
  modifications?: Record<string, unknown>;
  respondedAt: string;
}
