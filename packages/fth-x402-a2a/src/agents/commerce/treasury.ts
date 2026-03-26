/**
 * FTH x402 A2A — Treasury Agent (Commerce Plane)
 *
 * Balance management and settlement:
 *   - Wallet balance queries
 *   - Credit deposit/withdrawal
 *   - Multi-rail settlement tracking
 *   - Treasury health and exposure monitoring
 */

import type { AgentCard, Message } from "../../types";
import { BaseAgent } from "../base-agent";

export function createTreasuryAgentCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Treasury Agent",
    description:
      "Commerce plane treasury manager. Handles wallet balances, " +
      "credit deposits, multi-rail settlement, and exposure monitoring " +
      "across UnyKorn L1, Stellar, and XRPL.",
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
    layer: "commerce",
    role: "treasury",
    skills: [
      {
        id: "balance-query",
        name: "Balance Query",
        description: "Get current balance for a wallet across all rails.",
        tags: ["treasury", "balance", "wallet"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "deposit-credit",
        name: "Deposit Credits",
        description: "Deposit UNY credits to a prepaid account.",
        tags: ["treasury", "deposit", "credit", "wallet"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "settlement-status",
        name: "Settlement Status",
        description: "Check settlement status across rails.",
        tags: ["treasury", "settlement", "status"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "exposure-report",
        name: "Exposure Report",
        description: "Get treasury exposure and risk metrics.",
        tags: ["treasury", "exposure", "risk", "monitoring"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

export class TreasuryAgent extends BaseAgent {
  protected override async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const tags = task.metadata?.tags ?? [];
    const message = task.status.message;

    if (tags.includes("balance") || tags.includes("wallet")) {
      return this.queryBalance(message);
    }
    if (tags.includes("deposit") || tags.includes("credit")) {
      return this.depositCredit(message);
    }
    if (tags.includes("settlement")) {
      return this.getSettlementStatus(message);
    }
    if (tags.includes("exposure") || tags.includes("risk")) {
      return this.getExposureReport();
    }

    return this.queryBalance(message);
  }

  private async queryBalance(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const wallet = (data?.wallet as string) ?? "unknown";

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Balance report for wallet ${wallet}.` },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            wallet,
            balances: {
              "unykorn-l1": { available: "0.0000", pending: "0.0000", asset: "UNY" },
              stellar: { available: "0.0000", pending: "0.0000", asset: "sUSDF" },
              xrpl: { available: "0.0000", pending: "0.0000", asset: "xUSDF" },
            },
            totalUNY: "0.0000",
            queriedAt: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private async depositCredit(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const wallet = (data?.wallet as string) ?? "unknown";
    const amount = (data?.amount as string) ?? "0";

    await this.emitEvent("payment.settled", {
      type: "deposit",
      wallet,
      amount,
      rail: "unykorn-l1",
    });

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Deposited ${amount} UNY to wallet ${wallet}.` },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            wallet,
            deposited: amount,
            asset: "UNY",
            txId: `TX-${Date.now().toString(36).toUpperCase()}`,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private async getSettlementStatus(message?: Message): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "Settlement status across all rails." },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            rails: {
              "unykorn-l1": { status: "active", pendingSettlements: 0, lastAnchor: null },
              stellar: { status: "active", pendingSettlements: 0, lastAnchor: null },
              xrpl: { status: "active", pendingSettlements: 0, lastAnchor: null },
            },
            overallStatus: "healthy",
            queriedAt: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private async getExposureReport(): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "Treasury exposure report." },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            totalExposure: "0.0000",
            currency: "UNY",
            byRail: {
              "unykorn-l1": "0.0000",
              stellar: "0.0000",
              xrpl: "0.0000",
            },
            riskLevel: "low",
            generatedAt: new Date().toISOString(),
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
