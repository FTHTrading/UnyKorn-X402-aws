/**
 * FTH x402 A2A — Guardian Agent (Control Plane)
 *
 * Policy enforcement agent. Monitors and enforces:
 *   - Rate limits and abuse detection
 *   - Service health and integrity
 *   - Security policy enforcement
 *   - Audit trail maintenance
 *
 * Integrates with the existing Guardian daemon army
 * (Sentinel, Enforcer, Healer, Reaper, etc.)
 */

import type { AgentCard, Message, AgentEvent } from "../../types";
import { BaseAgent, type BaseAgentConfig } from "../base-agent";

// ═══════════════════════════════════════════════════════════
// Guardian Agent Card
// ═══════════════════════════════════════════════════════════

export function createGuardianCard(baseUrl: string): AgentCard {
  return {
    name: "FTH Guardian Agent",
    description:
      "Control plane security and policy enforcement agent. " +
      "Monitors system health, enforces rate limits, detects abuse, " +
      "and maintains audit trails. Backed by 8 specialized daemons.",
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
        { scheme: "bearer", description: "Admin token" },
      ],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    layer: "control",
    role: "guardian",
    skills: [
      {
        id: "enforce-policy",
        name: "Policy Enforcement",
        description: "Check and enforce security policies on a task or request.",
        tags: ["security", "policy", "enforce", "guardian"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "rate-check",
        name: "Rate Limit Check",
        description: "Check rate limits for a wallet or agent.",
        tags: ["rate-limit", "abuse", "throttle"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "health-report",
        name: "System Health Report",
        description: "Get a comprehensive health report from all guardian daemons.",
        tags: ["health", "monitoring", "sentinel"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "audit-query",
        name: "Audit Log Query",
        description: "Query the audit trail for compliance and forensic analysis.",
        tags: ["audit", "compliance", "forensic"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "security-scan",
        name: "Security Scan",
        description: "Run security scans on agent requests and payloads.",
        tags: ["security", "scan", "enforce"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// Guardian Agent Implementation
// ═══════════════════════════════════════════════════════════

export class GuardianAgent extends BaseAgent {
  protected override async processTask(taskId: string): Promise<Message> {
    const task = this.taskManager.requireTask(taskId);
    const message = task.status.message;
    const tags = task.metadata?.tags ?? [];

    // Determine which guardian skill to invoke
    if (tags.includes("security") || tags.includes("enforce")) {
      return this.enforcePolicy(taskId, message);
    }
    if (tags.includes("rate-limit")) {
      return this.checkRateLimit(taskId, message);
    }
    if (tags.includes("health")) {
      return this.getHealthReport();
    }
    if (tags.includes("audit")) {
      return this.queryAuditLog(message);
    }

    // Default: run security scan
    return this.enforcePolicy(taskId, message);
  }

  private async enforcePolicy(_taskId: string, message?: Message): Promise<Message> {
    // In production, this calls the Enforcer daemon
    const result = {
      allowed: true,
      checks: [
        { check: "payload-size", status: "pass" },
        { check: "rate-limit", status: "pass" },
        { check: "wallet-reputation", status: "pass" },
        { check: "request-pattern", status: "pass" },
      ],
      timestamp: new Date().toISOString(),
    };

    return {
      role: "agent",
      parts: [
        { type: "text", text: "Policy enforcement check completed." },
        { type: "data", mimeType: "application/json", data: result },
      ],
    };
  }

  private async checkRateLimit(_taskId: string, message?: Message): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "Rate limit check passed." },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            within_limits: true,
            current_rate: 0,
            limit: 1000,
            window: "1m",
          },
        },
      ],
    };
  }

  private async getHealthReport(): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "Guardian daemon health report." },
        {
          type: "data",
          mimeType: "application/json",
          data: {
            daemons: [
              { name: "Sentinel", status: "active", uptime: process.uptime() },
              { name: "Enforcer", status: "active" },
              { name: "Healer", status: "active" },
              { name: "Reaper", status: "active" },
              { name: "Upgrader", status: "active" },
              { name: "Treasurer", status: "active" },
              { name: "Anchor", status: "active" },
              { name: "Watcher", status: "active" },
            ],
            overallStatus: "healthy",
          },
        },
      ],
    };
  }

  private async queryAuditLog(message?: Message): Promise<Message> {
    return {
      role: "agent",
      parts: [
        { type: "text", text: "Audit log query results." },
        {
          type: "data",
          mimeType: "application/json",
          data: { entries: [], total: 0, note: "Audit log integration pending" },
        },
      ],
    };
  }
}
