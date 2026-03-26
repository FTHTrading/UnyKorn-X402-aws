/**
 * FTH x402 A2A — Outreach Agent (Work Plane)
 *
 * Partner and marketplace interactions:
 *   - Partner agent discovery
 *   - Marketplace listing management
 *   - External agent federation
 *   - Partnership negotiation support
 */

import type { AgentCard, Message } from "../../types";
import { BaseAgent } from "../base-agent";

export function createOutreachCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Outreach Agent",
    description:
      "Work plane outreach agent. Manages partner discovery, " +
      "marketplace listings, external agent federation, and " +
      "ecosystem growth activities.",
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
    role: "outreach",
    skills: [
      {
        id: "discover-partners",
        name: "Discover Partners",
        description: "Discover potential partner agents and services.",
        tags: ["outreach", "partner", "discovery", "marketplace"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "list-marketplace",
        name: "Marketplace Listing",
        description: "Manage marketplace listings for FTH services.",
        tags: ["outreach", "marketplace", "listing"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "federate-agent",
        name: "Federate Agent",
        description: "Register an external agent in the federation mesh.",
        tags: ["outreach", "federation", "external"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

export class OutreachAgent extends BaseAgent {
  protected override async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const tags = task.metadata?.tags ?? [];
    const message = task.status.message;

    if (tags.includes("marketplace") || tags.includes("listing")) {
      return this.getMarketplaceListing();
    }
    if (tags.includes("federation") || tags.includes("external")) {
      return this.federateAgent(message);
    }

    return this.discoverPartners(message);
  }

  private async discoverPartners(message?: Message): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "Partner discovery results." },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            partners: [
              {
                name: "FTH x402 Ecosystem",
                type: "internal",
                agents: this.registry.active().length,
                status: "connected",
              },
            ],
            externalDiscovery: {
              method: "A2A .well-known/agent.json",
              federated: true,
              meshEndpoint: "https://api.fth.trading/.well-known/agent.json",
            },
            discoveredAt: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private async getMarketplaceListing(): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "FTH marketplace listings." },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            listings: [
              {
                id: "fth-x402-gateway",
                name: "FTH x402 Payment Gateway",
                category: "payment-infrastructure",
                pricing: "pay-per-call",
                minPrice: "0.0001 UNY",
                protocol: "x402",
              },
              {
                id: "fth-genesis-data",
                name: "Genesis Reproduction Data",
                category: "ai-training-data",
                pricing: "per-download",
                minPrice: "0.0005 UNY",
                protocol: "x402",
              },
              {
                id: "fth-trade-verify",
                name: "Trade Verification Service",
                category: "compliance",
                pricing: "per-verification",
                minPrice: "0.00025 UNY",
                protocol: "x402",
              },
            ],
            total: 3,
          },
        },
      ],
    };
  }

  private async federateAgent(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const agentUrl = data?.url as string;

    if (!agentUrl) {
      return {
        role: "agent",
        parts: [
          { type: "text", text: "Provide an agent URL to federate." },
        ],
      };
    }

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Federation request submitted for ${agentUrl}.` },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            url: agentUrl,
            status: "pending",
            note: "External agent will be discovered via .well-known/agent.json",
            submittedAt: new Date().toISOString(),
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
