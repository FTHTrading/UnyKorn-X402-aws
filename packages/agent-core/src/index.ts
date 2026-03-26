/**
 * @unykorn/agent-core — Agent Registry & Task Manager
 *
 * Core logic for agent lifecycle, task management, and budget control.
 * This is the central nervous system of the agent mesh.
 */

import { nanoid } from "nanoid";
import type {
  AgentIdentity,
  AgentRole,
  AgentTier,
  AgentStatus,
  AgentTask,
  TaskStatus,
  TaskPriority,
  AgentBudget,
  BudgetPeriod,
  AgentHeartbeat,
} from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Agent Registry
// ═══════════════════════════════════════════════════════════

export class AgentRegistry {
  private agents = new Map<string, AgentIdentity>();

  register(params: {
    name: string;
    orgId: string;
    role: AgentRole;
    tier: AgentTier;
    publicKey: string;
    spendLimitDaily: string;
    spendLimitPerTask: string;
    approvalThreshold: string;
    allowedTools?: string[];
    allowedDataScopes?: string[];
    description?: string;
  }): AgentIdentity {
    const id = `agent:${params.role}-${nanoid(8)}`;
    const now = new Date().toISOString();

    const agent: AgentIdentity = {
      id,
      name: params.name,
      orgId: params.orgId,
      role: params.role,
      tier: params.tier,
      publicKey: params.publicKey,
      status: "active",
      trustScore: 50,
      allowedTools: params.allowedTools ?? [],
      allowedDataScopes: params.allowedDataScopes ?? [],
      spendLimitDaily: params.spendLimitDaily,
      spendLimitPerTask: params.spendLimitPerTask,
      approvalThreshold: params.approvalThreshold,
      lastHeartbeat: null,
      killSwitch: false,
      createdAt: now,
      updatedAt: now,
      description: params.description,
      version: "1.0.0",
    };

    this.agents.set(id, agent);
    return agent;
  }

  get(id: string): AgentIdentity | undefined {
    return this.agents.get(id);
  }

  getByRole(role: AgentRole): AgentIdentity[] {
    return [...this.agents.values()].filter((a) => a.role === role);
  }

  getByTier(tier: AgentTier): AgentIdentity[] {
    return [...this.agents.values()].filter((a) => a.tier === tier);
  }

  getActive(): AgentIdentity[] {
    return [...this.agents.values()].filter((a) => a.status === "active" && !a.killSwitch);
  }

  updateStatus(id: string, status: AgentStatus): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.status = status;
    agent.updatedAt = new Date().toISOString();
    return true;
  }

  kill(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.killSwitch = true;
    agent.status = "revoked";
    agent.updatedAt = new Date().toISOString();
    return true;
  }

  recordHeartbeat(id: string, heartbeat: AgentHeartbeat): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.lastHeartbeat = heartbeat.timestamp;
    agent.updatedAt = new Date().toISOString();
    return true;
  }

  updateTrustScore(id: string, delta: number): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.trustScore = Math.max(0, Math.min(100, agent.trustScore + delta));
    agent.updatedAt = new Date().toISOString();
    return true;
  }

  listAll(): AgentIdentity[] {
    return [...this.agents.values()];
  }

  count(): number {
    return this.agents.size;
  }
}

// ═══════════════════════════════════════════════════════════
// Task Manager
// ═══════════════════════════════════════════════════════════

export class TaskManager {
  private tasks = new Map<string, AgentTask>();

  createTask(params: {
    requesterAgentId: string;
    capability: string;
    description: string;
    maxBudget: string;
    priority?: TaskPriority;
    expiresAt?: string;
  }): AgentTask {
    const taskId = `task:${nanoid(12)}`;
    const now = new Date().toISOString();

    const task: AgentTask = {
      taskId,
      requesterAgentId: params.requesterAgentId,
      performerAgentId: null,
      capability: params.capability,
      description: params.description,
      quotedCost: null,
      maxBudget: params.maxBudget,
      status: "requested",
      priority: params.priority ?? "normal",
      proofRefs: [],
      artifactHash: null,
      policyDecisionId: null,
      errorMessage: null,
      requestedAt: now,
      quotedAt: null,
      approvedAt: null,
      executionStartedAt: null,
      deliveredAt: null,
      settledAt: null,
      expiresAt: params.expiresAt ?? null,
      idempotencyKey: `idem:${nanoid(16)}`,
    };

    this.tasks.set(taskId, task);
    return task;
  }

  get(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  transition(taskId: string, newStatus: TaskStatus, updates?: Partial<AgentTask>): AgentTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    // Validate state transitions
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      requested: ["quoted", "cancelled", "failed"],
      quoted: ["approved", "cancelled", "failed"],
      approved: ["budget-reserved", "cancelled", "failed"],
      "budget-reserved": ["executing", "cancelled", "failed"],
      executing: ["delivered", "failed", "escalated"],
      delivered: ["settled", "disputed", "failed"],
      settled: [],
      disputed: ["settled", "failed", "escalated"],
      failed: [],
      cancelled: [],
      escalated: ["executing", "failed", "cancelled"],
    };

    const allowed = validTransitions[task.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return null; // Invalid transition
    }

    task.status = newStatus;
    const now = new Date().toISOString();

    // Set timestamps based on status
    switch (newStatus) {
      case "quoted": task.quotedAt = now; break;
      case "approved": task.approvedAt = now; break;
      case "executing": task.executionStartedAt = now; break;
      case "delivered": task.deliveredAt = now; break;
      case "settled": task.settledAt = now; break;
    }

    // Apply additional updates
    if (updates) {
      Object.assign(task, updates);
    }

    return task;
  }

  getByRequester(agentId: string): AgentTask[] {
    return [...this.tasks.values()].filter((t) => t.requesterAgentId === agentId);
  }

  getByPerformer(agentId: string): AgentTask[] {
    return [...this.tasks.values()].filter((t) => t.performerAgentId === agentId);
  }

  getByStatus(status: TaskStatus): AgentTask[] {
    return [...this.tasks.values()].filter((t) => t.status === status);
  }

  getActive(): AgentTask[] {
    const activeStatuses: TaskStatus[] = ["requested", "quoted", "approved", "budget-reserved", "executing", "delivered"];
    return [...this.tasks.values()].filter((t) => activeStatuses.includes(t.status));
  }

  count(): number {
    return this.tasks.size;
  }
}

// ═══════════════════════════════════════════════════════════
// Budget Manager
// ═══════════════════════════════════════════════════════════

export class BudgetManager {
  private budgets = new Map<string, AgentBudget>();

  createBudget(params: {
    agentId: string;
    period: BudgetPeriod;
    limit: string;
    autoRefill?: boolean;
    refillAmount?: string;
    refillThreshold?: string;
  }): AgentBudget {
    const budgetId = `budget:${nanoid(10)}`;
    const now = new Date();

    const budget: AgentBudget = {
      budgetId,
      agentId: params.agentId,
      period: params.period,
      limit: params.limit,
      spent: "0",
      reserved: "0",
      periodStart: now.toISOString(),
      periodEnd: this.computePeriodEnd(now, params.period),
      autoRefill: params.autoRefill ?? false,
      refillAmount: params.refillAmount ?? null,
      refillThreshold: params.refillThreshold ?? null,
    };

    this.budgets.set(budgetId, budget);
    return budget;
  }

  reserve(budgetId: string, amount: string): boolean {
    const budget = this.budgets.get(budgetId);
    if (!budget) return false;

    const available = BigInt(budget.limit) - BigInt(budget.spent) - BigInt(budget.reserved);
    if (BigInt(amount) > available) return false;

    budget.reserved = (BigInt(budget.reserved) + BigInt(amount)).toString();
    return true;
  }

  spend(budgetId: string, amount: string): boolean {
    const budget = this.budgets.get(budgetId);
    if (!budget) return false;

    // Spend from reserved first, then from available
    const reservedBI = BigInt(budget.reserved);
    const amountBI = BigInt(amount);

    if (amountBI <= reservedBI) {
      budget.reserved = (reservedBI - amountBI).toString();
    } else {
      budget.reserved = "0";
    }

    budget.spent = (BigInt(budget.spent) + amountBI).toString();
    return true;
  }

  unreserve(budgetId: string, amount: string): boolean {
    const budget = this.budgets.get(budgetId);
    if (!budget) return false;

    const amountBI = BigInt(amount);
    if (amountBI > BigInt(budget.reserved)) return false;

    budget.reserved = (BigInt(budget.reserved) - amountBI).toString();
    return true;
  }

  getAvailable(budgetId: string): string {
    const budget = this.budgets.get(budgetId);
    if (!budget) return "0";
    return (BigInt(budget.limit) - BigInt(budget.spent) - BigInt(budget.reserved)).toString();
  }

  getByAgent(agentId: string): AgentBudget[] {
    return [...this.budgets.values()].filter((b) => b.agentId === agentId);
  }

  private computePeriodEnd(start: Date, period: BudgetPeriod): string | null {
    if (period === "unlimited" || period === "per-task") return null;
    const end = new Date(start);
    switch (period) {
      case "daily": end.setDate(end.getDate() + 1); break;
      case "weekly": end.setDate(end.getDate() + 7); break;
      case "monthly": end.setMonth(end.getMonth() + 1); break;
    }
    return end.toISOString();
  }
}

// ═══════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════

export { type AgentIdentity, type AgentTask, type AgentBudget } from "@unykorn/shared-types";
