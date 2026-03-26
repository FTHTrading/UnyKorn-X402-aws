/**
 * FTH x402 A2A — Asset Settlement Agent (Work Plane)
 *
 * Cross-rail settlement and L1 anchoring:
 *   - Settlement initiation and tracking
 *   - Multi-rail bridge coordination
 *   - Anchor batch management
 *   - Finality confirmation
 */

import type { AgentCard, Message } from "../../types";
import { BaseAgent } from "../base-agent";

export function createSettlementCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Settlement Agent",
    description:
      "Work plane settlement agent. Coordinates multi-rail settlement " +
      "across UnyKorn L1, Stellar, and XRPL. Manages anchor batches, " +
      "finality confirmation, and bridge operations.",
    url: baseUrl,
    version: "2.0.0",
    protocol: "a2a",
    protocolVersion: "0.2",
    provider: { organization: "FTH Trading Limited", url: "https://fthtrading.com" },
    capabilities: { streaming: false, pushNotifications: true, stateTransitionHistory: true },
    authentication: {
      schemes: [{ scheme: "hmac", description: "Service-to-service HMAC-SHA256" }],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    layer: "work",
    role: "settlement",
    skills: [
      {
        id: "initiate-settlement",
        name: "Initiate Settlement",
        description: "Start a settlement batch on the specified rail.",
        tags: ["settlement", "anchor", "l1", "chain"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "check-finality",
        name: "Check Finality",
        description: "Check if a settlement has reached finality on chain.",
        tags: ["settlement", "finality", "confirmation"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "bridge-status",
        name: "Bridge Status",
        description: "Check cross-rail bridge status and pending transfers.",
        tags: ["settlement", "bridge", "cross-rail"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

export class SettlementAgent extends BaseAgent {
  protected override async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const tags = task.metadata?.tags ?? [];
    const message = task.status.message;

    if (tags.includes("finality") || tags.includes("confirmation")) {
      return this.checkFinality(message);
    }
    if (tags.includes("bridge") || tags.includes("cross-rail")) {
      return this.getBridgeStatus();
    }

    return this.initiateSettlement(message);
  }

  private async initiateSettlement(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const rail = (data?.rail as string) ?? "unykorn-l1";
    const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}`;

    await this.emitEvent("payment.settled", {
      batchId,
      rail,
      status: "initiated",
    });

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Settlement initiated: ${batchId} on ${rail}.` },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            batchId,
            rail,
            status: "initiated",
            txCount: data?.txCount ?? 0,
            initiatedAt: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private async checkFinality(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const batchId = (data?.batchId as string) ?? "unknown";

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Finality check for batch ${batchId}.` },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            batchId,
            finalized: false,
            confirmations: 0,
            requiredConfirmations: 1,
            checkedAt: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private async getBridgeStatus(): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "Cross-rail bridge status." },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            bridges: {
              "unykorn-stellar": { status: "active", pendingTransfers: 0 },
              "unykorn-xrpl": { status: "active", pendingTransfers: 0 },
            },
            overallStatus: "healthy",
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
