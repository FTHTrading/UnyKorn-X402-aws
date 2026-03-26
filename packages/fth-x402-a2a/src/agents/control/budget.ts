/**
 * FTH x402 A2A — Budget / Policy Agent (Control Plane)
 *
 * Spend controls and budget policy enforcement:
 *   - Per-agent spend limits
 *   - Per-session budget tracking
 *   - Cost estimation for multi-step workflows
 *   - Policy-based spending approval/rejection
 */

import type { AgentCard, Message } from "../../types";
import { BaseAgent } from "../base-agent";

// ═══════════════════════════════════════════════════════════
// Budget Agent Card
// ═══════════════════════════════════════════════════════════

export function createBudgetCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Budget & Policy Agent",
    description:
      "Control plane budget enforcement agent. Tracks spending, " +
      "enforces per-agent and per-session budgets, estimates costs " +
      "for multi-step workflows, and blocks over-budget requests.",
    url: baseUrl,
    version: "2.0.0",
    protocol: "a2a",
    protocolVersion: "0.2",
    provider: {
      organization: "FTH Trading Limited",
      url: "https://fthtrading.com",
    },
    capabilities: {
      streaming: false,
      pushNotifications: true,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: [
        { scheme: "hmac", description: "Service-to-service HMAC-SHA256" },
      ],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    layer: "control",
    role: "budget",
    skills: [
      {
        id: "budget-check",
        name: "Budget Check",
        description: "Check if a spending request is within budget limits.",
        tags: ["budget", "spend", "limit", "policy"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "cost-estimate",
        name: "Cost Estimation",
        description: "Estimate the total cost of a multi-step workflow.",
        tags: ["cost", "estimate", "budget", "planning"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "spend-report",
        name: "Spending Report",
        description: "Get a spending report for an agent or session.",
        tags: ["spend", "report", "budget", "analytics"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "set-policy",
        name: "Set Budget Policy",
        description: "Configure budget policies for agents or wallets.",
        tags: ["policy", "budget", "configure", "admin"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// Budget Agent Implementation
// ═══════════════════════════════════════════════════════════

/** In-memory budget tracker. */
interface BudgetEntry {
  agentId: string;
  sessionId?: string;
  limit: number; // in UNY
  spent: number;
  currency: string;
  lastUpdated: string;
}

export class BudgetAgent extends BaseAgent {
  private budgets = new Map<string, BudgetEntry>();

  /** Default per-agent budget in UNY. */
  private defaultBudget = 100.0;

  protected override async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const tags = task.metadata?.tags ?? [];

    if (tags.includes("estimate") || tags.includes("cost")) {
      return this.estimateCost(task.status.message);
    }
    if (tags.includes("report")) {
      return this.getSpendReport(task.status.message);
    }
    if (tags.includes("policy") || tags.includes("configure")) {
      return this.setPolicy(task.status.message);
    }

    // Default: budget check
    return this.checkBudget(task.status.message);
  }

  private async checkBudget(message?: Message): Promise<Message> {
    // Extract agent and amount from message
    const data = this.extractData(message);
    const agentId = String(data?.agentId ?? "unknown");
    const amount = Number(data?.amount ?? 0);

    const budget = this.getOrCreateBudget(agentId);
    const remaining = budget.limit - budget.spent;
    const allowed = amount <= remaining;

    if (allowed && amount > 0) {
      budget.spent += amount;
      budget.lastUpdated = new Date().toISOString();
    }

    const result = {
      allowed,
      agentId,
      requestedAmount: amount,
      currentSpent: budget.spent,
      budgetLimit: budget.limit,
      remaining: budget.limit - budget.spent,
      currency: "UNY",
      timestamp: new Date().toISOString(),
    };

    return {
      role: "agent",
      parts: [
        {
          type: "text",
          text: allowed
            ? `Budget check passed. ${result.remaining.toFixed(4)} UNY remaining.`
            : `Budget exceeded! Requested ${amount} UNY but only ${remaining.toFixed(4)} remaining.`,
        },
        { type: "data", mimeType: "application/json", data: result },
      ],
    };
  }

  private async estimateCost(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const steps = (data?.steps ?? []) as string[];

    // Estimate based on known route prices
    const routePrices: Record<string, number> = {
      "agent-pay-api": 0.0001,
      "genesis-repro-pack": 0.0005,
      "trade-verify": 0.00025,
      "invoice-export": 0.001,
    };

    let totalEstimate = 0;
    const breakdown = steps.map((step: string) => {
      const price = routePrices[step] ?? 0.0001; // default micro-price
      totalEstimate += price;
      return { step, estimatedCost: price, currency: "UNY" };
    });

    return {
      role: "agent",
      parts: [
        {
          type: "text",
          text: `Estimated total cost: ${totalEstimate.toFixed(6)} UNY for ${steps.length} steps.`,
        },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            totalEstimate,
            currency: "UNY",
            breakdown,
            confidence: "estimate",
          },
        },
      ],
    };
  }

  private async getSpendReport(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const agentId = data?.agentId ? String(data.agentId) : undefined;

    const entries = agentId
      ? [this.getOrCreateBudget(agentId)]
      : Array.from(this.budgets.values());

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Spending report: ${entries.length} entries.` },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            entries,
            totalSpent: entries.reduce((sum, e) => sum + e.spent, 0),
            currency: "UNY",
            generatedAt: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private async setPolicy(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const agentId = data?.agentId ? String(data.agentId) : undefined;
    const limit = data?.limit;

    if (agentId && typeof limit === "number") {
      const budget = this.getOrCreateBudget(agentId);
      budget.limit = limit;
      budget.lastUpdated = new Date().toISOString();

      return {
        role: "agent",
        parts: [
          {
            type: "text",
            text: `Budget policy updated: ${agentId} → ${limit} UNY limit.`,
          },
        ],
      };
    }

    return {
      role: "agent",
      parts: [
        {
          type: "text",
          text: "Invalid policy update. Provide agentId and limit.",
        },
      ],
    };
  }

  private getOrCreateBudget(agentId: string): BudgetEntry {
    let entry = this.budgets.get(agentId);
    if (!entry) {
      entry = {
        agentId,
        limit: this.defaultBudget,
        spent: 0,
        currency: "UNY",
        lastUpdated: new Date().toISOString(),
      };
      this.budgets.set(agentId, entry);
    }
    return entry;
  }

  private extractData(message?: Message): Record<string, unknown> | undefined {
    if (!message) return undefined;
    for (const part of message.parts) {
      if (part.type === "data" && (part as { data: unknown }).data) {
        return (part as { data: Record<string, unknown> }).data;
      }
    }
    return undefined;
  }
}
