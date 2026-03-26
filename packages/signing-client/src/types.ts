/**
 * @unykorn/signing-client — HTTP Client Types
 *
 * Request/response shapes matching the rust-signer HTTP API.
 */

/**
 * Wallet domain string literals — must match rust-signer WalletDomain enum.
 * Re-declared here to avoid cross-package dependency resolution issues.
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

/** Signing actions — must match rust-signer SignAction enum. */
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

// ── Key Management ──────────────────────────────────────────

export interface GenerateKeyRequest {
  domain: WalletDomain;
  algorithm?: string;
  label?: string;
  actor_id: string;
}

export interface GenerateKeyResponse {
  key_id: string;
  public_key_hex: string;
  domain: WalletDomain;
  algorithm: string;
  created_at: string;
}

export interface KeyMeta {
  id: string;
  public_key_hex: string;
  domain: WalletDomain;
  algorithm: string;
  created_by: string;
  created_at: string;
  rotated_from: string | null;
  revoked: boolean;
  revoked_at: string | null;
  label: string | null;
}

export interface RotateKeyResponse {
  old_key_id: string;
  new_key_id: string;
  public_key_hex: string;
  domain: WalletDomain;
  rotated_at: string;
}

// ── Signing ─────────────────────────────────────────────────

export interface SignRequest {
  key_id: string;
  domain: WalletDomain;
  action: SignAction;
  payload_hex: string;
  amount_usd?: number;
  counterparty?: string;
  asset?: string;
  actor_id: string;
  reason: string;
}

export interface SignResponse {
  signature_hex: string;
  public_key_hex: string;
  payload_hash: string;
  domain: WalletDomain;
  policy_decision: PolicyDecision;
}

export interface VerifyRequest {
  public_key_hex: string;
  payload_hex: string;
  signature_hex: string;
}

export interface VerifyResponse {
  valid: boolean;
}

// ── Policy ──────────────────────────────────────────────────

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  requires_human_approval: boolean;
  requires_simulation: boolean;
}

// ── Audit ───────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  key_id: string;
  action: string;
  domain: string;
  actor_id: string;
  payload_hash: string;
  result: string;
  reason: string;
  timestamp: string;
}

// ── Health ──────────────────────────────────────────────────

export interface HealthResponse {
  service: string;
  status: string;
  timestamp: string;
}
