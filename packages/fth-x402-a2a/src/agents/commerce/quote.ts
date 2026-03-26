/**
 * FTH x402 A2A — Quote Agent (Commerce Plane)
 *
 * Pricing engine for x402 paid routes:
 *   - Route price lookup
 *   - Volume discount calculation
 *   - Multi-step cost estimation
 *   - PASS tier pricing
 */

import type { AgentCard, Message } from "../../types";
import { BaseAgent } from "../base-agent";

export function createQuoteCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Quote Agent",
    description:
      "Commerce plane pricing engine. Provides real-time price quotes " +
      "for paid API routes, volume discounts, PASS tier pricing, and " +
      "multi-step workflow cost estimates.",
    url: baseUrl,
    version: "2.0.0",
    protocol: "a2a",
    protocolVersion: "0.2",
    provider: { organization: "FTH Trading Limited", url: "https://fthtrading.com" },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
    authentication: {
      schemes: [{ scheme: "hmac", description: "Service-to-service HMAC-SHA256" }],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    layer: "commerce",
    role: "quote",
    skills: [
      {
        id: "get-quote",
        name: "Get Price Quote",
        description: "Get the price for a specific paid route.",
        tags: ["quote", "pricing", "cost"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "bulk-quote",
        name: "Bulk Quote",
        description: "Get prices for multiple routes at once.",
        tags: ["quote", "pricing", "bulk"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "pass-pricing",
        name: "PASS Tier Pricing",
        description: "Get pricing details for PASS subscription tiers.",
        tags: ["pass", "pricing", "subscription", "tier"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

/** Route pricing catalog (mirrors gateway PAID_ROUTES). */
const ROUTE_PRICES: Record<string, { amount: string; asset: string; description: string }> = {
  "agent-pay-api": { amount: "0.0001", asset: "UNY", description: "AI & data API proxy" },
  "genesis-repro-pack": { amount: "0.0005", asset: "UNY", description: "Genesis reproduction pack" },
  "trade-verify": { amount: "0.00025", asset: "UNY", description: "Trade verification" },
  "invoice-export": { amount: "0.001", asset: "UNY", description: "Invoice export" },
};

/** PASS tier pricing. */
const PASS_TIERS = {
  free: { monthlyUNY: 0, apiCallsPerMonth: 100, features: ["basic-api"] },
  starter: { monthlyUNY: 1.0, apiCallsPerMonth: 10_000, features: ["basic-api", "export-json"] },
  pro: { monthlyUNY: 10.0, apiCallsPerMonth: 100_000, features: ["basic-api", "export-json", "export-pdf", "bulk-verify"] },
  enterprise: { monthlyUNY: 100.0, apiCallsPerMonth: -1, features: ["all", "dedicated-support", "sla"] },
};

export class QuoteAgent extends BaseAgent {
  protected override async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const tags = task.metadata?.tags ?? [];
    const message = task.status.message;

    if (tags.includes("pass") || tags.includes("tier")) {
      return this.getPassPricing();
    }
    if (tags.includes("bulk")) {
      return this.getBulkQuote(message);
    }

    return this.getQuote(message);
  }

  private async getQuote(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const route = (data?.route as string) ?? "agent-pay-api";
    const price = ROUTE_PRICES[route];

    if (!price) {
      return {
        role: "agent",
        parts: [
          { type: "text", text: `Unknown route: ${route}` },
          {
            type: "data",
            mimeType: "application/json",
            data: { availableRoutes: Object.keys(ROUTE_PRICES) },
          },
        ],
      };
    }

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Quote: ${price.amount} ${price.asset} for ${price.description}.` },
        {
          type: "data",
          mimeType: "application/json",
          data: { route, ...price, quotedAt: new Date().toISOString() },
        },
      ],
    };
  }

  private async getBulkQuote(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const routes = (data?.routes as string[]) ?? Object.keys(ROUTE_PRICES);

    const quotes = routes.map((route) => ({
      route,
      ...(ROUTE_PRICES[route] ?? { amount: "unknown", asset: "UNY", description: "Unknown" }),
    }));

    const totalUNY = quotes.reduce((sum, q) => sum + parseFloat(q.amount || "0"), 0);

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Bulk quote: ${quotes.length} routes, total ${totalUNY.toFixed(6)} UNY.` },
        {
          type: "data",
          mimeType: "application/json",
          data: { quotes, totalEstimate: totalUNY, currency: "UNY", quotedAt: new Date().toISOString() },
        },
      ],
    };
  }

  private async getPassPricing(): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "FTH PASS tier pricing." },
        {
          type: "data",
          mimeType: "application/json",
          data: { tiers: PASS_TIERS, currency: "UNY", period: "monthly" },
        },
      ],
    };
  }

  private extractData(message?: Message): Record<string, unknown> | undefined {
    if (!message) return undefined;
    for (const part of message.parts) {
      if (part.type === "data") return (part as { data: Record<string, unknown> }).data;
    }
    return undefined;
  }
}
