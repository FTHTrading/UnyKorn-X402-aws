/**
 * @unykorn/signing-client — SigningClient
 *
 * HTTP client for the rust-signer service.
 *
 * This is THE approved way for any TypeScript service to:
 *   - Generate keys (scoped to a wallet domain)
 *   - Sign payloads (policy-enforced)
 *   - Verify signatures
 *   - Rotate / revoke keys
 *   - Query audit logs
 *
 * HARD RULE: No app should generate, store, or use privileged keys directly.
 *            All key operations MUST go through this client → rust-signer.
 */

import type {
  GenerateKeyRequest,
  GenerateKeyResponse,
  KeyMeta,
  RotateKeyResponse,
  SignRequest,
  SignResponse,
  VerifyRequest,
  VerifyResponse,
  PolicyDecision,
  AuditEntry,
  HealthResponse,
} from "./types.js";

export interface SigningClientOptions {
  /** Base URL of the rust-signer, e.g. "http://127.0.0.1:4050" */
  baseUrl: string;

  /** Request timeout in ms (default 10000). */
  timeoutMs?: number;

  /** Optional auth token for signer (future use). */
  authToken?: string;
}

export class SigningClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "SigningClientError";
  }
}

/**
 * HTTP client for the UnyKorn rust-signer service.
 */
export class SigningClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;

  constructor(opts: SigningClientOptions) {
    // Strip trailing slash
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (opts.authToken) {
      this.headers["Authorization"] = `Bearer ${opts.authToken}`;
    }
  }

  // ── Internal Fetch ──────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(url, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await resp.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }

      if (!resp.ok) {
        throw new SigningClientError(
          `signer ${method} ${path} failed: ${resp.status}`,
          resp.status,
          json
        );
      }

      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Health ──────────────────────────────────────────────

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/health");
  }

  // ── Key Management ──────────────────────────────────────

  /**
   * Generate a new Ed25519 key scoped to a wallet domain.
   *
   * @returns The key ID and public key hex. Private key is stored server-side only.
   */
  async generateKey(
    domain: string,
    actorId: string,
    label?: string
  ): Promise<GenerateKeyResponse> {
    const body: GenerateKeyRequest = {
      domain: domain as GenerateKeyRequest["domain"],
      actor_id: actorId,
      label,
    };
    return this.request<GenerateKeyResponse>("POST", "/keys/generate", body);
  }

  /** List all (non-revoked) keys. */
  async listKeys(): Promise<KeyMeta[]> {
    return this.request<KeyMeta[]>("GET", "/keys");
  }

  /** Get metadata for a single key. */
  async getKeyMeta(keyId: string): Promise<KeyMeta> {
    return this.request<KeyMeta>("GET", `/keys/${keyId}/meta`);
  }

  /**
   * Rotate a key — revokes the old key and generates a replacement
   * in the same domain.
   */
  async rotateKey(keyId: string, actorId: string): Promise<RotateKeyResponse> {
    return this.request<RotateKeyResponse>("POST", `/keys/${keyId}/rotate`, {
      actor_id: actorId,
    });
  }

  // ── Signing ─────────────────────────────────────────────

  /**
   * Sign a hex-encoded payload with a domain-scoped key.
   *
   * The signer evaluates policy BEFORE signing. If the policy rejects,
   * a SigningClientError with status 403 is thrown.
   */
  async sign(
    keyId: string,
    domain: string,
    action: string,
    payloadHex: string,
    actorId: string,
    reason: string,
    opts?: {
      amountUsd?: number;
      counterparty?: string;
      asset?: string;
    }
  ): Promise<SignResponse> {
    const body: SignRequest = {
      key_id: keyId,
      domain: domain as SignRequest["domain"],
      action: action as SignRequest["action"],
      payload_hex: payloadHex,
      actor_id: actorId,
      reason,
      amount_usd: opts?.amountUsd,
      counterparty: opts?.counterparty,
      asset: opts?.asset,
    };
    return this.request<SignResponse>("POST", "/sign", body);
  }

  /**
   * Convenience: encode a UTF-8 string to hex and sign it.
   */
  async signUtf8(
    keyId: string,
    domain: string,
    action: string,
    payload: string,
    actorId: string,
    reason: string,
    opts?: {
      amountUsd?: number;
      counterparty?: string;
      asset?: string;
    }
  ): Promise<SignResponse> {
    const payloadHex = Buffer.from(payload, "utf-8").toString("hex");
    return this.sign(keyId, domain, action, payloadHex, actorId, reason, opts);
  }

  // ── Verification ────────────────────────────────────────

  /** Verify an Ed25519 signature. */
  async verify(
    publicKeyHex: string,
    payloadHex: string,
    signatureHex: string
  ): Promise<boolean> {
    const body: VerifyRequest = {
      public_key_hex: publicKeyHex,
      payload_hex: payloadHex,
      signature_hex: signatureHex,
    };
    const resp = await this.request<VerifyResponse>("POST", "/verify", body);
    return resp.valid;
  }

  // ── Policy ──────────────────────────────────────────────

  /** Evaluate a sign request against signer policy without signing. */
  async evaluatePolicy(
    request: SignRequest
  ): Promise<PolicyDecision> {
    return this.request<PolicyDecision>(
      "POST",
      "/policies/evaluate-sign-request",
      request
    );
  }

  // ── Audit ───────────────────────────────────────────────

  /** Get recent audit entries. */
  async getAudit(limit = 50): Promise<AuditEntry[]> {
    return this.request<AuditEntry[]>("GET", `/audit?limit=${limit}`);
  }
}

/**
 * Create a SigningClient with default options for local development.
 */
export function createLocalSigner(port = 4050): SigningClient {
  return new SigningClient({
    baseUrl: `http://127.0.0.1:${port}`,
    timeoutMs: 30_000,
  });
}
