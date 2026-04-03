/**
 * x407 Challenge Engine
 *
 * Implements HTTP 407‑style challenge‑response authentication for AI agents.
 * Before an agent can open a metered session, it must prove identity,
 * capability, solvency, or compliance depending on the requested service.
 *
 * Flow:
 *   1. Service returns 407 + X407Challenge
 *   2. Agent signs the challenge payload with its Ed25519 key
 *   3. ChallengeEngine.verify() validates signature + proof data
 *   4. On success, SessionManager creates a metered session
 */

import { createHmac, randomBytes } from "crypto";
import type {
  ChallengePayload,
  ChallengeResponse,
  ChallengeStatus,
  ChallengeType,
  TrustTier,
  X407Challenge,
} from "./types";

// ─── Ed25519 verify (Node 18+) ──────────────────────────────────────
async function ed25519Verify(
  signature: Buffer,
  message: Buffer,
  publicKey: Buffer
): Promise<boolean> {
  const { subtle } = globalThis.crypto;
  const key = await subtle.importKey(
    "raw",
    publicKey,
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  return subtle.verify("Ed25519", key, signature, message);
}

// ─── Challenge Engine ────────────────────────────────────────────────
export class ChallengeEngine {
  private readonly serverSecret: Buffer;
  private readonly ttlSeconds: number;
  /** In-memory store.  Production: back with PostgreSQL / Redis. */
  private readonly pending = new Map<string, X407Challenge>();

  constructor(opts: { serverSecretHex: string; ttlSeconds?: number }) {
    this.serverSecret = Buffer.from(opts.serverSecretHex, "hex");
    this.ttlSeconds = opts.ttlSeconds ?? 120;
  }

  // ── Issue ────────────────────────────────────────────────────────
  issue(params: {
    type: ChallengeType;
    subjectAgentId: string;
    issuerServiceId: string;
    minTrustTier?: TrustTier;
    minBalance?: string;
    requiredCapabilities?: string[];
  }): X407Challenge {
    const challengeId = randomBytes(16).toString("hex");
    const nonce = randomBytes(16).toString("hex");
    const dataToSign = randomBytes(32).toString("hex");

    const requiredFields: string[] = ["signature", "signerPublicKey"];
    if (params.type === "solvency") requiredFields.push("balanceProof");
    if (params.type === "capability") requiredFields.push("capabilityProof");
    if (params.type === "compliance") requiredFields.push("complianceCert");

    const payload: ChallengePayload = {
      dataToSign,
      requiredFields,
      minTrustTier: params.minTrustTier,
      minBalance: params.minBalance,
      requiredCapabilities: params.requiredCapabilities,
    };

    const challengeToken = this.hmac(`${challengeId}:${nonce}:${params.type}`);
    const now = new Date();

    const challenge: X407Challenge = {
      challengeId,
      type: params.type,
      subjectAgentId: params.subjectAgentId,
      issuerServiceId: params.issuerServiceId,
      challengeToken,
      nonce,
      payload,
      status: "issued",
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000).toISOString(),
    };

    this.pending.set(challengeId, challenge);
    return challenge;
  }

  // ── Verify ───────────────────────────────────────────────────────
  async verify(response: ChallengeResponse): Promise<{
    verified: boolean;
    challenge?: X407Challenge;
    error?: string;
  }> {
    const challenge = this.pending.get(response.challengeId);
    if (!challenge) {
      return { verified: false, error: "challenge_not_found" };
    }

    // Expiry check
    if (new Date(challenge.expiresAt) < new Date()) {
      challenge.status = "expired";
      this.pending.delete(response.challengeId);
      return { verified: false, error: "challenge_expired" };
    }

    // Replay guard — only accept "issued" challenges
    if (challenge.status !== "issued") {
      return { verified: false, error: "challenge_already_consumed" };
    }

    // Agent identity match
    if (response.respondentAgentId !== challenge.subjectAgentId) {
      return { verified: false, error: "agent_mismatch" };
    }

    // HMAC token integrity
    const expectedToken = this.hmac(
      `${challenge.challengeId}:${challenge.nonce}:${challenge.type}`
    );
    if (challenge.challengeToken !== expectedToken) {
      return { verified: false, error: "token_integrity_failure" };
    }

    // Required fields present
    for (const field of challenge.payload.requiredFields) {
      if (field === "signature" || field === "signerPublicKey") continue;
      if (!response.proofData[field]) {
        challenge.status = "failed";
        return { verified: false, error: `missing_field:${field}` };
      }
    }

    // Ed25519 signature verification
    try {
      const sigBuf = Buffer.from(response.signature, "hex");
      const msgBuf = Buffer.from(challenge.payload.dataToSign, "hex");
      const pubBuf = Buffer.from(response.signerPublicKey, "hex");

      if (pubBuf.length !== 32) {
        challenge.status = "failed";
        return { verified: false, error: "invalid_public_key_length" };
      }

      const valid = await ed25519Verify(sigBuf, msgBuf, pubBuf);
      if (!valid) {
        challenge.status = "failed";
        return { verified: false, error: "signature_invalid" };
      }
    } catch {
      challenge.status = "failed";
      return { verified: false, error: "signature_verification_error" };
    }

    // Success
    challenge.status = "verified";
    challenge.respondedAt = response.respondedAt;
    challenge.verifiedAt = new Date().toISOString();
    this.pending.delete(response.challengeId);

    return { verified: true, challenge };
  }

  // ── Queries ──────────────────────────────────────────────────────
  getPending(challengeId: string): X407Challenge | undefined {
    return this.pending.get(challengeId);
  }

  /** Evict all expired challenges (call periodically) */
  purgeExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [id, ch] of this.pending) {
      if (new Date(ch.expiresAt).getTime() < now) {
        this.pending.delete(id);
        count++;
      }
    }
    return count;
  }

  // ── Internal ─────────────────────────────────────────────────────
  private hmac(data: string): string {
    return createHmac("sha256", this.serverSecret)
      .update(data)
      .digest("hex");
  }
}
