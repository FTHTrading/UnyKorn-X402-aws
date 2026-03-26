/**
 * FTH x402 A2A — Delivery Agent (Work Plane)
 *
 * Artifact delivery after payment:
 *   - Data pack delivery
 *   - API response proxying
 *   - Export generation (PDF, JSON)
 *   - Download tracking
 */

import type { AgentCard, Message } from "../../types";
import { BaseAgent } from "../base-agent";

export function createDeliveryCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Delivery Agent",
    description:
      "Work plane delivery agent. Handles artifact delivery after " +
      "successful payment — data packs, API responses, exports, " +
      "and download tracking.",
    url: baseUrl,
    version: "2.0.0",
    protocol: "a2a",
    protocolVersion: "0.2",
    provider: { organization: "FTH Trading Limited", url: "https://fthtrading.com" },
    capabilities: { streaming: true, pushNotifications: true, stateTransitionHistory: true },
    authentication: {
      schemes: [{ scheme: "hmac", description: "Service-to-service HMAC-SHA256" }],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json", "application/octet-stream", "application/pdf"],
    layer: "work",
    role: "delivery",
    skills: [
      {
        id: "deliver-artifact",
        name: "Deliver Artifact",
        description: "Deliver a paid artifact (data pack, API response, export).",
        tags: ["delivery", "artifact", "download"],
        inputModes: ["application/json"],
        outputModes: ["application/json", "application/octet-stream"],
      },
      {
        id: "generate-export",
        name: "Generate Export",
        description: "Generate and deliver an export in the requested format.",
        tags: ["delivery", "export", "pdf", "json"],
        inputModes: ["application/json"],
        outputModes: ["application/json", "application/pdf"],
      },
    ],
  };
}

export class DeliveryAgent extends BaseAgent {
  protected override async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const tags = task.metadata?.tags ?? [];
    const message = task.status.message;

    if (tags.includes("export")) {
      return this.generateExport(taskId, message);
    }

    return this.deliverArtifact(taskId, message);
  }

  private async deliverArtifact(taskId: string, message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const artifactType = (data?.type as string) ?? "api-response";

    this.addArtifact(taskId, {
      name: artifactType,
      description: `Delivered artifact: ${artifactType}`,
      parts: [
        {
          type: "data",
          mimeType: "application/json",
          data: {
            delivered: true,
            type: artifactType,
            size: 0,
            deliveredAt: new Date().toISOString(),
          },
        },
      ],
    });

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Artifact delivered: ${artifactType}.` },
      ],
    };
  }

  private async generateExport(taskId: string, message?: Message): Promise<Message> {
    const data = this.extractData(message);
    const format = (data?.format as string) ?? "json";

    this.addArtifact(taskId, {
      name: `export.${format}`,
      description: `Generated export in ${format} format`,
      parts: [
        {
          type: "data",
          mimeType: format === "pdf" ? "application/pdf" : "application/json",
          data: { format, generatedAt: new Date().toISOString() },
        },
      ],
    });

    return {
      role: "agent",
      parts: [
        { type: "text", text: `Export generated in ${format} format.` },
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
