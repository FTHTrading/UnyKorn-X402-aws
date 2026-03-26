/**
 * FTH x402 A2A — Base Agent
 *
 * Abstract base class for all A2A agents.
 * Provides:
 *   - Agent card management
 *   - JSON-RPC method handler registration
 *   - Task send/get/cancel implementation
 *   - Event bus integration
 *   - Health endpoint
 */

import { randomUUID } from "crypto";
import type {
  AgentCard,
  AgentLayer,
  AgentRole,
  Task,
  TaskSendParams,
  TaskGetParams,
  TaskCancelParams,
  Message,
  Artifact,
  AgentEvent,
  AgentEventHandler,
} from "../types";
import type { A2AMethodHandlers } from "../transport";
import { A2AError } from "../transport";
import { A2A_ERROR_CODES } from "../types";
import type { TaskManager } from "../task";
import type { EventBus } from "../events";
import type { AgentRegistry } from "../registry";

// ═══════════════════════════════════════════════════════════
// Base Agent Interface
// ═══════════════════════════════════════════════════════════

export interface BaseAgentConfig {
  id: string;
  card: AgentCard;
  layer: AgentLayer;
  role: AgentRole;
  endpoint: string;
  taskManager: TaskManager;
  eventBus: EventBus;
  registry: AgentRegistry;
}

/**
 * Abstract base class for all FTH A2A agents.
 *
 * Subclasses implement `processTask()` to define their behavior.
 * All JSON-RPC plumbing, task lifecycle, and event integration
 * is handled automatically.
 */
export abstract class BaseAgent {
  readonly id: string;
  readonly card: AgentCard;
  readonly layer: AgentLayer;
  readonly role: AgentRole;
  readonly endpoint: string;

  protected taskManager: TaskManager;
  protected eventBus: EventBus;
  protected registry: AgentRegistry;
  private cleanups: (() => void)[] = [];

  constructor(config: BaseAgentConfig) {
    this.id = config.id;
    this.card = config.card;
    this.layer = config.layer;
    this.role = config.role;
    this.endpoint = config.endpoint;
    this.taskManager = config.taskManager;
    this.eventBus = config.eventBus;
    this.registry = config.registry;
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  /**
   * Start the agent — register in registry, subscribe to events,
   * and begin processing.
   */
  async start(): Promise<void> {
    // Register in the agent registry
    this.registry.register(
      this.id,
      this.card,
      this.layer,
      this.role,
      this.endpoint,
      `${this.endpoint}/health`,
    );

    // Subscribe to targeted events
    const unsub = this.eventBus.on("*", async (event) => {
      if (event.target === this.id || event.target === this.role) {
        await this.handleEvent(event);
      }
    });
    this.cleanups.push(unsub);

    // Call subclass init
    await this.onStart();
  }

  /**
   * Stop the agent — unregister, unsubscribe.
   */
  async stop(): Promise<void> {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];
    this.registry.unregister(this.id);
    await this.onStop();
  }

  /**
   * Override to add startup logic.
   */
  protected async onStart(): Promise<void> {}

  /**
   * Override to add shutdown logic.
   */
  protected async onStop(): Promise<void> {}

  // ─────────────────────────────────────────────────────────
  // JSON-RPC Handlers
  // ─────────────────────────────────────────────────────────

  /**
   * Get the A2A method handlers for this agent.
   * Wire this into the Fastify route handler.
   */
  getHandlers(): A2AMethodHandlers {
    return {
      "tasks/send": async (params: TaskSendParams) => this.handleTaskSend(params),
      "tasks/get": async (params: TaskGetParams) => this.handleTaskGet(params),
      "tasks/cancel": async (params: TaskCancelParams) => this.handleTaskCancel(params),
      "agents/discover": async () => this.card,
      "agents/health": async () => this.getHealth(),
    };
  }

  private async handleTaskSend(params: TaskSendParams): Promise<Task> {
    // Create the task
    const task = this.taskManager.createTask({
      ...params,
      metadata: {
        ...params.metadata,
        targetRole: this.role,
        targetAgent: this.id,
      },
    });

    // Transition to working
    this.taskManager.markWorking(task.id);

    // Process asynchronously
    this.processTaskSafe(task.id).catch((err) => {
      console.error(`[${this.id}] Task processing error:`, err);
    });

    return this.taskManager.requireTask(task.id);
  }

  private async handleTaskGet(params: TaskGetParams): Promise<Task> {
    const task = this.taskManager.getTask(params.id);
    if (!task) {
      throw new A2AError("Task not found", A2A_ERROR_CODES.TASK_NOT_FOUND);
    }

    // Optionally trim history
    if (params.historyLength !== undefined && task.history) {
      task.history = task.history.slice(-params.historyLength);
    }

    return task;
  }

  private async handleTaskCancel(params: TaskCancelParams): Promise<Task> {
    const task = this.taskManager.getTask(params.id);
    if (!task) {
      throw new A2AError("Task not found", A2A_ERROR_CODES.TASK_NOT_FOUND);
    }

    try {
      return this.taskManager.markCanceled(params.id);
    } catch {
      throw new A2AError(
        "Task is not cancelable in current state",
        A2A_ERROR_CODES.TASK_NOT_CANCELABLE,
      );
    }
  }

  // ─────────────────────────────────────────────────────────
  // Task Processing (Subclass Hook)
  // ─────────────────────────────────────────────────────────

  /**
   * Process a task — IMPLEMENT THIS IN SUBCLASSES.
   *
   * The task is already in "working" state when this is called.
   * You should:
   *   1. Read the task's input message
   *   2. Do your work (call other agents, compute, etc.)
   *   3. Add artifacts via addArtifact()
   *   4. Return a result message
   *
   * If you need human input, call requestHumanInput().
   * If the task fails, throw an error.
   */
  protected abstract processTask(taskId: string): Promise<Message>;

  /**
   * Safe wrapper that catches errors and transitions task state.
   */
  private async processTaskSafe(taskId: string): Promise<void> {
    try {
      const resultMessage = await this.processTask(taskId);
      if (!this.taskManager.isTerminal(taskId)) {
        this.taskManager.markCompleted(taskId, resultMessage);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (!this.taskManager.isTerminal(taskId)) {
        this.taskManager.markFailed(taskId, reason);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Helpers for Subclasses
  // ─────────────────────────────────────────────────────────

  /**
   * Add an artifact to a task being processed.
   */
  protected addArtifact(taskId: string, artifact: Artifact): void {
    this.taskManager.addArtifact(taskId, artifact);
  }

  /**
   * Request human input for a task (human-in-the-loop).
   */
  protected requestHumanInput(taskId: string, message: Message): void {
    this.taskManager.requestInput(taskId, message);
  }

  /**
   * Delegate a sub-task to another agent by role.
   */
  protected async delegateToRole(
    role: AgentRole,
    message: Message,
    parentTaskId?: string,
  ): Promise<Task> {
    const agent = this.registry.findByRole(role);
    if (agent.length === 0) {
      throw new A2AError(
        `No agent found for role: ${role}`,
        A2A_ERROR_CODES.AGENT_NOT_FOUND,
      );
    }

    // Create sub-task via event
    const subTaskId = randomUUID();
    await this.eventBus.emitTo(agent[0].id, "task.created", this.id, {
      id: subTaskId,
      message,
      parentTaskId,
      sourceAgent: this.id,
      targetRole: role,
    }, subTaskId);

    // Return a placeholder task — the target agent will pick it up
    return {
      id: subTaskId,
      status: {
        state: "submitted",
        message,
        timestamp: new Date().toISOString(),
      },
      metadata: {
        sourceAgent: this.id,
        targetRole: role,
        parentTaskId,
      },
    };
  }

  /**
   * Emit an event to the bus.
   */
  protected async emitEvent<T>(
    type: AgentEvent<T>["type"],
    payload: T,
    taskId?: string,
    target?: string,
  ): Promise<void> {
    await this.eventBus.emit({
      type,
      source: this.id,
      target,
      taskId,
      timestamp: new Date().toISOString(),
      payload,
    });
  }

  /**
   * Handle an incoming event. Override in subclasses for custom logic.
   */
  protected async handleEvent(_event: AgentEvent): Promise<void> {}

  // ─────────────────────────────────────────────────────────
  // Health
  // ─────────────────────────────────────────────────────────

  private getHealth(): {
    agentId: string;
    role: AgentRole;
    layer: AgentLayer;
    status: string;
    taskStats: ReturnType<TaskManager["stats"]>;
    uptime: number;
  } {
    return {
      agentId: this.id,
      role: this.role,
      layer: this.layer,
      status: "healthy",
      taskStats: this.taskManager.stats(),
      uptime: process.uptime(),
    };
  }
}
