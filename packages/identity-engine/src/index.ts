/**
 * @unykorn/identity-engine — Agent Identity Management & Authorization
 *
 * Manages agent identities, real Ed25519 key pairs, permissions, and organizations.
 * Provides isAuthorized() gate for identity + permission checks.
 */

import {
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  createPublicKey,
  createPrivateKey,
} from "node:crypto";
import { nanoid } from "nanoid";
import type {
  AgentIdentity,
  AgentRole,
  AgentTier,
  AgentStatus,
  Organization,
} from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Ed25519 Key Pair — Real Cryptography
// ═══════════════════════════════════════════════════════════

// DER headers for Ed25519 key encoding/decoding
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex"); // 12 bytes
const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
); // 16 bytes

export interface KeyPair {
  publicKey: string; // 64-char hex (32 bytes raw Ed25519 public key)
  privateKey: string; // 64-char hex (32 bytes raw Ed25519 private seed)
}

/**
 * Generate a real Ed25519 key pair.
 * Returns hex-encoded raw 32-byte keys (public + private seed).
 */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const privDer = privateKey.export({ type: "pkcs8", format: "der" });
  return {
    publicKey: pubDer.subarray(ED25519_SPKI_PREFIX.length).toString("hex"),
    privateKey: privDer.subarray(ED25519_PKCS8_PREFIX.length).toString("hex"),
  };
}

/**
 * Sign data with an Ed25519 private key.
 * @param data - The data string to sign
 * @param privateKeyHex - 64-char hex private key seed
 * @returns Hex-encoded Ed25519 signature (128 chars = 64 bytes)
 */
export function signData(data: string, privateKeyHex: string): string {
  const privDer = Buffer.concat([
    ED25519_PKCS8_PREFIX,
    Buffer.from(privateKeyHex, "hex"),
  ]);
  const keyObject = createPrivateKey({
    key: privDer,
    format: "der",
    type: "pkcs8",
  });
  const signature = cryptoSign(null, Buffer.from(data, "utf-8"), keyObject);
  return signature.toString("hex");
}

/**
 * Verify an Ed25519 signature against a public key.
 * @param data - The original data string
 * @param signatureHex - 128-char hex signature
 * @param publicKeyHex - 64-char hex public key
 * @returns true if signature is valid
 */
export function verifySignature(
  data: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  try {
    const pubDer = Buffer.concat([
      ED25519_SPKI_PREFIX,
      Buffer.from(publicKeyHex, "hex"),
    ]);
    const keyObject = createPublicKey({
      key: pubDer,
      format: "der",
      type: "spki",
    });
    return cryptoVerify(
      null,
      Buffer.from(data, "utf-8"),
      keyObject,
      Buffer.from(signatureHex, "hex"),
    );
  } catch {
    return false;
  }
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
