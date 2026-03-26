/**
 * @unykorn/wallet-policy — Wallet Domain Types
 *
 * Mirrors the 10 wallet domains defined in rust-signer policy.rs.
 * These are the system-level infrastructure domains.
 */

/**
 * System-level wallet domains — matches rust-signer WalletDomain enum exactly.
 * These are infrastructure domains, not agent-facing.
 */
export type WalletDomain =
  | "cold_root_governance"
  | "treasury_vault"
  | "issuance_control"
  | "upgrade_admin"
  | "operations"
  | "burner"
  | "agent_execution"
  | "agent_escrow"
  | "agent_settlement"
  | "agent_observer";

/** All valid wallet domains for runtime validation. */
export const WALLET_DOMAINS: readonly WalletDomain[] = [
  "cold_root_governance",
  "treasury_vault",
  "issuance_control",
  "upgrade_admin",
  "operations",
  "burner",
  "agent_execution",
  "agent_escrow",
  "agent_settlement",
  "agent_observer",
] as const;

/** Signing actions — mirrors rust-signer SignAction enum exactly. */
export type SignAction =
  | "transfer"
  | "mint"
  | "burn"
  | "lock"
  | "release"
  | "settle"
  | "upgrade"
  | "rotate"
  | "approve"
  | "dapp_connect"
  | "arbitrary_sign";

export const SIGN_ACTIONS: readonly SignAction[] = [
  "transfer",
  "mint",
  "burn",
  "lock",
  "release",
  "settle",
  "upgrade",
  "rotate",
  "approve",
  "dapp_connect",
  "arbitrary_sign",
] as const;

/** Domain-level policy definition — matches DomainPolicy in rust-signer. */
export interface DomainPolicy {
  domain: WalletDomain;
  allowedActions: SignAction[];
  dailyLimitUsd: number;
  perTxLimitUsd: number;
  approvalThresholdUsd: number;
  requiresSimulation: boolean;
  requiresHumanApproval: boolean;
  canSignDirectly: boolean;
  allowedCounterparties?: string[];
  allowedAssets?: string[];
}

export function isValidDomain(value: string): value is WalletDomain {
  return (WALLET_DOMAINS as readonly string[]).includes(value);
}

export function isValidAction(value: string): value is SignAction {
  return (SIGN_ACTIONS as readonly string[]).includes(value);
}
