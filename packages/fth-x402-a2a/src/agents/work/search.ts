/**
 * FTH x402 A2A — Search & Intelligence Agent (Work Plane)
 *
 * Data discovery and namespace resolution:
 *   - Namespace FQN resolution
 *   - Agent discovery searches
 *   - Route catalog lookups
 *   - Market intelligence
 */

import type { AgentCard, Message } from "../../types";
import { BaseAgent } from "../base-agent";

export function createSearchCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Search & Intelligence Agent",
    description:
      "Work plane search and intelligence agent. Resolves namespaces, " +
      "discovers agents and routes, provides market intelligence, " +
      "and powers catalog queries.",
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
    layer: "work",
    role: "search",
    skills: [
      {
        id: "resolve-namespace",
        name: "Resolve Namespace",
        description: "Resolve a fully-qualified name (FQN) to its record.",
        tags: ["search", "namespace", "resolve", "dns"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "discover-agents",
        name: "Discover Agents",
        description: "Search for agents by role, skill, or capability.",
        tags: ["search", "discovery", "agents"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "route-catalog",
        name: "Route Catalog",
        description: "Browse the full catalog of paid API routes.",
        tags: ["search", "catalog", "routes", "api"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

export class SearchAgent extends BaseAgent {
  protected override async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const tags = task.metadata?.tags ?? [];
    const message = task.status.message;

    if (tags.includes("namespace") || tags.includes("resolve")) {
      return this.resolveNamespace(message);
    }
    if (tags.includes("agents") || tags.includes("discovery")) {
      return this.discoverAgents(message);
    }
    if (tags.includes("catalog") || tags.includes("routes")) {
      return this.getRouteCatalog();
    }

    return this.discoverAgents(message);
  }

  private async resolveNamespace(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const fqn = (data?.fqn as string) ?? "fth.x402";

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Namespace resolution for: ${fqn}` },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            fqn,
            resolved: true,
            type: "service",
            endpoint: "https://facilitator.l1.unykorn.org",
            note: "Delegates to namespace service for live resolution",
          },
        },
      ],
    };
  }

  private async discoverAgents(message?: Message): Promise<Message> {
    const agents = this.registry.active();

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Found ${agents.length} active agents.` },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            agents: agents.map((a) => ({
              id: a.id,
              name: a.card.name,
              role: a.role,
              layer: a.layer,
              status: a.status,
              skills: a.card.skills.map((s) => s.id),
            })),
            total: agents.length,
          },
        },
      ],
    };
  }

  private async getRouteCatalog(): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "FTH paid API route catalog." },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            routes: [
              { path: "/api/v1/agent/pay-api/:provider", price: "0.0001 UNY", description: "AI & data API proxy" },
              { path: "/api/v1/genesis/repro-pack/:suite", price: "0.0005 UNY", description: "Genesis reproduction pack" },
              { path: "/api/v1/trade/verify/:trade_id", price: "0.00025 UNY", description: "Trade verification" },
              { path: "/api/v1/invoices/export/:format", price: "0.001 UNY", description: "Invoice export" },
            ],
            total: 4,
            gateway: "https://api.fth.trading",
          },
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
