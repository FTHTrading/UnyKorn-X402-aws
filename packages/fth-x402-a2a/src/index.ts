/**
 * FTH x402 A2A — Public API
 *
 * Complete A2A agent framework for the FTH x402 payment infrastructure.
 *
 * Architecture: Hub-and-spoke + control/execution split + async events + human escalation
 *
 * Layers:
 *   L1 Discovery  — Agent Cards (served by existing services)
 *   L2 Control    — Orchestrator, Guardian, Compliance, Budget
 *   L3 Commerce   — Quote, Payment, Treasury, Receipt
 *   L4 Work       — Delivery, Search, Settlement, Outreach
 *   L5 Ecosystem  — Registry, Federation, Marketplace
 */

// ── Types ────────────────────────────────────────────────
export type {
  // Agent Card & Discovery
  AgentCard,
  AgentSkill,
  AgentAuthScheme,
  AgentAuthentication,
  AgentProvider,
  AgentCapabilities,
  SkillExample,
  AgentLayer,
  AgentRole,
  // Task Lifecycle
  Task,
  TaskState,
  TaskStatus,
  TaskId,
  TaskMetadata,
  // Messages & Parts
  Message,
  MessageRole,
  Part,
  TextPart,
  DataPart,
  FilePart,
  PaymentPart,
  EscalationPart,
  // Artifacts
  Artifact,
  // JSON-RPC
  A2AMethod,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  A2AErrorCode,
  // SSE
  SSEEvent,
  SSEEventType,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  // Push Notifications
  PushNotificationConfig,
  // Task Params
  TaskSendParams,
  TaskGetParams,
  TaskCancelParams,
  // Event Bus
  AgentEventType,
  AgentEvent,
  AgentEventHandler,
  // Registry
  AgentRegistryEntry,
  RouteRule,
  // Human-in-the-Loop
  EscalationRequest,
  EscalationResponse,
} from "./types";

export { A2A_ERROR_CODES } from "./types";

// ── Transport ────────────────────────────────────────────
export {
  parseJsonRpcRequest,
  isJsonRpcError,
  makeResult,
  makeError,
  formatSSEEvent,
  SSEWriter,
  dispatch,
  A2AError,
  handleA2ARequest,
} from "./transport";
export type { MethodHandler, A2AMethodHandlers } from "./transport";

// ── Task Manager ─────────────────────────────────────────
export { TaskManager } from "./task";
export type { TaskManagerOptions } from "./task";

// ── Event Bus ────────────────────────────────────────────
export { EventBus } from "./events";
export type { EventBusOptions } from "./events";

// ── Registry & Router ────────────────────────────────────
export { AgentRegistry, RoutingEngine, DEFAULT_ROUTE_RULES } from "./registry";
export type { RegistryOptions } from "./registry";

// ── Agents ───────────────────────────────────────────────
export {
  // Base
  BaseAgent,
  type BaseAgentConfig,
  // L2 Control
  OrchestratorAgent,
  createOrchestratorCard,
  type OrchestratorConfig,
  GuardianAgent,
  createGuardianCard,
  ComplianceAgent,
  createComplianceCard,
  BudgetAgent,
  createBudgetCard,
  // L3 Commerce
  QuoteAgent,
  createQuoteCard,
  PaymentAgent,
  createPaymentCard,
  TreasuryAgent,
  createTreasuryAgentCard,
  ReceiptAgent,
  createReceiptCard,
  // L4 Work
  DeliveryAgent,
  createDeliveryCard,
  SearchAgent,
  createSearchCard,
  SettlementAgent,
  createSettlementCard,
  OutreachAgent,
  createOutreachCard,
} from "./agents";

// ── Bootstrap ────────────────────────────────────────────
export { createA2ANetwork } from "./bootstrap";
export type { A2ANetworkConfig, A2ANetwork } from "./bootstrap";
