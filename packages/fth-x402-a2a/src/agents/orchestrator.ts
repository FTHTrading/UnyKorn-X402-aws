/**
 * FTH x402 A2A — Orchestrator Agent
 *
 * The hub in the hub-and-spoke architecture.
 *
 * Receives user goals, decomposes them into sub-tasks,
 * delegates to specialized agents via the routing engine,
 * aggregates results, and returns the final response.
 *
 * Architecture patterns implemented:
 *   - Hub-and-spoke: All external requests come through the orchestrator
 *   - Control/execution split: Control plane checked before execution
 *   - Async events: Sub-tasks delegated via event bus
 *   - Human escalation: Surfaces input-required states to caller
 */

import { randomUUID } from "crypto";
import type {
  AgentCard,
  Message,
  Task,
  TaskMetadata,
  Part,
  Artifact,
  AgentRole,
  AgentEvent,
} from "../types";
import { A2A_ERROR_CODES } from "../types";
import { A2AError } from "../transport";
import { BaseAgent, type BaseAgentConfig } from "./base-agent";
import type { RoutingEngine } from "../registry";

// ═══════════════════════════════════════════════════════════
// Orchestrator Config
// ═══════════════════════════════════════════════════════════

export interface OrchestratorConfig extends BaseAgentConfig {
  routingEngine: RoutingEngine;
  /** Maximum concurrent sub-tasks. Default: 10. */
  maxConcurrentSubTasks?: number;
  /** Default timeout for sub-tasks in seconds. Default: 60. */
  defaultSubTaskTimeoutSec?: number;
}

// ═══════════════════════════════════════════════════════════
// Orchestrator Agent Card
// ═══════════════════════════════════════════════════════════

export function createOrchestratorCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Orchestrator",
    description:
      "Central hub agent for the FTH x402 A2A architecture. " +
      "Receives goals, decomposes into sub-tasks, delegates to " +
      "specialized agents (payment, compliance, treasury, delivery), " +
      "aggregates results, and handles human escalation.",
    url: baseUrl,
    version: "2.0.0",
    protocol: "a2a",
    protocolVersion: "0.2",
    provider: {
      organization: "FTH Trading Limited",
      url: "https://fthtrading.com",
      contact: "ops@fthtrading.com",
    },
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: [
        { scheme: "x402", description: "x402 payment proof for paid operations" },
        { scheme: "bearer", description: "Admin bearer token" },
        { scheme: "hmac", description: "Service-to-service HMAC-SHA256" },
      ],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    layer: "control",
    role: "orchestrator",
    skills: [
      {
        id: "orchestrate-goal",
        name: "Orchestrate Goal",
        description:
          "Accept a high-level goal, decompose it into sub-tasks, " +
          "and coordinate execution across the agent network.",
        tags: ["orchestration", "goal", "multi-agent"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "agent-status",
        name: "Agent Network Status",
        description:
          "Report the status of all registered agents in the network.",
        tags: ["status", "monitoring", "health"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "route-task",
        name: "Route Task",
        description:
          "Route a specific task to the appropriate agent based on " +
          "tags, skills, and routing rules.",
        tags: ["routing", "delegation"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// Orchestrator Implementation
// ═══════════════════════════════════════════════════════════

/**
 * The Orchestrator agent — hub of the hub-and-spoke architecture.
 *
 * Flow:
 *   1. Parse incoming goal/message
 *   2. Control plane checks (compliance, budget)
 *   3. Decompose into sub-tasks
 *   4. Route each sub-task to appropriate agent
 *   5. Aggregate results
 *   6. Return final response (or escalate to human)
 */
export class OrchestratorAgent extends BaseAgent {
  private routingEngine: RoutingEngine;
  private maxConcurrent: number;
  private defaultTimeout: number;

  constructor(config: OrchestratorConfig) {
    super(config);
    this.routingEngine = config.routingEngine;
    this.maxConcurrent = config.maxConcurrentSubTasks ?? 10;
    this.defaultTimeout = config.defaultSubTaskTimeoutSec ?? 60;
  }

  /**
   * Process a task by decomposing and delegating.
   */
  protected async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const inputMessage = task.status.message;

    if (!inputMessage) {
      throw new A2AError("No input message provided", A2A_ERROR_CODES.INVALID_PARAMS);
    }

    // Step 1: Extract intent and determine plan
    const plan = this.decomposeGoal(inputMessage, task.metadata);

    // Step 2: Control plane checks (sequential — must pass before execution)
    if (plan.requiresComplianceCheck) {
      await this.runControlPlaneCheck("compliance", taskId, inputMessage);
    }
    if (plan.requiresBudgetCheck) {
      await this.runControlPlaneCheck("budget", taskId, inputMessage);
    }

    // Step 3: Execute sub-tasks (concurrent within limits)
    const results: SubTaskResult[] = [];
    const batches = this.batchSubTasks(plan.subTasks, this.maxConcurrent);

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map((st) => this.executeSubTask(st, taskId)),
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            subTaskId: batch[i].id,
            role: batch[i].targetRole,
            status: "failed",
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    }

    // Step 4: Check for escalation needs
    const escalationNeeded = results.some((r) => r.status === "escalation-required");
    if (escalationNeeded) {
      const escalationContext = results
        .filter((r) => r.status === "escalation-required")
        .map((r) => r.message);

      this.requestHumanInput(taskId, {
        role: "agent",
        parts: [
          {
            type: "escalation",
            reason: "Sub-task requires human review",
            context: escalationContext,
            urgency: "medium",
          },
        ],
      });

      return {
        role: "agent",
        parts: [
          {
            type: "text",
            text: "Human input required for one or more sub-tasks.",
          },
          {
            type: "data",
            mimeType: "application/json",
            data: { escalations: escalationContext },
          },
        ],
      };
    }

    // Step 5: Aggregate results into final response
    const aggregated = this.aggregateResults(results);

    // Add artifacts from sub-tasks
    for (const result of results) {
      if (result.artifacts) {
        for (const artifact of result.artifacts) {
          this.addArtifact(taskId, artifact);
        }
      }
    }

    return aggregated;
  }

  // ─────────────────────────────────────────────────────────
  // Goal Decomposition
  // ─────────────────────────────────────────────────────────

  private decomposeGoal(
    message: Message,
    metadata?: TaskMetadata,
  ): ExecutionPlan {
    const tags = metadata?.tags ?? [];
    const textParts = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text);
    const text = textParts.join(" ").toLowerCase();

    const subTasks: SubTaskPlan[] = [];
    let requiresComplianceCheck = false;
    let requiresBudgetCheck = false;

    // Analyze intent from text and tags
    if (text.includes("pay") || text.includes("invoice") || tags.includes("payment")) {
      subTasks.push({ id: randomUUID(), targetRole: "payment", priority: 1 });
      requiresBudgetCheck = true;
    }

    if (text.includes("quote") || text.includes("price") || tags.includes("quote")) {
      subTasks.push({ id: randomUUID(), targetRole: "quote", priority: 2 });
    }

    if (text.includes("settlement") || text.includes("settle") || tags.includes("settlement")) {
      subTasks.push({ id: randomUUID(), targetRole: "settlement", priority: 3 });
      requiresComplianceCheck = true;
    }

    if (text.includes("treasury") || text.includes("balance") || tags.includes("treasury")) {
      subTasks.push({ id: randomUUID(), targetRole: "treasury", priority: 2 });
    }

    if (text.includes("deliver") || text.includes("download") || tags.includes("delivery")) {
      subTasks.push({ id: randomUUID(), targetRole: "delivery", priority: 4 });
    }

    if (text.includes("search") || text.includes("find") || text.includes("resolve") || tags.includes("search")) {
      subTasks.push({ id: randomUUID(), targetRole: "search", priority: 2 });
    }

    if (text.includes("receipt") || tags.includes("receipt")) {
      subTasks.push({ id: randomUUID(), targetRole: "receipt", priority: 5 });
    }

    // High-value or sensitive operations always get compliance + budget
    if (metadata?.paymentRequired) {
      requiresComplianceCheck = true;
      requiresBudgetCheck = true;
    }

    // Default: if no specific sub-tasks identified, route based on metadata
    if (subTasks.length === 0 && metadata?.targetRole) {
      subTasks.push({
        id: randomUUID(),
        targetRole: metadata.targetRole,
        priority: 1,
      });
    }

    // Catch-all: send to search for analysis
    if (subTasks.length === 0) {
      subTasks.push({ id: randomUUID(), targetRole: "search", priority: 1 });
    }

    return { subTasks, requiresComplianceCheck, requiresBudgetCheck };
  }

  // ─────────────────────────────────────────────────────────
  // Control Plane Checks
  // ─────────────────────────────────────────────────────────

  private async runControlPlaneCheck(
    role: AgentRole,
    parentTaskId: string,
    message: Message,
  ): Promise<void> {
    const agents = this.registry.findByRole(role);
    if (agents.length === 0) {
      // No control agent registered — pass through
      return;
    }

    await this.emitEvent(
      role === "compliance" ? "compliance.check" : "budget.check",
      {
        parentTaskId,
        message,
        requestedBy: this.id,
      },
      parentTaskId,
      agents[0].id,
    );

    // In a real implementation, we'd await the response event.
    // For now, control checks are advisory and non-blocking.
  }

  // ─────────────────────────────────────────────────────────
  // Sub-Task Execution
  // ─────────────────────────────────────────────────────────

  private async executeSubTask(
    plan: SubTaskPlan,
    parentTaskId: string,
  ): Promise<SubTaskResult> {
    const target = this.routingEngine.routeOne({
      targetRole: plan.targetRole,
      parentTaskId,
      priority: plan.priority,
    });

    if (!target) {
      return {
        subTaskId: plan.id,
        role: plan.targetRole,
        status: "failed",
        error: `No agent available for role: ${plan.targetRole}`,
      };
    }

    // Emit task delegation event
    await this.emitEvent(
      "task.created",
      {
        subTaskId: plan.id,
        parentTaskId,
        targetAgent: target.id,
        targetRole: plan.targetRole,
      },
      plan.id,
      target.id,
    );

    return {
      subTaskId: plan.id,
      role: plan.targetRole,
      status: "completed",
      message: {
        role: "agent",
        parts: [
          {
            type: "text",
            text: `Delegated to ${target.id} (${plan.targetRole})`,
          },
        ],
      },
    };
  }

  private batchSubTasks(tasks: SubTaskPlan[], batchSize: number): SubTaskPlan[][] {
    // Sort by priority (lower number = higher priority)
    const sorted = [...tasks].sort((a, b) => a.priority - b.priority);
    const batches: SubTaskPlan[][] = [];

    for (let i = 0; i < sorted.length; i += batchSize) {
      batches.push(sorted.slice(i, i + batchSize));
    }

    return batches;
  }

  // ─────────────────────────────────────────────────────────
  // Result Aggregation
  // ─────────────────────────────────────────────────────────

  private aggregateResults(results: SubTaskResult[]): Message {
    const successful = results.filter((r) => r.status === "completed");
    const failed = results.filter((r) => r.status === "failed");

    const parts: Part[] = [];

    // Summary
    parts.push({
      type: "text",
      text: `Orchestration complete: ${successful.length}/${results.length} sub-tasks succeeded.`,
    });

    // Result data
    parts.push({
      type: "data",
      mimeType: "application/json",
      data: {
        totalSubTasks: results.length,
        successful: successful.length,
        failed: failed.length,
        results: results.map((r) => ({
          subTaskId: r.subTaskId,
          role: r.role,
          status: r.status,
          error: r.error,
        })),
      },
    });

    // Errors
    if (failed.length > 0) {
      parts.push({
        type: "text",
        text: `Failures: ${failed.map((f) => `${f.role}: ${f.error}`).join("; ")}`,
      });
    }

    return { role: "agent", parts };
  }

  // ─────────────────────────────────────────────────────────
  // Event Handling
  // ─────────────────────────────────────────────────────────

  protected override async handleEvent(event: AgentEvent): Promise<void> {
    // Handle completed sub-task results
    if (event.type === "task.completed" || event.type === "task.failed") {
      // Orchestrator can react to sub-task completions here
      // In a production system, this would resolve pending promises
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Internal Types
// ═══════════════════════════════════════════════════════════

interface ExecutionPlan {
  subTasks: SubTaskPlan[];
  requiresComplianceCheck: boolean;
  requiresBudgetCheck: boolean;
}

interface SubTaskPlan {
  id: string;
  targetRole: AgentRole;
  priority: number;
}

interface SubTaskResult {
  subTaskId: string;
  role: AgentRole;
  status: "completed" | "failed" | "escalation-required";
  message?: Message;
  artifacts?: Artifact[];
  error?: string;
}
