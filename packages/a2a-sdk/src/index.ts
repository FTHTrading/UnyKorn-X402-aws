/**
 * @unykorn/a2a-sdk — Agent-to-Agent Protocol SDK
 *
 * Agent card registry, message routing, fluent message builder,
 * and convenience factory functions for all A2A message types.
 */

import { nanoid } from "nanoid";
import type {
  AgentCard,
  AgentCapability,
  A2AMessage,
  A2AMessageType,
  A2ARoute,
  A2ARoutingTable,
  TaskRequestPayload,
  TaskQuotePayload,
  TaskAcceptPayload,
  TaskRejectPayload,
  TaskDelegatePayload,
  TaskProgressPayload,
  TaskDeliverPayload,
  TaskSettlePayload,
  TaskDisputePayload,
  ApprovalRequestPayload,
  IncidentNotifyPayload,
} from "@unykorn/shared-types";

const PROTOCOL_VERSION = "1.0.0";

// ═══════════════════════════════════════════════════════════
// Agent Card Registry
// ═══════════════════════════════════════════════════════════

export class AgentCardRegistry {
  private cards = new Map<string, AgentCard>();

  register(card: AgentCard): void {
    this.cards.set(card.agentId, card);
  }

  unregister(agentId: string): boolean {
    return this.cards.delete(agentId);
  }

  get(agentId: string): AgentCard | undefined {
    return this.cards.get(agentId);
  }

  discover(filter?: {
    status?: AgentCard["status"];
    minTrustScore?: number;
    capability?: string;
  }): AgentCard[] {
    let results = [...this.cards.values()];
    if (filter?.status) {
      results = results.filter((c) => c.status === filter.status);
    }
    if (filter?.minTrustScore !== undefined) {
      results = results.filter((c) => c.trustScore >= filter.minTrustScore!);
    }
    if (filter?.capability) {
      results = results.filter((c) =>
        c.capabilities.some((cap) => cap.id === filter.capability),
      );
    }
    return results;
  }

  getByCapability(capabilityId: string): AgentCard[] {
    return [...this.cards.values()].filter((c) =>
      c.capabilities.some((cap) => cap.id === capabilityId),
    );
  }

  getAll(): AgentCard[] {
    return [...this.cards.values()];
  }
}

// ═══════════════════════════════════════════════════════════
// A2A Router
// ═══════════════════════════════════════════════════════════

export class A2ARouter {
  private table: A2ARoutingTable = {
    routes: [],
    defaultAgentId: null,
    updatedAt: new Date().toISOString(),
  };
  private roundRobinIndex = new Map<string, number>();

  addRoute(route: A2ARoute): void {
    this.table.routes.push(route);
    this.table.routes.sort((a, b) => a.priority - b.priority);
    this.table.updatedAt = new Date().toISOString();
  }

  removeRoute(pattern: string): boolean {
    const before = this.table.routes.length;
    this.table.routes = this.table.routes.filter((r) => r.pattern !== pattern);
    this.table.updatedAt = new Date().toISOString();
    return this.table.routes.length < before;
  }

  setDefault(agentId: string): void {
    this.table.defaultAgentId = agentId;
    this.table.updatedAt = new Date().toISOString();
  }

  /**
   * Route a message type to a target agent ID based on the routing table.
   */
  route(messageType: string): string | null {
    for (const r of this.table.routes) {
      if (new RegExp(r.pattern).test(messageType)) {
        return this.selectTarget(r);
      }
    }
    return this.table.defaultAgentId;
  }

  getRoutingTable(): A2ARoutingTable {
    return { ...this.table, routes: [...this.table.routes] };
  }

  private selectTarget(route: A2ARoute): string | null {
    if (route.targetAgentIds.length === 0) return null;
    if (route.strategy === "round-robin") {
      const idx = this.roundRobinIndex.get(route.pattern) ?? 0;
      const target = route.targetAgentIds[idx % route.targetAgentIds.length];
      this.roundRobinIndex.set(route.pattern, idx + 1);
      return target;
    }
    // Default: first available
    return route.targetAgentIds[0];
  }
}

// ═══════════════════════════════════════════════════════════
// Message Builder (Fluent)
// ═══════════════════════════════════════════════════════════

export class MessageBuilder<T = unknown> {
  private msg: Partial<A2AMessage<T>> = {
    messageId: `msg:${nanoid(12)}`,
    protocolVersion: PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    expiresAt: null,
    signature: "",
    correlationId: `corr:${nanoid(8)}`,
    taskId: null,
  };

  type(t: A2AMessageType): this {
    this.msg.type = t;
    return this;
  }

  from(agentId: string): this {
    this.msg.fromAgentId = agentId;
    return this;
  }

  to(agentId: string): this {
    this.msg.toAgentId = agentId;
    return this;
  }

  correlationId(id: string): this {
    this.msg.correlationId = id;
    return this;
  }

  task(taskId: string): this {
    this.msg.taskId = taskId;
    return this;
  }

  payload(p: T): this {
    this.msg.payload = p;
    return this;
  }

  signature(sig: string): this {
    this.msg.signature = sig;
    return this;
  }

  expiresAt(iso: string): this {
    this.msg.expiresAt = iso;
    return this;
  }

  ttl(seconds: number): this {
    this.msg.expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
    return this;
  }

  build(): A2AMessage<T> {
    if (!this.msg.type) throw new Error("Message type is required");
    if (!this.msg.fromAgentId) throw new Error("fromAgentId is required");
    if (!this.msg.toAgentId) throw new Error("toAgentId is required");
    return this.msg as A2AMessage<T>;
  }
}

// ═══════════════════════════════════════════════════════════
// Factory Functions
// ═══════════════════════════════════════════════════════════

function buildMessage<T>(
  type: A2AMessageType,
  from: string,
  to: string,
  taskId: string | null,
  payload: T,
): A2AMessage<T> {
  return new MessageBuilder<T>()
    .type(type)
    .from(from)
    .to(to)
    .task(taskId ?? "")
    .payload(payload)
    .build();
}

export function createTaskRequest(
  from: string,
  to: string,
  payload: TaskRequestPayload,
): A2AMessage<TaskRequestPayload> {
  return buildMessage("task.request", from, to, null, payload);
}

export function createTaskQuote(
  from: string,
  to: string,
  taskId: string,
  payload: TaskQuotePayload,
): A2AMessage<TaskQuotePayload> {
  return buildMessage("task.quote", from, to, taskId, payload);
}

export function createTaskAccept(
  from: string,
  to: string,
  taskId: string,
  payload: TaskAcceptPayload,
): A2AMessage<TaskAcceptPayload> {
  return buildMessage("task.accept", from, to, taskId, payload);
}

export function createTaskReject(
  from: string,
  to: string,
  taskId: string,
  payload: TaskRejectPayload,
): A2AMessage<TaskRejectPayload> {
  return buildMessage("task.reject", from, to, taskId, payload);
}

export function createTaskDelegate(
  from: string,
  to: string,
  taskId: string,
  payload: TaskDelegatePayload,
): A2AMessage<TaskDelegatePayload> {
  return buildMessage("task.delegate", from, to, taskId, payload);
}

export function createTaskProgress(
  from: string,
  to: string,
  taskId: string,
  payload: TaskProgressPayload,
): A2AMessage<TaskProgressPayload> {
  return buildMessage("task.progress", from, to, taskId, payload);
}

export function createTaskDeliver(
  from: string,
  to: string,
  taskId: string,
  payload: TaskDeliverPayload,
): A2AMessage<TaskDeliverPayload> {
  return buildMessage("task.deliver", from, to, taskId, payload);
}

export function createTaskSettle(
  from: string,
  to: string,
  taskId: string,
  payload: TaskSettlePayload,
): A2AMessage<TaskSettlePayload> {
  return buildMessage("task.settle", from, to, taskId, payload);
}

export function createTaskDispute(
  from: string,
  to: string,
  taskId: string,
  payload: TaskDisputePayload,
): A2AMessage<TaskDisputePayload> {
  return buildMessage("task.dispute", from, to, taskId, payload);
}

export function createApprovalRequest(
  from: string,
  to: string,
  taskId: string | null,
  payload: ApprovalRequestPayload,
): A2AMessage<ApprovalRequestPayload> {
  return buildMessage("approval.request", from, to, taskId, payload);
}

export function createIncidentNotify(
  from: string,
  to: string,
  payload: IncidentNotifyPayload,
): A2AMessage<IncidentNotifyPayload> {
  return buildMessage("incident.notify", from, to, null, payload);
}
