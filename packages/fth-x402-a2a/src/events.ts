/**
 * FTH x402 A2A — Event Bus
 *
 * Async inter-agent communication layer.
 * Supports typed events, pub/sub, and event replay.
 *
 * Architecture pattern: Event-driven async with fan-out.
 */

import type { AgentEvent, AgentEventType, AgentEventHandler } from "./types";

// ═══════════════════════════════════════════════════════════
// Event Bus
// ═══════════════════════════════════════════════════════════

export interface EventBusOptions {
  /** Max events to keep in replay buffer. Default: 1000. */
  maxReplayBuffer?: number;
  /** Whether to log events to console. Default: false. */
  debug?: boolean;
}

/**
 * In-memory event bus for inter-agent communication.
 *
 * Supports:
 *   - Typed event subscriptions
 *   - Wildcard subscriptions ("*")
 *   - Event replay for late subscribers
 *   - Fire-and-forget async delivery
 *   - Event filtering by source/target
 */
export class EventBus {
  private handlers = new Map<string, Set<AgentEventHandler>>();
  private replayBuffer: AgentEvent[] = [];
  private opts: Required<EventBusOptions>;

  constructor(opts: EventBusOptions = {}) {
    this.opts = {
      maxReplayBuffer: opts.maxReplayBuffer ?? 1000,
      debug: opts.debug ?? false,
    };
  }

  /**
   * Subscribe to events of a specific type.
   *
   * Use "*" to subscribe to all events.
   */
  on<T = unknown>(eventType: AgentEventType | "*", handler: AgentEventHandler<T>): () => void {
    const key = eventType;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }
    this.handlers.get(key)!.add(handler as AgentEventHandler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(key)?.delete(handler as AgentEventHandler);
    };
  }

  /**
   * Subscribe to events once — auto-unsubscribe after first delivery.
   */
  once<T = unknown>(eventType: AgentEventType, handler: AgentEventHandler<T>): () => void {
    const wrappedHandler: AgentEventHandler = async (event) => {
      unsubscribe();
      await (handler as AgentEventHandler)(event);
    };
    const unsubscribe = this.on(eventType, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Emit an event to all subscribers.
   *
   * Delivery is fire-and-forget — handler errors are logged
   * but do not affect other handlers.
   */
  async emit<T = unknown>(event: AgentEvent<T>): Promise<void> {
    if (this.opts.debug) {
      console.log(`[A2A:EventBus] ${event.type} from=${event.source} task=${event.taskId ?? "-"}`);
    }

    // Add to replay buffer
    this.replayBuffer.push(event as AgentEvent);
    if (this.replayBuffer.length > this.opts.maxReplayBuffer) {
      this.replayBuffer.shift();
    }

    // Deliver to type-specific handlers
    const typeHandlers = this.handlers.get(event.type) ?? new Set();
    const wildcardHandlers = this.handlers.get("*") ?? new Set();
    const allHandlers = new Set([...typeHandlers, ...wildcardHandlers]);

    const deliveries = Array.from(allHandlers).map(async (handler) => {
      try {
        await handler(event as AgentEvent);
      } catch (err) {
        console.error(
          `[A2A:EventBus] Handler error (${event.type}):`,
          err instanceof Error ? err.message : err,
        );
      }
    });

    await Promise.allSettled(deliveries);
  }

  /**
   * Emit an event targeting a specific agent.
   */
  async emitTo<T = unknown>(
    target: string,
    type: AgentEventType,
    source: string,
    payload: T,
    taskId?: string,
  ): Promise<void> {
    await this.emit({
      type,
      source,
      target,
      taskId,
      timestamp: new Date().toISOString(),
      payload,
    });
  }

  /**
   * Replay events matching a filter.
   * Useful for late-joining agents that need to catch up.
   */
  replay(filter: {
    type?: AgentEventType;
    source?: string;
    target?: string;
    taskId?: string;
    since?: string;
  }): AgentEvent[] {
    return this.replayBuffer.filter((event) => {
      if (filter.type && event.type !== filter.type) return false;
      if (filter.source && event.source !== filter.source) return false;
      if (filter.target && event.target !== filter.target) return false;
      if (filter.taskId && event.taskId !== filter.taskId) return false;
      if (filter.since && event.timestamp < filter.since) return false;
      return true;
    });
  }

  /**
   * Get stats about the event bus.
   */
  stats(): {
    subscriberCount: number;
    replayBufferSize: number;
    eventTypes: string[];
  } {
    let total = 0;
    for (const handlers of this.handlers.values()) {
      total += handlers.size;
    }
    return {
      subscriberCount: total,
      replayBufferSize: this.replayBuffer.length,
      eventTypes: Array.from(this.handlers.keys()),
    };
  }

  /**
   * Clear all subscriptions and replay buffer.
   */
  clear(): void {
    this.handlers.clear();
    this.replayBuffer = [];
  }
}
