/**
 * x407 Trust Registry
 *
 * Maintains a live trust profile for every agent in the network.
 * Trust scores are computed from six weighted factors and map to
 * tier thresholds that gate session limits, fee discounts, and
 * compliance fast-paths.
 */

import { randomBytes } from "crypto";
import type {
  Accreditation,
  TrustProfile,
  TrustScoreFactors,
  TrustTier,
} from "./types";
import { DEFAULT_TRUST_TIER_THRESHOLDS } from "./types";

// ─── Scoring Weights ─────────────────────────────────────────────────
const WEIGHTS: Record<keyof TrustScoreFactors, number> = {
  completionRate: 0.30,
  disputeScore: 0.25,
  volumeConsistency: 0.15,
  complianceScore: 0.15,
  tenureScore: 0.10,
  endorsementScore: 0.05,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// ─── Trust Registry ──────────────────────────────────────────────────
export class TrustRegistry {
  private readonly profiles = new Map<string, TrustProfile>();
  private readonly thresholds: Record<TrustTier, number>;

  constructor(thresholds?: Record<TrustTier, number>) {
    this.thresholds = thresholds ?? { ...DEFAULT_TRUST_TIER_THRESHOLDS };
  }

  // ── Profile Lifecycle ────────────────────────────────────────────

  /** Register a new agent with a zero‑history profile. */
  register(agentId: string, jurisdictions?: string[]): TrustProfile {
    if (this.profiles.has(agentId)) {
      return this.profiles.get(agentId)!;
    }

    const now = new Date().toISOString();
    const profile: TrustProfile = {
      agentId,
      trustScore: 0,
      tier: "untrusted",
      totalTransactions: 0,
      totalVolume: "0",
      totalDisputes: 0,
      disputesWon: 0,
      disputesLost: 0,
      recentTransactions: 0,
      recentVolume: "0",
      recentDisputeRate: 0,
      kycLevel: 0,
      sanctionsCleared: false,
      jurisdictions: jurisdictions ?? [],
      accreditations: [],
      firstSeenAt: now,
      lastActiveAt: now,
      updatedAt: now,
    };

    this.profiles.set(agentId, profile);
    return profile;
  }

  /** Get a profile (or undefined). */
  getProfile(agentId: string): TrustProfile | undefined {
    return this.profiles.get(agentId);
  }

  /** Resolve tier from a raw score. */
  tierFromScore(score: number): TrustTier {
    const ordered: TrustTier[] = [
      "institutional", "elite", "trusted", "standard", "provisional", "untrusted",
    ];
    for (const tier of ordered) {
      if (score >= this.thresholds[tier]) return tier;
    }
    return "untrusted";
  }

  // ── Score Computation ────────────────────────────────────────────

  /** Recalculate trust score from raw factors. */
  computeScore(factors: TrustScoreFactors): number {
    let score = 0;
    for (const key of Object.keys(WEIGHTS) as (keyof TrustScoreFactors)[]) {
      score += clamp(factors[key], 0, 100) * WEIGHTS[key];
    }
    return Math.round(clamp(score, 0, 100));
  }

  /** Build factors from a profile's lifetime stats. */
  deriveFactors(profile: TrustProfile): TrustScoreFactors {
    const total = profile.totalTransactions || 1;
    const completionRate =
      ((total - profile.totalDisputes) / total) * 100;

    const disputeScore =
      profile.totalDisputes === 0
        ? 100
        : clamp(100 - profile.recentDisputeRate * 200, 0, 100);

    // Volume consistency: reward agents that transact regularly
    const volumeConsistency =
      profile.recentTransactions > 0 ? clamp(profile.recentTransactions / 10, 0, 100) : 0;

    const complianceScore = profile.kycLevel * 25 + (profile.sanctionsCleared ? 10 : 0);

    // Tenure: months since first seen, capped at 24 months = 100
    const monthsActive =
      (Date.now() - new Date(profile.firstSeenAt).getTime()) / (30.44 * 86400000);
    const tenureScore = clamp((monthsActive / 24) * 100, 0, 100);

    const endorsementScore = clamp(profile.accreditations.length * 20, 0, 100);

    return {
      completionRate,
      disputeScore,
      volumeConsistency,
      complianceScore,
      tenureScore,
      endorsementScore,
    };
  }

  /** Full recalculation: derive factors → compute score → update tier. */
  recalculate(agentId: string): TrustProfile | undefined {
    const profile = this.profiles.get(agentId);
    if (!profile) return undefined;

    const factors = this.deriveFactors(profile);
    profile.trustScore = this.computeScore(factors);
    profile.tier = this.tierFromScore(profile.trustScore);
    profile.updatedAt = new Date().toISOString();

    return profile;
  }

  // ── Event Recording ──────────────────────────────────────────────

  /** Record a successful transaction and recalculate. */
  recordTransaction(
    agentId: string,
    volume: string
  ): TrustProfile | undefined {
    const profile = this.profiles.get(agentId);
    if (!profile) return undefined;

    profile.totalTransactions += 1;
    profile.recentTransactions += 1;
    profile.totalVolume = addBigint(profile.totalVolume, volume);
    profile.recentVolume = addBigint(profile.recentVolume, volume);
    profile.lastActiveAt = new Date().toISOString();

    return this.recalculate(agentId);
  }

  /** Record a dispute. */
  recordDispute(
    agentId: string,
    won: boolean
  ): TrustProfile | undefined {
    const profile = this.profiles.get(agentId);
    if (!profile) return undefined;

    profile.totalDisputes += 1;
    if (won) profile.disputesWon += 1;
    else profile.disputesLost += 1;

    const recent = profile.recentTransactions || 1;
    profile.recentDisputeRate = profile.totalDisputes / recent;
    profile.lastActiveAt = new Date().toISOString();

    return this.recalculate(agentId);
  }

  /** Set KYC level (0–3). */
  setKycLevel(agentId: string, level: number): TrustProfile | undefined {
    const profile = this.profiles.get(agentId);
    if (!profile) return undefined;
    profile.kycLevel = clamp(level, 0, 3);
    return this.recalculate(agentId);
  }

  /** Mark sanctions screening result. */
  setSanctionsCleared(agentId: string, cleared: boolean): TrustProfile | undefined {
    const profile = this.profiles.get(agentId);
    if (!profile) return undefined;
    profile.sanctionsCleared = cleared;
    return this.recalculate(agentId);
  }

  // ── Accreditation ────────────────────────────────────────────────

  grantAccreditation(
    agentId: string,
    type: string,
    issuedBy: string,
    expiresAt?: string
  ): Accreditation | undefined {
    const profile = this.profiles.get(agentId);
    if (!profile) return undefined;

    const accreditation: Accreditation = {
      accreditationId: randomBytes(12).toString("hex"),
      type,
      issuedBy,
      issuedAt: new Date().toISOString(),
      expiresAt,
      revoked: false,
    };

    profile.accreditations.push(accreditation);
    this.recalculate(agentId);
    return accreditation;
  }

  revokeAccreditation(agentId: string, accreditationId: string): boolean {
    const profile = this.profiles.get(agentId);
    if (!profile) return false;

    const acc = profile.accreditations.find((a) => a.accreditationId === accreditationId);
    if (!acc || acc.revoked) return false;

    acc.revoked = true;
    this.recalculate(agentId);
    return true;
  }

  // ── Queries ──────────────────────────────────────────────────────

  /** All profiles at or above a given tier. */
  getByTier(minTier: TrustTier): TrustProfile[] {
    const minScore = this.thresholds[minTier];
    return [...this.profiles.values()].filter((p) => p.trustScore >= minScore);
  }

  /** Total registered agents. */
  get size(): number {
    return this.profiles.size;
  }

  /** Export all profiles (for snapshots / persistence). */
  exportAll(): TrustProfile[] {
    return [...this.profiles.values()];
  }

  /** Bulk import (e.g., from DB on startup). */
  importAll(profiles: TrustProfile[]): void {
    for (const p of profiles) {
      this.profiles.set(p.agentId, p);
    }
  }
}

// ─── Bigint string arithmetic ────────────────────────────────────────
function addBigint(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}
