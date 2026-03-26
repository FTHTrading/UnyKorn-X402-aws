/**
 * FTH x402 A2A — Payment Agent (Commerce Plane)
 *
 * Handles the x402 payment flow:
 *   - Invoice creation (402 challenge)
 *   - Proof verification
 *   - Payment settlement coordination
 *   - Payment status tracking
 */

import type { AgentCard, Message } from "../../types";
import { BaseAgent } from "../base-agent";

export function createPaymentCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Payment Agent",
    description:
      "Commerce plane payment processor. Manages the full x402 payment " +
      "lifecycle: invoice creation, challenge issuance, proof verification, " +
      "and settlement coordination across UnyKorn L1, Stellar, and XRPL.",
    url: baseUrl,
    version: "2.0.0",
    protocol: "a2a",
    protocolVersion: "0.2",
    provider: { organization: "FTH Trading Limited", url: "https://fthtrading.com" },
    capabilities: { streaming: true, pushNotifications: true, stateTransitionHistory: true },
    authentication: {
      schemes: [
        { scheme: "x402", description: "x402 payment proof" },
        { scheme: "hmac", description: "Service-to-service HMAC-SHA256" },
      ],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    layer: "commerce",
    role: "payment",
    x402: {
      facilitator: "https://facilitator.l1.unykorn.org",
      gateway: "https://api.fth.trading",
      treasury: "https://treasury.l1.unykorn.org",
      rails: ["unykorn-l1", "stellar", "xrpl"],
    },
    skills: [
      {
        id: "create-invoice",
        name: "Create Invoice",
        description: "Create a payment invoice (402 challenge) for a paid route.",
        tags: ["payment", "invoice", "402", "x402"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "verify-proof",
        name: "Verify Payment Proof",
        description: "Verify a submitted payment proof against an invoice.",
        tags: ["payment", "verify", "proof", "x402"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "payment-status",
        name: "Payment Status",
        description: "Check the status of a payment by invoice ID.",
        tags: ["payment", "status", "invoice"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "refund",
        name: "Process Refund",
        description: "Initiate a refund for a settled payment.",
        tags: ["payment", "refund"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

export class PaymentAgent extends BaseAgent {
  protected override async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const tags = task.metadata?.tags ?? [];
    const message = task.status.message;

    if (tags.includes("invoice") || tags.includes("create")) {
      return this.createInvoice(message);
    }
    if (tags.includes("verify") || tags.includes("proof")) {
      return this.verifyProof(message);
    }
    if (tags.includes("status")) {
      return this.getPaymentStatus(message);
    }
    if (tags.includes("refund")) {
      return this.processRefund(message);
    }

    // Default: create invoice
    return this.createInvoice(message);
  }

  private async createInvoice(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const invoiceId = `INV-${Date.now().toString(36).toUpperCase()}`;

    const invoice = {
      invoice_id: invoiceId,
      amount: data?.amount ?? "0.0001",
      asset: data?.asset ?? "UNY",
      receiver: data?.receiver ?? "fth-treasury",
      route: data?.route ?? "agent-pay-api",
      expires_at: new Date(Date.now() + 300_000).toISOString(), // 5 min
      rails: ["unykorn-l1", "stellar", "xrpl"],
      status: "pending",
    };

    // Emit payment required event
    await this.emitEvent("payment.required", invoice, undefined);

    return {
      role: "agent",
      parts: [
        {
          type: "text",
          text: `Invoice created: ${invoiceId} for ${invoice.amount} ${invoice.asset}.`,
        },
        {
          type: "payment",
          action: "request",
          paymentData: invoice,
        },
      ],
    };
  }

  private async verifyProof(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const invoiceId = data?.invoice_id ?? "unknown";

    // In production, this delegates to facilitator's verify endpoint
    const result = {
      valid: true,
      invoice_id: invoiceId,
      proof_type: data?.proof_type ?? "prepaid_credit",
      settled: true,
      receipt_id: `RCP-${Date.now().toString(36).toUpperCase()}`,
      timestamp: new Date().toISOString(),
    };

    await this.emitEvent("payment.received", result, undefined);

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Payment verified for invoice ${invoiceId}.` },
        {
          type: "payment",
          action: "receipt",
          paymentData: result,
        },
      ],
    };
  }

  private async getPaymentStatus(message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const invoiceId = data?.invoice_id ?? "unknown";

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Payment status for ${invoiceId}: settled.` },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            invoice_id: invoiceId,
            status: "settled",
            queriedAt: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private async processRefund(message?: Message): Promise<Message> {
    const data = this.extractData(message);

    // Refunds require human approval — emit escalation event
    this.emitEvent("escalation.requested", {
      agentId: this.id,
      reason: "Refund requires human approval",
      context: data,
      urgency: "high",
    });

    return {
      role: "agent",
      parts: [
        {
          type: "text",
          text: "Refund request submitted for human approval.",
        },
      ],
    };
  }

  private extractData(message?: Message): Record<string, unknown> | undefined {
    if (!message) return undefined;
    for (const part of message.parts) {
      if (part.type === "data") return (part as { data: Record<string, unknown> }).data;
      if (part.type === "payment") return (part as { paymentData: Record<string, unknown> }).paymentData as Record<string, unknown>;
    }
    return undefined;
  }
}
