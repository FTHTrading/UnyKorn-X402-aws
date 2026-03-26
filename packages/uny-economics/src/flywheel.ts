/**
 * Revenue Flywheel
 *
 * Connects x402 payment revenue directly to UNY token economics:
 *
 *   x402 Invoice Paid → UNY received → Revenue Split:
 *     ├─ 40% → Buy-and-Burn (deflationary pressure)
 *     ├─ 30% → LP Provision (deepens UNY/USDF liquidity)
 *     ├─ 20% → Treasury Reserve (protocol sustainability)
 *     └─ 10% → Staking Rewards (validator incentives)
 *
 * This creates a self-reinforcing cycle:
 *   More x402 usage → More UNY demand → Higher UNY price →
 *   More LP interest → Deeper liquidity → Lower slippage →
 *   More x402 usage → ...
 *
 * The flywheel is the mechanism that makes UNY's value directly
 * proportional to real API usage and revenue.
 */

import type { UnyAMM } from "./amm";

// ── Types ──────────────────────────────────────────────────

export interface FlywheelConfig {
  /** Percentage of revenue allocated to buy-and-burn (basis points) */
  burnShareBps: number;
  /** Percentage of revenue allocated to LP provision (basis points) */
  lpShareBps: number;
  /** Percentage of revenue held in treasury reserve (basis points) */
  treasuryShareBps: number;
  /** Percentage of revenue distributed as staking rewards (basis points) */
  stakingShareBps: number;
  /** Minimum accumulated revenue before executing a flywheel cycle */
  minCycleThresholdUNY: bigint;
  /** Interval between automatic flywheel executions (ms) */
  cycleIntervalMs: number;
}

export interface FlywheelState {
  /** Current flywheel configuration */
  config: FlywheelConfig;
  /** Total revenue collected from x402 (all time, in UNY) */
  totalRevenueUNY: bigint;
  /** Revenue pending distribution */
  pendingRevenueUNY: bigint;
  /** Total UNY burned via buyback */
  totalBurnedUNY: bigint;
  /** Total USDF added to LP from revenue */
  totalLPProvidedUSDf: bigint;
  /** Total UNY held in treasury reserve */
  treasuryReserveUNY: bigint;
  /** Total UNY distributed as staking rewards */
  totalStakingRewardsUNY: bigint;
  /** Number of flywheel cycles executed */
  cyclesExecuted: number;
  /** Last cycle timestamp */
  lastCycleAt: string | null;
  /** Revenue per cycle (rolling average) */
  avgRevenuePerCycleUNY: bigint;
  /** Effective burn rate (UNY/day) */
  dailyBurnRateUNY: bigint;
}

export interface BurnRecord {
  /** Unique burn ID */
  burnId: string;
  /** Amount of UNY burned */
  amountUNY: bigint;
  /** USDF equivalent at burn price */
  equivalentUSDf: bigint;
  /** UNY price at time of burn */
  burnPrice: number;
  /** Source of the burned UNY */
  source: "x402_revenue" | "protocol_fees" | "manual";
  /** Transaction hash (if on-chain) */
  txHash?: string;
  /** Timestamp */
  timestamp: string;
}

export interface LPProvisionRecord {
  /** Unique provision ID */
  provisionId: string;
  /** UNY added to LP */
  amountUNY: bigint;
  /** USDF added to LP */
  amountUSDf: bigint;
  /** LP shares received */
  sharesReceived: bigint;
  /** Revenue cycle that triggered this */
  cycleNumber: number;
  /** Timestamp */
  timestamp: string;
}

// ── Default Configuration ──────────────────────────────────

const DEFAULT_CONFIG: FlywheelConfig = {
  burnShareBps: 4000,      // 40% → buy-and-burn
  lpShareBps: 3000,        // 30% → LP provision
  treasuryShareBps: 2000,  // 20% → treasury reserve
  stakingShareBps: 1000,   // 10% → staking rewards
  minCycleThresholdUNY: 100n * 10n ** 18n, // 100 UNY minimum
  cycleIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
};

// ── Revenue Flywheel Implementation ────────────────────────

export class RevenueFlywheel {
  private config: FlywheelConfig;
  private amm: UnyAMM;

  private totalRevenueUNY = 0n;
  private pendingRevenueUNY = 0n;
  private totalBurnedUNY = 0n;
  private totalLPProvidedUSDf = 0n;
  private treasuryReserveUNY = 0n;
  private totalStakingRewardsUNY = 0n;
  private cyclesExecuted = 0;
  private lastCycleAt: string | null = null;
  private burnHistory: BurnRecord[] = [];
  private lpHistory: LPProvisionRecord[] = [];
  private cycleTimer: NodeJS.Timeout | null = null;

  constructor(amm: UnyAMM, config?: Partial<FlywheelConfig>) {
    this.amm = amm;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Validate config sums to 10000 bps (100%)
    const total =
      this.config.burnShareBps +
      this.config.lpShareBps +
      this.config.treasuryShareBps +
      this.config.stakingShareBps;
    if (total !== 10000) {
      throw new Error(`Flywheel shares must sum to 10000 bps, got ${total}`);
    }
  }

  // ── Revenue Collection ───────────────────────────────────

  /**
   * Record revenue from an x402 payment.
   * Called by the Facilitator after confirming a receipt.
   */
  collectRevenue(amountUNY: bigint, invoiceId?: string): void {
    this.totalRevenueUNY += amountUNY;
    this.pendingRevenueUNY += amountUNY;
  }

  // ── Flywheel Execution ───────────────────────────────────

  /**
   * Execute one flywheel cycle:
   *   1. Take all pending revenue
   *   2. Split per configuration
   *   3. Execute burn, LP provision, treasury deposit, staking payout
   */
  executeCycle(): {
    burned: bigint;
    lpProvided: bigint;
    treasuryDeposited: bigint;
    stakingDistributed: bigint;
    burnRecord?: BurnRecord;
  } | null {
    if (this.pendingRevenueUNY < this.config.minCycleThresholdUNY) {
      return null; // Not enough accumulated
    }

    const revenue = this.pendingRevenueUNY;
    this.pendingRevenueUNY = 0n;

    // Split revenue
    const toBurn = (revenue * BigInt(this.config.burnShareBps)) / 10000n;
    const toLP = (revenue * BigInt(this.config.lpShareBps)) / 10000n;
    const toTreasury = (revenue * BigInt(this.config.treasuryShareBps)) / 10000n;
    const toStaking = revenue - toBurn - toLP - toTreasury; // Remainder to staking

    // 1. Buy-and-Burn: Swap UNY → deposit revenue as USDF in AMM → AMM buys back UNY
    //    In practice, we directly burn the UNY from revenue
    this.totalBurnedUNY += toBurn;
    const burnPrice = this.amm.getState().priceUNY;
    const burnRecord: BurnRecord = {
      burnId: `burn-${this.cyclesExecuted + 1}-${Date.now()}`,
      amountUNY: toBurn,
      equivalentUSDf: BigInt(Math.floor(Number(toBurn) * burnPrice)),
      burnPrice,
      source: "x402_revenue",
      timestamp: new Date().toISOString(),
    };
    this.burnHistory.push(burnRecord);

    // 2. LP Provision: Add UNY to the AMM (paired with matching USDF from treasury)
    this.totalLPProvidedUSDf += BigInt(Math.floor(Number(toLP) * burnPrice));

    // 3. Treasury Reserve
    this.treasuryReserveUNY += toTreasury;

    // 4. Staking Rewards
    this.totalStakingRewardsUNY += toStaking;

    this.cyclesExecuted++;
    this.lastCycleAt = new Date().toISOString();

    return {
      burned: toBurn,
      lpProvided: toLP,
      treasuryDeposited: toTreasury,
      stakingDistributed: toStaking,
      burnRecord,
    };
  }

  // ── Auto-Cycle ───────────────────────────────────────────

  /**
   * Start automatic flywheel execution at the configured interval.
   */
  startAutoCycle(logger?: { info: (msg: string) => void }): void {
    if (this.cycleTimer) return;
    this.cycleTimer = setInterval(() => {
      const result = this.executeCycle();
      if (result && logger) {
        logger.info(
          `[Flywheel] Cycle #${this.cyclesExecuted}: ` +
            `burned=${result.burned}, LP=${result.lpProvided}, ` +
            `treasury=${result.treasuryDeposited}, staking=${result.stakingDistributed}`
        );
      }
    }, this.config.cycleIntervalMs);
  }

  stopAutoCycle(): void {
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  // ── View State ───────────────────────────────────────────

  getState(): FlywheelState {
    const avgRevenue =
      this.cyclesExecuted > 0
        ? this.totalRevenueUNY / BigInt(this.cyclesExecuted)
        : 0n;

    // Estimate daily burn rate from cycle data
    const cyclesPerDay =
      this.config.cycleIntervalMs > 0
        ? (24 * 60 * 60 * 1000) / this.config.cycleIntervalMs
        : 0;
    const dailyBurn = BigInt(Math.floor(Number(avgRevenue) * cyclesPerDay)) *
      BigInt(this.config.burnShareBps) / 10000n;

    return {
      config: this.config,
      totalRevenueUNY: this.totalRevenueUNY,
      pendingRevenueUNY: this.pendingRevenueUNY,
      totalBurnedUNY: this.totalBurnedUNY,
      totalLPProvidedUSDf: this.totalLPProvidedUSDf,
      treasuryReserveUNY: this.treasuryReserveUNY,
      totalStakingRewardsUNY: this.totalStakingRewardsUNY,
      cyclesExecuted: this.cyclesExecuted,
      lastCycleAt: this.lastCycleAt,
      avgRevenuePerCycleUNY: avgRevenue,
      dailyBurnRateUNY: dailyBurn,
    };
  }

  getBurnHistory(): BurnRecord[] {
    return [...this.burnHistory];
  }

  getLPHistory(): LPProvisionRecord[] {
    return [...this.lpHistory];
  }

  getConfig(): FlywheelConfig {
    return { ...this.config };
  }

  /**
   * Update flywheel configuration (governance action).
   * Shares must still sum to 10000.
   */
  updateConfig(patch: Partial<FlywheelConfig>): void {
    const newConfig = { ...this.config, ...patch };
    const total =
      newConfig.burnShareBps +
      newConfig.lpShareBps +
      newConfig.treasuryShareBps +
      newConfig.stakingShareBps;
    if (total !== 10000) {
      throw new Error(`Flywheel shares must sum to 10000 bps, got ${total}`);
    }
    this.config = newConfig;
  }
}
