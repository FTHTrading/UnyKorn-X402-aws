/**
 * @unykorn/treasury-core — Treasury Management, Refill & Reconciliation
 *
 * Manages treasury state, enforces spend caps, handles automatic refills
 * from UNY Core into Genesis operating balances, and performs reconciliation
 * between UNY Core deposits and total Genesis supply.
 */

import { nanoid } from "nanoid";
import type {
  TreasuryState,
  GenesisBalanceClass,
  GenesisAccount,
} from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Spend Cap
// ═══════════════════════════════════════════════════════════

export interface SpendCap {
  capId: string;
  /** Target: agentId, orgId, or "global" */
  targetId: string;
  /** Type of cap */
  type: "daily" | "weekly" | "monthly" | "per-task";
  /** Maximum spend (bigint string) */
  limit: string;
  /** Amount spent in current period */
  spent: string;
  /** Period start ISO */
  periodStart: string;
  /** Period end ISO (null for per-task) */
  periodEnd: string | null;
}

// ═══════════════════════════════════════════════════════════
// Refill Config
// ═══════════════════════════════════════════════════════════

export interface RefillConfig {
  configId: string;
  /** Agent or org to refill */
  targetId: string;
  /** Balance class to refill (usually OPERATING) */
  targetClass: GenesisBalanceClass;
  /** Refill when balance drops below this threshold */
  threshold: string;
  /** Amount to refill */
  amount: string;
  /** Maximum refills per day */
  maxRefillsPerDay: number;
  /** Refills performed today */
  refillsToday: number;
  /** Last refill ISO timestamp */
  lastRefillAt: string | null;
  /** Is this config active? */
  active: boolean;
}

// ═══════════════════════════════════════════════════════════
// Reconciliation Result
// ═══════════════════════════════════════════════════════════

export interface ReconciliationResult {
  timestamp: string;
  balanced: boolean;
  totalCoreDeposits: string;
  totalGenesisSupply: string;
  discrepancy: string;
  breakdown: {
    operating: string;
    escrowed: string;
    reserved: string;
    staked: string;
    settled: string;
    complianceCleared: string;
  };
}

// ═══════════════════════════════════════════════════════════
// Treasury Manager
// ═══════════════════════════════════════════════════════════

export class TreasuryManager {
  private state: TreasuryState = {
    totalCoreDeposits: "0",
    totalOperating: "0",
    totalEscrowed: "0",
    totalReserved: "0",
    totalStaked: "0",
    totalSettled: "0",
    totalComplianceCleared: "0",
    totalGenesisSupply: "0",
    reconciledAt: new Date().toISOString(),
    balanced: true,
  };

  private spendCaps = new Map<string, SpendCap>();
  private refillConfigs = new Map<string, RefillConfig>();
  private refillLog: Array<{ configId: string; targetId: string; amount: string; at: string }> = [];

  // ── State ────────────────────────────────────────────────

  getState(): TreasuryState {
    return { ...this.state };
  }

  // ── Core Deposit / Withdraw ──────────────────────────────

  recordCoreDeposit(amount: string): void {
    this.state.totalCoreDeposits = (
      BigInt(this.state.totalCoreDeposits) + BigInt(amount)
    ).toString();
    this.state.totalOperating = (
      BigInt(this.state.totalOperating) + BigInt(amount)
    ).toString();
    this.recalcSupply();
  }

  recordCoreWithdrawal(amount: string): boolean {
    const available = BigInt(this.state.totalOperating);
    if (BigInt(amount) > available) return false;
    this.state.totalCoreDeposits = (
      BigInt(this.state.totalCoreDeposits) - BigInt(amount)
    ).toString();
    this.state.totalOperating = (available - BigInt(amount)).toString();
    this.recalcSupply();
    return true;
  }

  // ── Class Movements ──────────────────────────────────────

  moveToEscrow(amount: string): boolean {
    return this.moveBalance("totalOperating", "totalEscrowed", amount);
  }

  releaseFromEscrow(amount: string): boolean {
    return this.moveBalance("totalEscrowed", "totalOperating", amount);
  }

  moveToReserved(amount: string): boolean {
    return this.moveBalance("totalOperating", "totalReserved", amount);
  }

  releaseFromReserved(amount: string): boolean {
    return this.moveBalance("totalReserved", "totalOperating", amount);
  }

  moveToStaked(amount: string): boolean {
    return this.moveBalance("totalOperating", "totalStaked", amount);
  }

  releaseFromStaked(amount: string): boolean {
    return this.moveBalance("totalStaked", "totalOperating", amount);
  }

  settleToProofReceipt(amount: string): boolean {
    return this.moveBalance("totalEscrowed", "totalSettled", amount);
  }

  clearForCompliance(amount: string): boolean {
    return this.moveBalance("totalSettled", "totalComplianceCleared", amount);
  }

  // ── Spend Cap Enforcement ────────────────────────────────

  addSpendCap(params: Omit<SpendCap, "capId" | "spent" | "periodStart" | "periodEnd">): SpendCap {
    const cap: SpendCap = {
      ...params,
      capId: `cap:${nanoid(8)}`,
      spent: "0",
      periodStart: new Date().toISOString(),
      periodEnd: params.type !== "per-task"
        ? new Date(Date.now() + this.periodMs(params.type)).toISOString()
        : null,
    };
    this.spendCaps.set(cap.capId, cap);
    return cap;
  }

  checkSpendCap(targetId: string, amount: string): { allowed: boolean; reason?: string } {
    const caps = [...this.spendCaps.values()].filter((c) => c.targetId === targetId);
    for (const cap of caps) {
      const remaining = BigInt(cap.limit) - BigInt(cap.spent);
      if (BigInt(amount) > remaining) {
        return {
          allowed: false,
          reason: `Spend cap ${cap.capId} exceeded: limit=${cap.limit}, spent=${cap.spent}, requested=${amount}`,
        };
      }
    }
    return { allowed: true };
  }

  recordSpend(targetId: string, amount: string): boolean {
    const { allowed } = this.checkSpendCap(targetId, amount);
    if (!allowed) return false;
    const caps = [...this.spendCaps.values()].filter((c) => c.targetId === targetId);
    for (const cap of caps) {
      cap.spent = (BigInt(cap.spent) + BigInt(amount)).toString();
    }
    return true;
  }

  // ── Refill Logic ─────────────────────────────────────────

  addRefillConfig(params: Omit<RefillConfig, "configId" | "refillsToday" | "lastRefillAt">): RefillConfig {
    const config: RefillConfig = {
      ...params,
      configId: `refill:${nanoid(8)}`,
      refillsToday: 0,
      lastRefillAt: null,
    };
    this.refillConfigs.set(config.configId, config);
    return config;
  }

  /**
   * Check if any refill configs need triggering.
   * Pass current balance for each target. Returns refill actions taken.
   */
  processRefills(
    balanceProvider: (targetId: string) => string,
  ): Array<{ configId: string; targetId: string; amount: string }> {
    const actions: Array<{ configId: string; targetId: string; amount: string }> = [];

    for (const config of this.refillConfigs.values()) {
      if (!config.active) continue;
      if (config.refillsToday >= config.maxRefillsPerDay) continue;

      const currentBalance = balanceProvider(config.targetId);
      if (BigInt(currentBalance) < BigInt(config.threshold)) {
        // Perform refill
        config.refillsToday += 1;
        config.lastRefillAt = new Date().toISOString();
        const action = {
          configId: config.configId,
          targetId: config.targetId,
          amount: config.amount,
        };
        actions.push(action);
        this.refillLog.push({ ...action, at: config.lastRefillAt });
      }
    }

    return actions;
  }

  resetDailyRefillCounters(): void {
    for (const config of this.refillConfigs.values()) {
      config.refillsToday = 0;
    }
  }

  // ── Reconciliation ───────────────────────────────────────

  reconcile(): ReconciliationResult {
    this.recalcSupply();
    const discrepancy = (
      BigInt(this.state.totalCoreDeposits) - BigInt(this.state.totalGenesisSupply)
    ).toString();
    const balanced = discrepancy === "0";

    this.state.balanced = balanced;
    this.state.reconciledAt = new Date().toISOString();

    return {
      timestamp: this.state.reconciledAt,
      balanced,
      totalCoreDeposits: this.state.totalCoreDeposits,
      totalGenesisSupply: this.state.totalGenesisSupply,
      discrepancy,
      breakdown: {
        operating: this.state.totalOperating,
        escrowed: this.state.totalEscrowed,
        reserved: this.state.totalReserved,
        staked: this.state.totalStaked,
        settled: this.state.totalSettled,
        complianceCleared: this.state.totalComplianceCleared,
      },
    };
  }

  // ── Queries ──────────────────────────────────────────────

  getSpendCaps(targetId?: string): SpendCap[] {
    const all = [...this.spendCaps.values()];
    return targetId ? all.filter((c) => c.targetId === targetId) : all;
  }

  getRefillConfigs(): RefillConfig[] {
    return [...this.refillConfigs.values()];
  }

  getRefillLog(limit = 50): Array<{ configId: string; targetId: string; amount: string; at: string }> {
    return this.refillLog.slice(-limit);
  }

  // ── Private Helpers ──────────────────────────────────────

  private moveBalance(
    fromKey: keyof TreasuryState,
    toKey: keyof TreasuryState,
    amount: string,
  ): boolean {
    const fromVal = BigInt(this.state[fromKey] as string);
    if (BigInt(amount) > fromVal) return false;
    (this.state as unknown as Record<string, unknown>)[fromKey] = (fromVal - BigInt(amount)).toString();
    (this.state as unknown as Record<string, unknown>)[toKey] = (
      BigInt(this.state[toKey] as string) + BigInt(amount)
    ).toString();
    this.recalcSupply();
    return true;
  }

  private recalcSupply(): void {
    this.state.totalGenesisSupply = (
      BigInt(this.state.totalOperating) +
      BigInt(this.state.totalEscrowed) +
      BigInt(this.state.totalReserved) +
      BigInt(this.state.totalStaked) +
      BigInt(this.state.totalSettled) +
      BigInt(this.state.totalComplianceCleared)
    ).toString();
  }

  private periodMs(type: "daily" | "weekly" | "monthly"): number {
    switch (type) {
      case "daily":
        return 86_400_000;
      case "weekly":
        return 604_800_000;
      case "monthly":
        return 2_592_000_000; // 30 days
    }
  }
}
