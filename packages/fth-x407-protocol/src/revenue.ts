/**
 * x407 Revenue Router
 *
 * Every metered session generates revenue events.  The RevenueRouter
 * splits each payment according to the active FeeSchedule:
 *
 *   facilitator_fee  → facilitator wallet
 *   protocol_fee     → x407 treasury
 *   buyback_burn     → AMM buy → burn address
 *   lp_provision     → LP pool deposit
 *   remainder        → treasury reserve
 *
 * Uses basis‑point math (1 bps = 0.01%) to avoid floating point.
 */

import { randomBytes } from "crypto";
import type {
  FeeSchedule,
  RevenueCategory,
  RevenueDestination,
  RevenueEvent,
  RevenueSnapshot,
} from "./types";

const BPS_DENOMINATOR = 10000n;

export interface RevenueRouterConfig {
  /** Default fee schedule (can be overridden per namespace) */
  defaultSchedule: FeeSchedule;
  /** Per-namespace overrides */
  namespaceSchedules?: Map<string, FeeSchedule>;
  /** Destination addresses */
  destinations: {
    facilitatorWallet: string;
    treasuryWallet: string;
    burnAddress: string;
    lpPoolId: string;
  };
}

export class RevenueRouter {
  private readonly config: RevenueRouterConfig;
  private readonly events: RevenueEvent[] = [];

  constructor(config: RevenueRouterConfig) {
    this.config = config;
  }

  // ── Fee Resolution ───────────────────────────────────────────────

  getSchedule(namespace: string): FeeSchedule {
    return this.config.namespaceSchedules?.get(namespace) ?? this.config.defaultSchedule;
  }

  // ── Revenue Splitting ────────────────────────────────────────────

  /**
   * Calculate fee breakdown from a gross revenue amount.
   * All values are bigint strings (18 decimals).
   */
  calculateSplit(grossAmount: string, namespace: string): RevenueSplit {
    const gross = BigInt(grossAmount);
    const schedule = this.getSchedule(namespace);

    const facilitatorFee = (gross * BigInt(schedule.facilitatorFeeBps)) / BPS_DENOMINATOR;
    const protocolFee = (gross * BigInt(schedule.protocolFeeBps)) / BPS_DENOMINATOR;
    const buybackBurn = (gross * BigInt(schedule.buybackBurnBps)) / BPS_DENOMINATOR;
    const lpProvision = (gross * BigInt(schedule.lpProvisionBps)) / BPS_DENOMINATOR;
    const treasuryRemainder = gross - facilitatorFee - protocolFee - buybackBurn - lpProvision;

    return {
      gross: gross.toString(),
      facilitatorFee: facilitatorFee.toString(),
      protocolFee: protocolFee.toString(),
      buybackBurn: buybackBurn.toString(),
      lpProvision: lpProvision.toString(),
      treasuryRemainder: treasuryRemainder.toString(),
    };
  }

  // ── Event Recording ──────────────────────────────────────────────

  /**
   * Record a full revenue event from a settled session.
   * Emits one RevenueEvent per split category.
   */
  recordSessionRevenue(params: {
    sessionId: string;
    agentId: string;
    namespace: string;
    grossAmount: string;
    asset: string;
    rail: string;
  }): RevenueEvent[] {
    const split = this.calculateSplit(params.grossAmount, params.namespace);
    const now = new Date().toISOString();
    const created: RevenueEvent[] = [];

    const entries: Array<{
      category: RevenueCategory;
      amount: string;
      destination: RevenueDestination;
    }> = [
      {
        category: "facilitator_fee",
        amount: split.facilitatorFee,
        destination: {
          type: "agent_wallet",
          address: this.config.destinations.facilitatorWallet,
        },
      },
      {
        category: "protocol_fee",
        amount: split.protocolFee,
        destination: {
          type: "treasury",
          address: this.config.destinations.treasuryWallet,
        },
      },
      {
        category: "buyback_burn",
        amount: split.buybackBurn,
        destination: {
          type: "burn_address",
          address: this.config.destinations.burnAddress,
        },
      },
      {
        category: "lp_provision",
        amount: split.lpProvision,
        destination: {
          type: "lp_pool",
          poolId: this.config.destinations.lpPoolId,
        },
      },
      {
        category: "treasury_yield",
        amount: split.treasuryRemainder,
        destination: {
          type: "reserve",
          address: this.config.destinations.treasuryWallet,
        },
      },
    ];

    for (const entry of entries) {
      if (BigInt(entry.amount) === 0n) continue;

      const event: RevenueEvent = {
        eventId: randomBytes(12).toString("hex"),
        sessionId: params.sessionId,
        agentId: params.agentId,
        category: entry.category,
        amount: entry.amount,
        asset: params.asset,
        rail: params.rail,
        destination: entry.destination,
        createdAt: now,
      };

      this.events.push(event);
      created.push(event);
    }

    return created;
  }

  // ── Aggregation ──────────────────────────────────────────────────

  /**
   * Snapshot of revenue over a time range.
   */
  snapshot(periodStart: string, periodEnd: string): RevenueSnapshot {
    const startMs = new Date(periodStart).getTime();
    const endMs = new Date(periodEnd).getTime();

    const filtered = this.events.filter((e) => {
      const ts = new Date(e.createdAt).getTime();
      return ts >= startMs && ts <= endMs;
    });

    const byCategory: Record<RevenueCategory, bigint> = {
      facilitator_fee: 0n,
      protocol_fee: 0n,
      metering_fee: 0n,
      treasury_yield: 0n,
      buyback_burn: 0n,
      lp_provision: 0n,
      referral_rebate: 0n,
    };

    let totalRevenue = 0n;
    let totalBurned = 0n;
    let totalToLp = 0n;
    let totalToTreasury = 0n;
    const uniqueAgents = new Set<string>();

    for (const ev of filtered) {
      const amt = BigInt(ev.amount);
      totalRevenue += amt;
      byCategory[ev.category] += amt;
      uniqueAgents.add(ev.agentId);

      if (ev.category === "buyback_burn") totalBurned += amt;
      if (ev.category === "lp_provision") totalToLp += amt;
      if (ev.category === "treasury_yield" || ev.category === "protocol_fee") {
        totalToTreasury += amt;
      }
    }

    const byCategoryStr = {} as Record<RevenueCategory, string>;
    for (const [k, v] of Object.entries(byCategory)) {
      byCategoryStr[k as RevenueCategory] = v.toString();
    }

    return {
      periodStart,
      periodEnd,
      totalRevenue: totalRevenue.toString(),
      byCategory: byCategoryStr,
      totalBurned: totalBurned.toString(),
      totalToLp: totalToLp.toString(),
      totalToTreasury: totalToTreasury.toString(),
      transactionCount: filtered.length,
      uniqueAgents: uniqueAgents.size,
    };
  }

  // ── Queries ──────────────────────────────────────────────────────

  getEventsBySession(sessionId: string): RevenueEvent[] {
    return this.events.filter((e) => e.sessionId === sessionId);
  }

  getEventsByAgent(agentId: string): RevenueEvent[] {
    return this.events.filter((e) => e.agentId === agentId);
  }

  getUnsettled(): RevenueEvent[] {
    return this.events.filter((e) => !e.settledAt);
  }

  markSettled(eventId: string, receiptId: string): boolean {
    const ev = this.events.find((e) => e.eventId === eventId);
    if (!ev) return false;
    ev.settledAt = new Date().toISOString();
    ev.receiptId = receiptId;
    return true;
  }

  get totalEvents(): number {
    return this.events.length;
  }
}

// ─── Supporting Types ────────────────────────────────────────────────
export interface RevenueSplit {
  gross: string;
  facilitatorFee: string;
  protocolFee: string;
  buybackBurn: string;
  lpProvision: string;
  treasuryRemainder: string;
}
