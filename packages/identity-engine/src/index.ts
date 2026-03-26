/**
 * @unykorn/identity-engine — Agent Identity Management & Authorization
 *
 * Manages agent identities, key pairs, permissions, and organizations.
 * Provides isAuthorized() gate for identity + permission checks.
 */

import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import type {
  AgentIdentity,
  AgentRole,
  AgentTier,
  AgentStatus,
  Organization,
} from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Key Pair (placeholder)
// ═══════════════════════════════════════════════════════════

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export function generateKeyPair(): KeyPair {
  const privateKey = randomBytes(32).toString("hex");
  const publicKey = randomBytes(32).toString("hex");
  return { publicKey, privateKey };
}

// ═══════════════════════════════════════════════════════════
// Identity Engine
// ═══════════════════════════════════════════════════════════

export class IdentityEngine {
  private agents = new Map<string, AgentIdentity>();
  private organizations = new Map<string, Organization>();
  private keyStore = new Map<string, KeyPair>(); // agentId → keyPair

  // ── Agent Registration ───────────────────────────────────

  registerAgent(params: {
    name: string;
    orgId: string;
    role: AgentRole;
    tier: AgentTier;
    allowedTools: string[];
    allowedDataScopes: string[];
    spendLimitDaily: string;
    spendLimitPerTask: string;
    approvalThreshold: string;
    description?: string;
  }): AgentIdentity {
    const keys = generateKeyPair();
    const id = `agent:${params.role}-${nanoid(6)}`;
    const now = new Date().toISOString();

    const identity: AgentIdentity = {
      id,
      name: params.name,
      orgId: params.orgId,
      role: params.role,
      tier: params.tier,
      publicKey: keys.publicKey,
      status: "active",
      trustScore: 50,
      allowedTools: params.allowedTools,
      allowedDataScopes: params.allowedDataScopes,
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

    this.agents.set(id, identity);
    this.keyStore.set(id, keys);

    // Add agent to org if org exists
    const org = this.organizations.get(params.orgId);
    if (org) {
      org.agents.push(id);
    }

    return identity;
  }

  updateAgent(
    agentId: string,
    updates: Partial<
      Pick<
        AgentIdentity,
        | "name"
        | "allowedTools"
        | "allowedDataScopes"
        | "spendLimitDaily"
        | "spendLimitPerTask"
        | "approvalThreshold"
        | "trustScore"
        | "description"
        | "status"
      >
    >,
  ): AgentIdentity | undefined {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    Object.assign(agent, updates, { updatedAt: new Date().toISOString() });
    return agent;
  }

  revokeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.status = "revoked";
    agent.killSwitch = true;
    agent.updatedAt = new Date().toISOString();
    return true;
  }

  pauseAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.status = "paused";
    agent.updatedAt = new Date().toISOString();
    return true;
  }

  resumeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status === "revoked") return false;
    agent.status = "active";
    agent.updatedAt = new Date().toISOString();
    return true;
  }

  // ── Permission Checks ────────────────────────────────────

  checkToolAccess(agentId: string, toolName: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== "active") return false;
    return agent.allowedTools.includes(toolName) || agent.allowedTools.includes("*");
  }

  checkDataScope(agentId: string, scope: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== "active") return false;
    return (
      agent.allowedDataScopes.includes(scope) || agent.allowedDataScopes.includes("*")
    );
  }

  checkSpendLimit(agentId: string, amount: string, type: "daily" | "per-task"): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== "active") return false;
    const limit =
      type === "daily"
        ? BigInt(agent.spendLimitDaily)
        : BigInt(agent.spendLimitPerTask);
    return BigInt(amount) <= limit;
  }

  // ── Organization Management ──────────────────────────────

  createOrganization(params: {
    name: string;
    legalEntity: string;
    jurisdiction: string;
    treasuryWalletId: string;
  }): Organization {
    const orgId = `org:${nanoid(8)}`;
    const org: Organization = {
      orgId,
      name: params.name,
      legalEntity: params.legalEntity,
      jurisdiction: params.jurisdiction,
      agents: [],
      treasuryWalletId: params.treasuryWalletId,
      createdAt: new Date().toISOString(),
    };
    this.organizations.set(orgId, org);
    return org;
  }

  getOrganization(orgId: string): Organization | undefined {
    return this.organizations.get(orgId);
  }

  getOrganizationAgents(orgId: string): AgentIdentity[] {
    const org = this.organizations.get(orgId);
    if (!org) return [];
    return org.agents
      .map((id) => this.agents.get(id))
      .filter((a): a is AgentIdentity => a !== undefined);
  }

  // ── Queries ──────────────────────────────────────────────

  getAgent(agentId: string): AgentIdentity | undefined {
    return this.agents.get(agentId);
  }

  getAgentsByRole(role: AgentRole): AgentIdentity[] {
    return [...this.agents.values()].filter((a) => a.role === role);
  }

  getAgentsByStatus(status: AgentStatus): AgentIdentity[] {
    return [...this.agents.values()].filter((a) => a.status === status);
  }

  getKeyPair(agentId: string): KeyPair | undefined {
    return this.keyStore.get(agentId);
  }

  getAllAgents(): AgentIdentity[] {
    return [...this.agents.values()];
  }
}

// ═══════════════════════════════════════════════════════════
// Standalone Authorization Gate
// ═══════════════════════════════════════════════════════════

/**
 * Combined identity + permission check.
 * Returns true only if the agent exists, is active, and has
 * the requested tool/data/spend permission.
 */
export function isAuthorized(
  engine: IdentityEngine,
  agentId: string,
  check:
    | { type: "tool"; toolName: string }
    | { type: "data"; scope: string }
    | { type: "spend"; amount: string; period: "daily" | "per-task" },
): boolean {
  const agent = engine.getAgent(agentId);
  if (!agent) return false;
  if (agent.status !== "active") return false;
  if (agent.killSwitch) return false;

  switch (check.type) {
    case "tool":
      return engine.checkToolAccess(agentId, check.toolName);
    case "data":
      return engine.checkDataScope(agentId, check.scope);
    case "spend":
      return engine.checkSpendLimit(agentId, check.amount, check.period);
  }
}
