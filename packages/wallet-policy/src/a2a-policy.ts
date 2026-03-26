/**
 * @unykorn/wallet-policy — A2A Wallet Policy Types & Enforcement
 *
 * Per-agent wallet policies with hard boundaries.
 * These are the agent-facing wallet types — scoped subsets of the system domains.
 */

import type { WalletDomain, SignAction } from "./domains.js";

/** Agent wallet types — scoped roles for A2A agent wallets. */
export type WalletType =
  | "observer"
  | "execution"
  | "escrow"
  | "settlement_relay";

/** Actions available to agent wallets (subset of SignAction). */
export type WalletAction =
  | "view"
  | "transfer"
  | "lock"
  | "release"
  | "settle";

/** All wallet types for runtime validation. */
export const WALLET_TYPES: readonly WalletType[] = [
  "observer",
  "execution",
  "escrow",
  "settlement_relay",
] as const;

/** All wallet actions for runtime validation. */
export const WALLET_ACTIONS: readonly WalletAction[] = [
  "view",
  "transfer",
  "lock",
  "release",
  "settle",
] as const;

/**
 * A2A Wallet Policy — defines what an individual agent wallet can do.
 *
 * Every agent gets exactly one of these on registration.
 * The signer will enforce these limits server-side (Rust policy layer),
 * but TS callers should pre-check via `canExecute()` to fail fast.
 */
export interface A2AWalletPolicy {
  agentId: string;
  walletType: WalletType;
  allowedActions: WalletAction[];
  allowedAssets: string[];
  allowedCounterparties: string[];
  dailyLimitUsd: number;
  perTxLimitUsd: number;
  approvalThresholdUsd: number;
  requiresSimulation: boolean;
  requiresHumanApproval: boolean;
  canSignDirectly: boolean;
  expiresAt?: string; // ISO-8601
}

/** Mapping from WalletType to the system-level WalletDomain. */
export const WALLET_TYPE_DOMAIN_MAP: Record<WalletType, WalletDomain> = {
  observer: "agent_observer",
  execution: "agent_execution",
  escrow: "agent_escrow",
  settlement_relay: "agent_settlement",
} as const;

/** Default policies per wallet type. */
export function defaultA2APolicy(
  agentId: string,
  walletType: WalletType
): A2AWalletPolicy {
  switch (walletType) {
    case "observer":
      return {
        agentId,
        walletType: "observer",
        allowedActions: ["view"],
        allowedAssets: ["UNY"],
        allowedCounterparties: [],
        dailyLimitUsd: 0,
        perTxLimitUsd: 0,
        approvalThresholdUsd: 0,
        requiresSimulation: false,
        requiresHumanApproval: false,
        canSignDirectly: false,
      };

    case "execution":
      return {
        agentId,
        walletType: "execution",
        allowedActions: ["view", "transfer", "lock", "settle"],
        allowedAssets: ["UNY", "USDC"],
        allowedCounterparties: [],
        dailyLimitUsd: 10_000,
        perTxLimitUsd: 5_000,
        approvalThresholdUsd: 2_000,
        requiresSimulation: true,
        requiresHumanApproval: false,
        canSignDirectly: true,
      };

    case "escrow":
      return {
        agentId,
        walletType: "escrow",
        allowedActions: ["view", "lock", "release"],
        allowedAssets: ["UNY", "USDC"],
        allowedCounterparties: [],
        dailyLimitUsd: 50_000,
        perTxLimitUsd: 10_000,
        approvalThresholdUsd: 5_000,
        requiresSimulation: true,
        requiresHumanApproval: false,
        canSignDirectly: true,
      };

    case "settlement_relay":
      return {
        agentId,
        walletType: "settlement_relay",
        allowedActions: ["view", "transfer", "settle"],
        allowedAssets: ["UNY", "USDC"],
        allowedCounterparties: [],
        dailyLimitUsd: 100_000,
        perTxLimitUsd: 25_000,
        approvalThresholdUsd: 10_000,
        requiresSimulation: true,
        requiresHumanApproval: false,
        canSignDirectly: true,
      };
  }
}

/**
 * Pre-check whether an agent wallet can execute a given action.
 *
 * Returns { allowed: true } or { allowed: false, reason: string }.
 * This is a client-side fast-fail — the signer does its own enforcement.
 */
export function canExecute(
  policy: A2AWalletPolicy,
  action: WalletAction,
  opts?: {
    amountUsd?: number;
    counterparty?: string;
    asset?: string;
  }
): { allowed: true } | { allowed: false; reason: string } {
  // Check expiry
  if (policy.expiresAt) {
    const expiry = new Date(policy.expiresAt);
    if (expiry.getTime() < Date.now()) {
      return { allowed: false, reason: `policy expired at ${policy.expiresAt}` };
    }
  }

  // Check action allowlist
  if (!policy.allowedActions.includes(action)) {
    return {
      allowed: false,
      reason: `action '${action}' not allowed for ${policy.walletType} wallet (agent ${policy.agentId})`,
    };
  }

  // Check asset allowlist
  if (opts?.asset && policy.allowedAssets.length > 0) {
    if (!policy.allowedAssets.includes(opts.asset)) {
      return {
        allowed: false,
        reason: `asset '${opts.asset}' not in allowlist [${policy.allowedAssets.join(", ")}]`,
      };
    }
  }

  // Check counterparty allowlist (empty = any)
  if (
    opts?.counterparty &&
    policy.allowedCounterparties.length > 0 &&
    !policy.allowedCounterparties.includes(opts.counterparty)
  ) {
    return {
      allowed: false,
      reason: `counterparty '${opts.counterparty}' not in allowlist`,
    };
  }

  // Check per-tx limit
  if (opts?.amountUsd !== undefined && opts.amountUsd > policy.perTxLimitUsd) {
    return {
      allowed: false,
      reason: `amount $${opts.amountUsd.toFixed(2)} exceeds per-tx limit $${policy.perTxLimitUsd.toFixed(2)}`,
    };
  }

  // Check signing ability
  if (!policy.canSignDirectly && action !== "view") {
    return {
      allowed: false,
      reason: `${policy.walletType} wallet cannot sign directly`,
    };
  }

  return { allowed: true };
}

/**
 * Validate that a policy object is structurally correct.
 */
export function validatePolicy(
  policy: A2AWalletPolicy
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (!policy.agentId) errors.push("agentId is required");
  if (!(WALLET_TYPES as readonly string[]).includes(policy.walletType)) {
    errors.push(`invalid walletType: ${policy.walletType}`);
  }
  for (const a of policy.allowedActions) {
    if (!(WALLET_ACTIONS as readonly string[]).includes(a)) {
      errors.push(`invalid action: ${a}`);
    }
  }
  if (policy.dailyLimitUsd < 0) errors.push("dailyLimitUsd must be >= 0");
  if (policy.perTxLimitUsd < 0) errors.push("perTxLimitUsd must be >= 0");
  if (policy.perTxLimitUsd > policy.dailyLimitUsd) {
    errors.push("perTxLimitUsd cannot exceed dailyLimitUsd");
  }
  if (policy.approvalThresholdUsd < 0)
    errors.push("approvalThresholdUsd must be >= 0");

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}
