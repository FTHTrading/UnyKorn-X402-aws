/**
 * FTH x402 A2A — Task Lifecycle Engine
 *
 * Manages task state machine transitions, history tracking,
 * artifact collection, and session management.
 *
 * State machine:
 *   submitted → working → [input-required] → completed
 *                       → failed
 *                       → canceled
 */

import { randomUUID } from "crypto";
import type {
  Task,
  TaskState,
  TaskStatus,
  TaskMetadata,
  Message,
  Artifact,
  TaskSendParams,
  AgentEvent,
  AgentEventHandler,
  SSEEvent,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from "./types";

// ═══════════════════════════════════════════════════════════
// Valid State Transitions
// ═══════════════════════════════════════════════════════════

const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  submitted: ["working", "canceled", "failed"],
  working: ["completed", "failed", "canceled", "input-required"],
  "input-required": ["working", "canceled", "failed"],
  completed: [],
  failed: [],
  canceled: [],
};

function isValidTransition(from: TaskState, to: TaskState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function isTerminal(state: TaskState): boolean {
  return state === "completed" || state === "failed" || state === "canceled";
}

// ═══════════════════════════════════════════════════════════
// Task Manager
// ═══════════════════════════════════════════════════════════

export interface TaskManagerOptions {
  /** Maximum tasks to keep in memory (LRU eviction). Default: 10_000. */
  maxTasks?: number;
  /** TTL for completed tasks in ms. Default: 1 hour. */
  completedTtlMs?: number;
  /** Keep full state history. Default: true. */
  keepHistory?: boolean;
}

/**
 * In-memory task lifecycle manager.
 *
 * Provides:
 *   - Task creation from TaskSendParams
 *   - State transitions with validation
 *   - History tracking
 *   - Artifact management
 *   - Event emission for async subscribers
 *   - SSE event generation for streaming
 */
export class TaskManager {
  private tasks = new Map<string, Task>();
  private sessions = new Map<string, Set<string>>(); // sessionId → taskIds
  private eventHandlers = new Map<string, Set<AgentEventHandler>>();
  private opts: Required<TaskManagerOptions>;

  constructor(opts: TaskManagerOptions = {}) {
    this.opts = {
      maxTasks: opts.maxTasks ?? 10_000,
      completedTtlMs: opts.completedTtlMs ?? 3_600_000,
      keepHistory: opts.keepHistory ?? true,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Task CRUD
  // ─────────────────────────────────────────────────────────

  /**
   * Create a new task from send params.
   */
  createTask(params: TaskSendParams): Task {
    const now = new Date().toISOString();
    const id = params.id || randomUUID();
    const sessionId = params.sessionId || randomUUID();

    const initialStatus: TaskStatus = {
      state: "submitted",
      message: params.message,
      timestamp: now,
    };

    const task: Task = {
      id,
      sessionId,
      status: initialStatus,
      history: this.opts.keepHistory ? [initialStatus] : undefined,
      artifacts: [],
      metadata: {
        ...params.metadata,
        sourceAgent: params.metadata?.sourceAgent,
      },
    };

    this.tasks.set(id, task);

    // Track session
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set());
    }
    this.sessions.get(sessionId)!.add(id);

    // Evict if over capacity
    this.evictIfNeeded();

    // Emit event
    this.emit({
      type: "task.created",
      source: "task-manager",
      taskId: id,
      timestamp: now,
      payload: task,
    });

    return task;
  }

  /**
   * Get a task by ID. Returns undefined if not found.
   */
  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /**
   * Get a task or throw if not found.
   */
  requireTask(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    return task;
  }

  /**
   * Get all task IDs in a session.
   */
  getSessionTasks(sessionId: string): string[] {
    return Array.from(this.sessions.get(sessionId) ?? []);
  }

  // ─────────────────────────────────────────────────────────
  // State Transitions
  // ─────────────────────────────────────────────────────────

  /**
   * Transition a task to a new state.
   *
   * @param id     Task ID
   * @param state  Target state
   * @param message Optional status message
   * @returns Updated task
   * @throws If transition is invalid
   */
  transition(id: string, state: TaskState, message?: Message): Task {
    const task = this.requireTask(id);
    const currentState = task.status.state;

    if (!isValidTransition(currentState, state)) {
      throw new Error(
        `Invalid state transition: ${currentState} → ${state} (task ${id})`,
      );
    }

    const now = new Date().toISOString();
    const newStatus: TaskStatus = {
      state,
      message,
      timestamp: now,
    };

    task.status = newStatus;
    if (task.history) {
      task.history.push(newStatus);
    }

    // Emit appropriate event
    const eventType =
      state === "completed"
        ? "task.completed"
        : state === "failed"
          ? "task.failed"
          : state === "canceled"
            ? "task.canceled"
            : state === "input-required"
              ? "task.escalated"
              : "task.updated";

    this.emit({
      type: eventType,
      source: "task-manager",
      taskId: id,
      timestamp: now,
      payload: task,
    });

    return task;
  }

  /**
   * Mark a task as working.
   */
  markWorking(id: string, message?: Message): Task {
    return this.transition(id, "working", message);
  }

  /**
   * Mark a task as completed.
   */
  markCompleted(id: string, message?: Message): Task {
    return this.transition(id, "completed", message);
  }

  /**
   * Mark a task as failed.
   */
  markFailed(id: string, reason: string): Task {
    return this.transition(id, "failed", {
      role: "agent",
      parts: [{ type: "text", text: reason }],
    });
  }

  /**
   * Mark a task as canceled.
   */
  markCanceled(id: string): Task {
    return this.transition(id, "canceled");
  }

  /**
   * Request human input (human-in-the-loop).
   */
  requestInput(id: string, message: Message): Task {
    return this.transition(id, "input-required", message);
  }

  /**
   * Is the task in a terminal state?
   */
  isTerminal(id: string): boolean {
    const task = this.tasks.get(id);
    return task ? isTerminal(task.status.state) : true;
  }

  // ─────────────────────────────────────────────────────────
  // Artifacts
  // ─────────────────────────────────────────────────────────

  /**
   * Add an artifact to a task.
   */
  addArtifact(id: string, artifact: Artifact): Task {
    const task = this.requireTask(id);
    if (!task.artifacts) task.artifacts = [];
    artifact.index = task.artifacts.length;
    task.artifacts.push(artifact);
    return task;
  }

  // ─────────────────────────────────────────────────────────
  // SSE Event Generation
  // ─────────────────────────────────────────────────────────

  /**
   * Generate an SSE status update event for a task.
   */
  makeStatusEvent(task: Task): SSEEvent<TaskStatusUpdateEvent> {
    return {
      type: "task-status-update",
      data: {
        id: task.id,
        status: task.status,
        final: isTerminal(task.status.state),
      },
    };
  }

  /**
   * Generate an SSE artifact update event.
   */
  makeArtifactEvent(taskId: string, artifact: Artifact): SSEEvent<TaskArtifactUpdateEvent> {
    return {
      type: "task-artifact-update",
      data: { id: taskId, artifact },
    };
  }

  // ─────────────────────────────────────────────────────────
  // Event Bus (Simple Pub/Sub)
  // ─────────────────────────────────────────────────────────

  /**
   * Subscribe to events of a given type.
   */
  on(eventType: string, handler: AgentEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Unsubscribe from events.
   */
  off(eventType: string, handler: AgentEventHandler): void {
    this.eventHandlers.get(eventType)?.delete(handler);
  }

  /**
   * Emit an event to all subscribers (fire-and-forget).
   */
  private emit(event: AgentEvent): void {
    // Type-specific handlers
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event).catch((err) => {
          console.error(`[A2A] Event handler error (${event.type}):`, err);
        });
      }
    }

    // Wildcard handlers
    const wildcards = this.eventHandlers.get("*");
    if (wildcards) {
      for (const handler of wildcards) {
        handler(event).catch((err) => {
          console.error(`[A2A] Wildcard handler error:`, err);
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Housekeeping
  // ─────────────────────────────────────────────────────────

  private evictIfNeeded(): void {
    if (this.tasks.size <= this.opts.maxTasks) return;

    // Evict oldest completed tasks first
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (this.tasks.size <= this.opts.maxTasks * 0.9) break;
      if (isTerminal(task.status.state)) {
        const taskTs = new Date(task.status.timestamp).getTime();
        if (now - taskTs > this.opts.completedTtlMs) {
          this.tasks.delete(id);
          // Clean session index
          if (task.sessionId) {
            const session = this.sessions.get(task.sessionId);
            session?.delete(id);
            if (session?.size === 0) this.sessions.delete(task.sessionId);
          }
        }
      }
    }
  }

  /**
   * Get stats for monitoring.
   */
  stats(): {
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    sessions: number;
  } {
    let active = 0;
    let completed = 0;
    for (const task of this.tasks.values()) {
      if (isTerminal(task.status.state)) completed++;
      else active++;
    }
    return {
      totalTasks: this.tasks.size,
      activeTasks: active,
      completedTasks: completed,
      sessions: this.sessions.size,
    };
  }
}
