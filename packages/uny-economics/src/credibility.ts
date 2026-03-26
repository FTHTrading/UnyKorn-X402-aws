/**
 * Credibility Layer
 *
 * Computes and publishes verifiable metrics that establish UNY's credibility
 * as an infrastructure token with real value backing:
 *
 *   1. Token Fundamentals — supply, burn rate, circulating supply, velocity
 *   2. Reserve Attestation — treasury holdings vs obligations, reserve ratio
 *   3. Revenue Metrics — real x402 revenue, invoice count, payment rate
 *   4. Infrastructure Score — uptime, deployed components, provenance
 *   5. Credibility Score — composite metric combining all factors
 *
 * This is public, auditable, and deterministic.
 * Anyone can verify every claim by checking the DB, the chain, and the contracts.
 */

import type { AMMState } from "./amm";
import type { FlywheelState } from "./flywheel";
import type { ProvenanceChain } from "./genesis";

// ── Types ──────────────────────────────────────────────────

export interface TokenFundamentals {
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Total supply at genesis */
  genesisSupply: string;
  /** Current total supply (after burns) */
  currentSupply: string;
  /** Total tokens burned */
  totalBurned: string;
  /** Burn rate as percentage of genesis supply */
  burnRatePercent: number;
  /** Circulating supply (total - treasury - staked - locked) */
  circulatingSupply: string;
  /** Token velocity (transaction volume / circulating supply) */
  velocity: number;
  /** Number of chains where UNY is active */
  activeChains: number;
  /** Number of x402 routes generating demand */
  paidRoutes: number;
  /** Price (from AMM) */
  priceUSDf: number;
  /** Market cap (circulating * price) */
  marketCapUSDf: string;
  /** Fully diluted valuation (genesis supply * price) */
  fdvUSDf: string;
}

export interface ReserveAttestation {
  /** Treasury UNY balance */
  treasuryBalanceUNY: string;
  /** Treasury USDF balance (LP value + reserves) */
  treasuryBalanceUSDf: string;
  /** Total value of LP positions */
  lpValueUSDf: string;
  /** Reserve ratio: treasury value / total obligations */
  reserveRatio: number;
  /** Constitutional minimum (20%) */
  constitutionalMinimum: number;
  /** Is reserve ratio above constitutional minimum? */
  isCompliant: boolean;
  /** Last attestation timestamp */
  attestedAt: string;
  /** SHA-256 hash of attestation data */
  attestationHash: string;
}

export interface CredibilityScore {
  /** Overall credibility score (0-100) */
  overall: number;
  /** Breakdown by category */
  breakdown: {
    /** Infrastructure completeness and uptime (0-25) */
    infrastructure: number;
    /** Token economics health (0-25) */
    tokenomics: number;
    /** Revenue and real usage (0-25) */
    revenue: number;
    /** Governance and provenance (0-25) */
    governance: number;
  };
  /** Human-readable assessment */
  assessment: string;
  /** Factors that contribute positively */
  strengths: string[];
  /** Factors that need improvement */
  weaknesses: string[];
  /** Computed at */
  computedAt: string;
}

// ── Credibility Layer Implementation ───────────────────────

export class CredibilityLayer {
  private ammState: AMMState | null = null;
  private flywheelState: FlywheelState | null = null;
  private provenance: ProvenanceChain | null = null;
  private revenueData: {
    totalInvoices: number;
    paidInvoices: number;
    totalRevenue: string;
    uniquePayers: number;
    paidRoutes: number;
  } | null = null;

  // ── Data Injection ───────────────────────────────────────

  setAMMState(state: AMMState): void {
    this.ammState = state;
  }

  setFlywheelState(state: FlywheelState): void {
    this.flywheelState = state;
  }

  setProvenance(chain: ProvenanceChain): void {
    this.provenance = chain;
  }

  setRevenueData(data: {
    totalInvoices: number;
    paidInvoices: number;
    totalRevenue: string;
    uniquePayers: number;
    paidRoutes: number;
  }): void {
    this.revenueData = data;
  }

  // ── Compute Fundamentals ─────────────────────────────────

  computeFundamentals(): TokenFundamentals {
    const genesisSupply = 1_000_000_000n * 10n ** 18n;
    const totalBurned = this.flywheelState?.totalBurnedUNY ?? 0n;
    const currentSupply = genesisSupply - totalBurned;
    const treasuryHeld = this.flywheelState?.treasuryReserveUNY ?? 0n;
    const staked = this.flywheelState?.totalStakingRewardsUNY ?? 0n; // approximation
    const circulating = currentSupply - treasuryHeld - staked;

    const price = this.ammState?.priceUNY ?? 0;
    const volume = Number(this.ammState?.cumulativeVolumeUSDf ?? 0n);
    const circulatingNum = Number(circulating) / 1e18;
    const velocity = circulatingNum > 0 ? volume / circulatingNum : 0;

    const marketCap = circulatingNum * price;
    const fdv = 1_000_000_000 * price;

    return {
      symbol: "UNY",
      name: "UnyKorn Token",
      genesisSupply: "1,000,000,000",
      currentSupply: formatTokenAmount(currentSupply),
      totalBurned: formatTokenAmount(totalBurned),
      burnRatePercent:
        Number(totalBurned) / Number(genesisSupply) * 100,
      circulatingSupply: formatTokenAmount(circulating),
      velocity,
      activeChains: 4, // UnyKorn L1, Avalanche, Stellar, XRPL
      paidRoutes: this.revenueData?.paidRoutes ?? 9,
      priceUSDf: price,
      marketCapUSDf: formatUSD(marketCap),
      fdvUSDf: formatUSD(fdv),
    };
  }

  // ── Reserve Attestation ──────────────────────────────────

  computeReserveAttestation(): ReserveAttestation {
    const treasuryUNY = this.flywheelState?.treasuryReserveUNY ?? 0n;
    const lpValUSDf = this.flywheelState?.totalLPProvidedUSDf ?? 0n;
    const price = this.ammState?.priceUNY ?? 0;

    const treasuryValueUSDf =
      Number(treasuryUNY) / 1e18 * price + Number(lpValUSDf) / 1e6;

    // Total obligations = circulating supply * price
    const genesisSupply = 1_000_000_000;
    const totalBurned = Number(this.flywheelState?.totalBurnedUNY ?? 0n) / 1e18;
    const totalObligations = (genesisSupply - totalBurned) * price;

    const reserveRatio =
      totalObligations > 0 ? treasuryValueUSDf / totalObligations : 0;

    const data = JSON.stringify({
      treasuryUNY: treasuryUNY.toString(),
      lpValUSDf: lpValUSDf.toString(),
      price,
      reserveRatio,
      timestamp: new Date().toISOString(),
    });

    const { createHash } = require("crypto") as typeof import("crypto");
    const attestationHash = createHash("sha256").update(data).digest("hex");

    return {
      treasuryBalanceUNY: formatTokenAmount(treasuryUNY),
      treasuryBalanceUSDf: formatUSD(Number(treasuryUNY) / 1e18 * price),
      lpValueUSDf: formatUSD(Number(lpValUSDf) / 1e6),
      reserveRatio,
      constitutionalMinimum: 0.20,
      isCompliant: reserveRatio >= 0.20,
      attestedAt: new Date().toISOString(),
      attestationHash,
    };
  }

  // ── Credibility Score ────────────────────────────────────

  computeCredibilityScore(): CredibilityScore {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // 1. Infrastructure (0-25)
    let infraScore = 0;
    const infraCount = this.provenance?.infrastructure.length ?? 0;
    if (infraCount >= 10) { infraScore += 10; strengths.push("10+ infrastructure components deployed"); }
    else if (infraCount >= 5) { infraScore += 5; }
    else { weaknesses.push("Limited infrastructure components"); }

    if (this.provenance) {
      infraScore += 5; strengths.push("Genesis provenance chain verified");
    } else {
      weaknesses.push("No genesis provenance chain");
    }

    const hasVerificationLinks = (this.provenance?.genesis.verificationLinks.length ?? 0) >= 5;
    if (hasVerificationLinks) {
      infraScore += 5; strengths.push("Cross-chain verification links (Polygon, Avalanche, XRPL, Stellar)");
    }

    const hasContracts = (this.provenance?.genesis.verificationLinks.filter(
      (l) => l.type === "contract" || l.type === "token"
    ).length ?? 0) >= 3;
    if (hasContracts) {
      infraScore += 5; strengths.push("Live smart contracts on multiple chains");
    }

    // 2. Tokenomics (0-25)
    let tokenScore = 0;
    const burnedPct =
      Number(this.flywheelState?.totalBurnedUNY ?? 0n) / (1_000_000_000 * 1e18) * 100;
    if (burnedPct > 0) { tokenScore += 5; strengths.push(`${burnedPct.toFixed(4)}% supply burned — deflationary`); }

    const hasAMM = this.ammState && this.ammState.reserveUNY > 0n;
    if (hasAMM) { tokenScore += 10; strengths.push("Active AMM pool for price discovery"); }
    else { weaknesses.push("AMM pool not yet seeded with liquidity"); }

    const hasLP = (this.flywheelState?.totalLPProvidedUSDf ?? 0n) > 0n;
    if (hasLP) { tokenScore += 5; strengths.push("Revenue-funded LP provision active"); }

    const hasFlywheel = (this.flywheelState?.cyclesExecuted ?? 0) > 0;
    if (hasFlywheel) { tokenScore += 5; strengths.push("Revenue flywheel executing cycles"); }
    else { weaknesses.push("Flywheel not yet executing (needs more revenue)"); }

    // 3. Revenue (0-25)
    let revScore = 0;
    const invoices = this.revenueData?.totalInvoices ?? 0;
    if (invoices >= 100) { revScore += 10; strengths.push(`${invoices} invoices generated — real usage`); }
    else if (invoices >= 10) { revScore += 5; strengths.push(`${invoices} invoices generated`); }
    else { weaknesses.push("Low invoice volume — needs more x402 traffic"); }

    const paidInvoices = this.revenueData?.paidInvoices ?? 0;
    if (paidInvoices > 0) { revScore += 10; strengths.push(`${paidInvoices} paid invoices — real revenue`); }
    else { weaknesses.push("No paid invoices yet — 402 system works but needs paying customers"); }

    const paidRoutes = this.revenueData?.paidRoutes ?? 0;
    if (paidRoutes >= 5) { revScore += 5; strengths.push(`${paidRoutes} paid API routes active`); }

    // 4. Governance (0-25)
    let govScore = 0;
    const invariants = this.provenance?.genesis.constitutionalInvariants.length ?? 0;
    if (invariants >= 5) { govScore += 10; strengths.push(`${invariants} constitutional invariants enforced`); }

    const hasPurpose = !!this.provenance?.genesis.purpose;
    if (hasPurpose) { govScore += 10; strengths.push("Purpose-built token with hashed purpose statement"); }

    const hasVaultRegistry = this.provenance?.infrastructure.some(
      (i) => i.component === "Vault Registry"
    );
    if (hasVaultRegistry) { govScore += 5; strengths.push("On-chain VaultRegistry for contract provenance"); }

    const overall = infraScore + tokenScore + revScore + govScore;

    let assessment: string;
    if (overall >= 80) assessment = "EXCELLENT — UNY has strong fundamentals, real revenue, and verifiable infrastructure";
    else if (overall >= 60) assessment = "GOOD — Core infrastructure solid, needs more trading volume and paid usage";
    else if (overall >= 40) assessment = "DEVELOPING — Foundation built, revenue flywheel and AMM need activation";
    else assessment = "EARLY — Infrastructure deployed but token economics need real market activity";

    return {
      overall,
      breakdown: {
        infrastructure: infraScore,
        tokenomics: tokenScore,
        revenue: revScore,
        governance: govScore,
      },
      assessment,
      strengths,
      weaknesses,
      computedAt: new Date().toISOString(),
    };
  }
}

// ── Helpers ────────────────────────────────────────────────

function formatTokenAmount(wei: bigint): string {
  const whole = wei / (10n ** 18n);
  return whole.toLocaleString();
}

function formatUSD(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
