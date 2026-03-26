/**
 * FTH x402 A2A — Agent Registry & Routing Engine
 *
 * Manages agent discovery, registration, health monitoring,
 * and intelligent task routing based on rules.
 *
 * Architecture:
 *   - Hub-and-spoke: Orchestrator queries registry to find agents
 *   - Control/execution split: Control plane agents checked first
 *   - Route rules: Declarative matching on tags, skills, roles, layers
 */

import type {
  AgentCard,
  AgentLayer,
  AgentRole,
  AgentRegistryEntry,
  RouteRule,
  TaskMetadata,
  AgentEvent,
} from "./types";
import type { EventBus } from "./events";

// ═══════════════════════════════════════════════════════════
// Agent Registry
// ═══════════════════════════════════════════════════════════

export interface RegistryOptions {
  /** Health check interval in ms. Default: 30_000. */
  healthCheckIntervalMs?: number;
  /** Mark agent offline after N missed heartbeats. Default: 3. */
  maxMissedHeartbeats?: number;
}

/**
 * In-memory agent registry.
 *
 * Agents register with their AgentCard, and the registry
 * maintains health status and enables discovery by role, layer,
 * or skill.
 */
export class AgentRegistry {
  private agents = new Map<string, AgentRegistryEntry>();
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private eventBus?: EventBus;
  private opts: Required<RegistryOptions>;

  constructor(opts: RegistryOptions = {}, eventBus?: EventBus) {
    this.opts = {
      healthCheckIntervalMs: opts.healthCheckIntervalMs ?? 30_000,
      maxMissedHeartbeats: opts.maxMissedHeartbeats ?? 3,
    };
    this.eventBus = eventBus;
  }

  /**
   * Register an agent in the registry.
   */
  register(
    id: string,
    card: AgentCard,
    layer: AgentLayer,
    role: AgentRole,
    endpoint: string,
    healthEndpoint?: string,
  ): AgentRegistryEntry {
    const entry: AgentRegistryEntry = {
      id,
      card,
      layer,
      role,
      endpoint,
      healthEndpoint,
      status: "active",
      lastHeartbeat: new Date().toISOString(),
    };

    this.agents.set(id, entry);

    // Notify
    this.eventBus?.emit({
      type: "agent.registered",
      source: "registry",
      timestamp: new Date().toISOString(),
      payload: { id, role, layer, endpoint },
    });

    return entry;
  }

  /**
   * Unregister an agent.
   */
  unregister(id: string): boolean {
    return this.agents.delete(id);
  }

  /**
   * Record a heartbeat from an agent.
   */
  heartbeat(id: string): void {
    const entry = this.agents.get(id);
    if (entry) {
      entry.lastHeartbeat = new Date().toISOString();
      if (entry.status === "offline") {
        entry.status = "active";
      }
    }
  }

  /**
   * Get an agent by ID.
   */
  get(id: string): AgentRegistryEntry | undefined {
    return this.agents.get(id);
  }

  /**
   * Find agents by role.
   */
  findByRole(role: AgentRole): AgentRegistryEntry[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.role === role && a.status !== "offline",
    );
  }

  /**
   * Find agents by layer.
   */
  findByLayer(layer: AgentLayer): AgentRegistryEntry[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.layer === layer && a.status !== "offline",
    );
  }

  /**
   * Find agents by skill ID.
   */
  findBySkill(skillId: string): AgentRegistryEntry[] {
    return Array.from(this.agents.values()).filter(
      (a) =>
        a.status !== "offline" &&
        a.card.skills.some((s) => s.id === skillId),
    );
  }

  /**
   * Find agents matching a tag.
   */
  findByTag(tag: string): AgentRegistryEntry[] {
    return Array.from(this.agents.values()).filter(
      (a) =>
        a.status !== "offline" &&
        a.card.skills.some((s) => s.tags.includes(tag)),
    );
  }

  /**
   * Get all registered agents.
   */
  all(): AgentRegistryEntry[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get all active agents.
   */
  active(): AgentRegistryEntry[] {
    return Array.from(this.agents.values()).filter((a) => a.status === "active");
  }

  /**
   * Start periodic health checking.
   */
  startHealthChecks(): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => {
      this.checkHealth();
    }, this.opts.healthCheckIntervalMs);
  }

  /**
   * Stop health checking.
   */
  stopHealthChecks(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private checkHealth(): void {
    const now = Date.now();
    const maxAge = this.opts.healthCheckIntervalMs * this.opts.maxMissedHeartbeats;

    for (const entry of this.agents.values()) {
      const lastBeat = new Date(entry.lastHeartbeat).getTime();
      const age = now - lastBeat;

      if (age > maxAge && entry.status !== "offline") {
        entry.status = "offline";
        this.eventBus?.emit({
          type: "agent.healthCheck",
          source: "registry",
          timestamp: new Date().toISOString(),
          payload: {
            id: entry.id,
            status: "offline",
            lastHeartbeat: entry.lastHeartbeat,
          },
        });
      } else if (age > maxAge * 0.66 && entry.status === "active") {
        entry.status = "degraded";
      }
    }
  }

  /**
   * Summary for monitoring.
   */
  summary(): {
    total: number;
    active: number;
    degraded: number;
    offline: number;
    byLayer: Record<string, number>;
    byRole: Record<string, number>;
  } {
    const result = {
      total: 0,
      active: 0,
      degraded: 0,
      offline: 0,
      byLayer: {} as Record<string, number>,
      byRole: {} as Record<string, number>,
    };

    for (const entry of this.agents.values()) {
      result.total++;
      if (entry.status === "active") result.active++;
      else if (entry.status === "degraded") result.degraded++;
      else result.offline++;

      result.byLayer[entry.layer] = (result.byLayer[entry.layer] ?? 0) + 1;
      result.byRole[entry.role] = (result.byRole[entry.role] ?? 0) + 1;
    }

    return result;
  }
}

// ═══════════════════════════════════════════════════════════
// Routing Engine
// ═══════════════════════════════════════════════════════════

/**
 * Routing engine — resolves task metadata to target agent(s).
 *
 * Uses declarative route rules evaluated in priority order.
 * Falls back to role-based lookup if no rules match.
 */
export class RoutingEngine {
  private rules: RouteRule[] = [];

  constructor(
    private registry: AgentRegistry,
    rules?: RouteRule[],
  ) {
    if (rules) {
      this.rules = [...rules].sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Add a routing rule.
   */
  addRule(rule: RouteRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a routing rule by ID.
   */
  removeRule(id: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Route a task to the appropriate agent(s).
   *
   * Resolution order:
   *   1. Direct target — metadata.targetAgent specified
   *   2. Role target — metadata.targetRole specified
   *   3. Rule matching — evaluate rules against metadata/tags
   *   4. Fallback — default role mapping
   *
   * @returns Array of matching registry entries (may be empty)
   */
  route(metadata?: TaskMetadata): AgentRegistryEntry[] {
    // 1. Direct agent target
    if (metadata?.targetAgent) {
      const direct = this.registry.get(metadata.targetAgent);
      if (direct && direct.status !== "offline") {
        return [direct];
      }
    }

    // 2. Direct role target
    if (metadata?.targetRole) {
      const byRole = this.registry.findByRole(metadata.targetRole);
      if (byRole.length > 0) return byRole;
    }

    // 3. Rule-based matching
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (this.matchesRule(rule, metadata)) {
        const targets = this.registry.findByRole(rule.target.role);
        if (targets.length > 0) return targets;

        // Try fallback role
        if (rule.target.fallback) {
          const fallback = this.registry.findByRole(rule.target.fallback);
          if (fallback.length > 0) return fallback;
        }
      }
    }

    // 4. No match — return empty
    return [];
  }

  /**
   * Route to a single agent (pick best from matches).
   */
  routeOne(metadata?: TaskMetadata): AgentRegistryEntry | undefined {
    const matches = this.route(metadata);
    if (matches.length === 0) return undefined;

    // Prefer active over degraded
    const active = matches.filter((a) => a.status === "active");
    return active.length > 0 ? active[0] : matches[0];
  }

  private matchesRule(rule: RouteRule, metadata?: TaskMetadata): boolean {
    const match = rule.match;

    // Tag matching
    if (match.tags && match.tags.length > 0) {
      const taskTags = metadata?.tags ?? [];
      if (!match.tags.some((t) => taskTags.includes(t))) return false;
    }

    // Payment required matching
    if (match.paymentRequired !== undefined) {
      const hasPay = !!metadata?.paymentRequired;
      if (match.paymentRequired !== hasPay) return false;
    }

    // Priority matching
    if (match.minPriority !== undefined) {
      const taskPriority = metadata?.priority ?? 0;
      if (taskPriority < match.minPriority) return false;
    }

    // Role matching
    if (match.roles && match.roles.length > 0) {
      if (!metadata?.targetRole || !match.roles.includes(metadata.targetRole)) {
        return false;
      }
    }

    // Layer matching
    if (match.layers && match.layers.length > 0) {
      // Check if target role belongs to one of the specified layers
      // This requires registry lookup — check if any agent in those layers exists
      const layerAgents = match.layers.flatMap((l) => this.registry.findByLayer(l));
      if (layerAgents.length === 0) return false;
    }

    return true;
  }

  /**
   * Get all configured rules.
   */
  getRules(): RouteRule[] {
    return [...this.rules];
  }
}

// ═══════════════════════════════════════════════════════════
// Default Route Rules
// ═══════════════════════════════════════════════════════════

/**
 * Default routing rules for the FTH A2A architecture.
 *
 * These implement the hub-and-spoke + control/execution split:
 *   - Payment-related tasks → commerce plane
 *   - Compliance tags → compliance agent
 *   - High-priority → orchestrator first
 *   - Delivery tags → work plane
 */
export const DEFAULT_ROUTE_RULES: RouteRule[] = [
  {
    id: "compliance-check",
    description: "Route compliance/KYC/AML tasks to compliance agent",
    match: { tags: ["compliance", "kyc", "aml", "sanctions"] },
    target: { role: "compliance", fallback: "guardian" },
    priority: 100,
    enabled: true,
  },
  {
    id: "budget-check",
    description: "Route budget and spend-control tasks to budget agent",
    match: { tags: ["budget", "spend", "limit", "policy"] },
    target: { role: "budget", fallback: "guardian" },
    priority: 95,
    enabled: true,
  },
  {
    id: "payment-flow",
    description: "Route payment tasks to payment agent",
    match: { tags: ["payment", "x402", "invoice", "402"] },
    target: { role: "payment", fallback: "treasury" },
    priority: 90,
    enabled: true,
  },
  {
    id: "quote-request",
    description: "Route pricing/quote tasks to quote agent",
    match: { tags: ["quote", "pricing", "estimate", "cost"] },
    target: { role: "quote" },
    priority: 85,
    enabled: true,
  },
  {
    id: "treasury-ops",
    description: "Route treasury operations to treasury agent",
    match: { tags: ["treasury", "balance", "settlement", "wallet", "deposit"] },
    target: { role: "treasury" },
    priority: 80,
    enabled: true,
  },
  {
    id: "receipt-ops",
    description: "Route receipt operations to receipt agent",
    match: { tags: ["receipt", "anchor", "verify-receipt"] },
    target: { role: "receipt" },
    priority: 75,
    enabled: true,
  },
  {
    id: "delivery-work",
    description: "Route delivery/artifact tasks to delivery agent",
    match: { tags: ["delivery", "artifact", "download", "export"] },
    target: { role: "delivery" },
    priority: 70,
    enabled: true,
  },
  {
    id: "search-intel",
    description: "Route search and intelligence tasks to search agent",
    match: { tags: ["search", "lookup", "intelligence", "namespace", "resolve"] },
    target: { role: "search" },
    priority: 65,
    enabled: true,
  },
  {
    id: "settlement-work",
    description: "Route settlement tasks to settlement agent",
    match: { tags: ["settlement", "anchor", "l1", "chain"] },
    target: { role: "settlement" },
    priority: 60,
    enabled: true,
  },
  {
    id: "outreach-partner",
    description: "Route outreach/partner tasks to outreach agent",
    match: { tags: ["outreach", "partner", "marketplace", "discovery"] },
    target: { role: "outreach", fallback: "registry" },
    priority: 55,
    enabled: true,
  },
  {
    id: "guardian-security",
    description: "Route security tasks to guardian agent",
    match: { tags: ["security", "enforce", "sentinel", "audit"] },
    target: { role: "guardian" },
    priority: 50,
    enabled: true,
  },
  {
    id: "high-priority-escalation",
    description: "Route high-priority tasks to orchestrator",
    match: { minPriority: 8 },
    target: { role: "orchestrator" },
    priority: 200,
    enabled: true,
  },
];
