/**
 * Cascade Engine
 *
 * The cascade engine is the synaptic propagation layer — it reads every
 * unpropagated signal off the bus, decides what action it implies, fires
 * downstream effects (appreciation, further signals, treasury ops), and
 * marks the signal consumed.
 *
 * One cascade cycle = one "electrical spike" in the neural mesh.
 */

import pool from "../db";
import { emit, fetchUnpropagated, markPropagated, MeshSignal } from "./bus";
import { applyDemandAppreciation, refreshDemandScores } from "./demand";
import {
  evaluateTreasuryAgent,
  notifyBarterPostTrade,
  onDepositReceived,
  raiseGuardianAlert,
  triggerHeal,
  setAgentStatus,
  recordCascadeOnLedger,
} from "../services/mesh-calls";

// Wired by routes/pulse.ts so cascade can push live transactions over WebSocket
let txBroadcaster: ((data: Record<string, unknown>) => void) | null = null;

export function setTransactionBroadcaster(fn: (data: Record<string, unknown>) => void): void {
  txBroadcaster = fn;
}

const APPRECIATION_ON_TRADE_PCT = 3.0;
const MICRO_APPRECIATION_ON_DEMAND_PCT = 0.5;
const HIGH_DEMAND_THRESHOLD = 5.0;

/** Appreciate both assets involved in a settled barter trade. */
async function cascadeTradeSettled(sig: MeshSignal): Promise<void> {
  const subjectId = sig.subject_id ?? "";
  const payload = sig.payload;
  const { offered_asset_id, requested_asset_id } = payload as {
    offered_asset_id?: string;
    requested_asset_id?: string;
  };

  const ids = [offered_asset_id, requested_asset_id].filter(Boolean) as string[];
  if (!ids.length) return;

  // Also try subjectId (the trade id) → look up from DB
  const fromTrade = await pool.query<{ offered_asset_id: string; requested_asset_id: string }>(
    `SELECT o.offered_asset_id, o.requested_asset_id
     FROM barter_trades bt
     JOIN barter_offers o ON o.id = bt.offer_id
     WHERE bt.id = $1::uuid`,
    [subjectId]
  ).catch(() => ({ rows: [] as any[] }));

  if (fromTrade.rows.length) {
    const r = fromTrade.rows[0];
    if (r.offered_asset_id)   ids.push(r.offered_asset_id);
    if (r.requested_asset_id) ids.push(r.requested_asset_id);
  }

  const uniqueIds = [...new Set(ids)];

  for (const assetId of uniqueIds) {
    const row = await pool.query<{ usdf_valuation: string; name: string }>(
      "SELECT usdf_valuation, name FROM real_assets WHERE id = $1 AND status = 'active'",
      [assetId]
    );
    if (!row.rows.length) continue;

    const oldVal = Number(row.rows[0].usdf_valuation);
    const increase = oldVal * (APPRECIATION_ON_TRADE_PCT / 100);
    const newVal = oldVal + increase;

    await pool.query(
      "UPDATE real_assets SET usdf_valuation = $1, updated_at = now() WHERE id = $2",
      [newVal.toFixed(7), assetId]
    );
    await pool.query(
      `INSERT INTO asset_valuations (asset_id, usdf_value, reason, set_by)
       VALUES ($1, $2, 'post-trade-cascade', 'mesh-pulse')`,
      [assetId, newVal.toFixed(7)]
    );

    await emit("asset_appreciated", "cascade-engine", assetId, {
      old_value: oldVal,
      new_value: newVal,
      reason: "trade_cascade",
      pct: APPRECIATION_ON_TRADE_PCT,
    });

    // Record appreciation on the UNY ledger (fire-and-forget)
    recordCascadeOnLedger({
      assetId,
      oldValue: oldVal,
      newValue: newVal,
      tradeId: sig.payload.trade_id as string ?? subjectId,
      reason: "trade_cascade",
    }).catch(() => {/* non-fatal */});

    // Broadcast to live WebSocket clients so the dashboard sees it immediately
    if (txBroadcaster) {
      txBroadcaster({
        type: "transaction",
        trade_id:    sig.payload.trade_id ?? subjectId,
        offer_id:    sig.payload.offer_id,
        asset_id:    assetId,
        old_value:   oldVal,
        new_value:   newVal,
        appreciation_pct: APPRECIATION_ON_TRADE_PCT,
        offerer:     sig.payload.offerer_wallet,
        counterparty: sig.payload.counterparty_wallet,
        ts:          new Date().toISOString(),
      });
    }
  }

  // Notify barter engine so open offers referencing these assets recalculate their implied value
  if (uniqueIds.length) {
    notifyBarterPostTrade(
      sig.payload.trade_id as string ?? subjectId,
      uniqueIds,
    ).catch(() => {/* non-fatal */});
  }

  // Evaluate both wallets for treasury refill eligibility
  const wallets = [sig.payload.offerer_wallet, sig.payload.counterparty_wallet].filter(Boolean) as string[];
  for (const w of wallets) {
    evaluateTreasuryAgent(w).catch(() => {/* non-fatal */});
  }
}

/** Emit cascade_fired summary signal after a cycle. */
async function emitCascadeFired(batch: number, actionsCount: number): Promise<void> {
  await emit("cascade_fired", "cascade-engine", "mesh", {
    batch,
    actions: actionsCount,
    ts: new Date().toISOString(),
  });
}

/**
 * Run one full cascade cycle.
 * Returns number of signals processed.
 */
export async function runCascade(): Promise<number> {
  const signals = await fetchUnpropagated(50);
  if (!signals.length) return 0;

  let actions = 0;

  for (const sig of signals) {
    try {
      switch (sig.signal_type) {
        case "trade_settled":
          await cascadeTradeSettled(sig);
          actions++;
          break;

        case "value_velocity_spike":
          // Intensified event — apply micro-appreciation on top
          await pool.query(
            `UPDATE real_assets
             SET usdf_valuation = ROUND(usdf_valuation * (1 + ${MICRO_APPRECIATION_ON_DEMAND_PCT} / 100.0), 7),
                 updated_at = now()
             WHERE id = $1::uuid AND status = 'active'`,
            [sig.subject_id]
          );
          actions++;
          break;

        case "deposit_received": {
          const targetWallet = (sig.payload?.target_wallet ?? "") as string;
          const amount = String(sig.payload?.amount ?? "0");

          // Call the treasury service to register the wallet and trigger refill (fire-and-forget)
          onDepositReceived({
            wallet: targetWallet,
            amount,
            asset: sig.payload?.asset as string | undefined,
          }).catch(() => {/* non-fatal */});

          // Also check if wallet has a treasury agent row — activate it via gateway
          const ta = await pool.query(
            "SELECT id FROM treasury_agents WHERE wallet = $1 LIMIT 1",
            [targetWallet]
          ).catch(() => ({ rows: [] as any[] }));
          if (ta.rows.length) {
            await emit("agent_activated", "cascade-engine", ta.rows[0].id, {
              reason: "deposit_received",
              amount,
            });
            setAgentStatus(ta.rows[0].id, "active").catch(() => {/* non-fatal */});
            actions++;
          }
          break;
        }

        case "market_imbalance_detected":
          // High-level signal — refresh demand scores immediately + alert guardian
          await refreshDemandScores();
          await applyDemandAppreciation(HIGH_DEMAND_THRESHOLD, MICRO_APPRECIATION_ON_DEMAND_PCT);
          raiseGuardianAlert({
            service:       (sig.subject_id ?? "unknown"),
            failureStreak: Number(sig.payload?.failure_streak ?? 1),
            reason:        (sig.payload?.reason as string) ?? "market_imbalance_detected",
          }).catch(() => {/* non-fatal */});
          triggerHeal(sig.subject_id ?? "mesh").catch(() => {/* non-fatal */});
          actions++;
          break;

        // Signals that are self-contained (heartbeat, demand_score_updated, etc.)
        // No downstream action needed — just mark propagated.
        default:
          break;
      }
    } catch (err) {
      // Log but don't abort the batch — one bad signal shouldn't stall the mesh
      console.error(`[cascade] error processing signal ${sig.id} (${sig.signal_type}):`, err);
    }
  }

  const ids = signals.map((s) => s.id);
  await markPropagated(ids);

  if (actions > 0) {
    await emitCascadeFired(signals.length, actions);
  }

  return signals.length;
}
