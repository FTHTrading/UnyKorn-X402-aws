/**
 * Asset Demand Scoring
 *
 * Like a neuron's firing rate — assets that are traded more often, referenced
 * in more offers, and have higher value velocity get a higher demand score.
 * The pulse controller uses this score to decide how aggressively to appreciate
 * an asset's value after each activity event.
 *
 * Scoring formula (weighted):
 *   demand_score = (trade_count * 3.0) + (offer_count * 1.0) + (value_velocity * 2.0)
 *
 * Value velocity = rate of change in usdf_valuation over the last 24 hours.
 */

import pool from "../db";

export interface ActivityScore {
  asset_id: string;
  trade_count: number;
  offer_count: number;
  demand_score: number;
  last_signal_at: string | null;
}

/** Recompute demand scores for ALL active assets and upsert into asset_activity. */
export async function refreshDemandScores(): Promise<number> {
  const result = await pool.query(`
    WITH trade_counts AS (
      SELECT o.offered_asset_id AS asset_id, COUNT(*) AS trades
      FROM barter_trades t
      JOIN barter_offers o ON o.id = t.offer_id
      WHERE t.status = 'settled'
        AND t.settled_at > now() - INTERVAL '30 days'
      GROUP BY o.offered_asset_id
    ),
    offer_counts AS (
      SELECT offered_asset_id AS asset_id, COUNT(*) AS offers
      FROM barter_offers
      WHERE created_at > now() - INTERVAL '7 days'
      GROUP BY offered_asset_id
    ),
    demand_counts AS (
      SELECT requested_asset_id AS asset_id, COUNT(*) AS demands
      FROM barter_offers
      WHERE status = 'open' AND requested_asset_id IS NOT NULL
      GROUP BY requested_asset_id
    ),
    value_velocity AS (
      -- slope of valuation changes over last 24h
      SELECT av1.asset_id,
             COALESCE(MAX(av1.usdf_value) - MIN(av1.usdf_value), 0) AS velocity
      FROM asset_valuations av1
      WHERE av1.created_at > now() - INTERVAL '24 hours'
      GROUP BY av1.asset_id
    ),
    last_signals AS (
      SELECT subject_id AS asset_id, MAX(fired_at) AS last_sig
      FROM mesh_signals
      WHERE signal_type IN ('trade_settled', 'asset_appreciated', 'offer_created')
      GROUP BY subject_id
    )
    INSERT INTO asset_activity (asset_id, trade_count, offer_count, demand_score, last_signal_at, updated_at)
    SELECT
      r.id AS asset_id,
      COALESCE(tc.trades, 0)::integer AS trade_count,
      COALESCE(oc.offers, 0)::integer AS offer_count,
      ROUND(
        (COALESCE(tc.trades, 0) * 3.0)
        + (COALESCE(oc.offers, 0) * 1.0)
        + (COALESCE(dc.demands, 0) * 2.0)
        + (COALESCE(vv.velocity, 0) * 0.5),
      4) AS demand_score,
      ls.last_sig AS last_signal_at,
      now() AS updated_at
    FROM real_assets r
    LEFT JOIN trade_counts tc ON tc.asset_id = r.id
    LEFT JOIN offer_counts oc ON oc.asset_id = r.id
    LEFT JOIN demand_counts dc ON dc.asset_id = r.id
    LEFT JOIN value_velocity vv ON vv.asset_id = r.id
    LEFT JOIN last_signals ls ON ls.asset_id::text = r.id::text
    WHERE r.status IN ('active', 'pending')
    ON CONFLICT (asset_id) DO UPDATE SET
      trade_count    = EXCLUDED.trade_count,
      offer_count    = EXCLUDED.offer_count,
      demand_score   = EXCLUDED.demand_score,
      last_signal_at = EXCLUDED.last_signal_at,
      updated_at     = now()
  `);

  return result.rowCount ?? 0;
}

/** Get top-N assets by demand score. */
export async function topAssetsByDemand(n = 10): Promise<ActivityScore[]> {
  const rows = await pool.query<ActivityScore>(
    `SELECT aa.*, r.name, r.category, r.usdf_valuation
     FROM asset_activity aa
     JOIN real_assets r ON r.id = aa.asset_id
     ORDER BY demand_score DESC LIMIT $1`,
    [n]
  );
  return rows.rows;
}

/**
 * Demand-driven appreciation:
 * Assets above threshold get bonus appreciation based on their demand score.
 * Returns list of {asset_id, old_value, new_value, score}.
 */
export async function applyDemandAppreciation(
  minDemandScore: number,
  basePct: number
): Promise<Array<{ asset_id: string; old_value: number; new_value: number; score: number }>> {
  // Fetch high-demand assets
  const candidates = await pool.query<{
    asset_id: string; demand_score: string; usdf_valuation: string; name: string;
  }>(
    `SELECT aa.asset_id, aa.demand_score, r.usdf_valuation, r.name
     FROM asset_activity aa
     JOIN real_assets r ON r.id = aa.asset_id
     WHERE aa.demand_score >= $1
       AND r.status = 'active'
       AND (aa.last_signal_at IS NULL OR aa.last_signal_at < now() - INTERVAL '5 minutes')
     ORDER BY aa.demand_score DESC`,
    [minDemandScore]
  );

  if (!candidates.rows.length) return [];

  const results: Array<{ asset_id: string; old_value: number; new_value: number; score: number }> = [];
  const client = await (await import("../db")).default.connect();

  try {
    await client.query("BEGIN");

    for (const asset of candidates.rows) {
      const score        = Number(asset.demand_score);
      const oldVal       = Number(asset.usdf_valuation);
      // Scale appreciation: higher demand score = more appreciation (capped at 10%)
      const scaledPct    = Math.min(basePct * (1 + score / 20), 10.0);
      const increase     = oldVal * (scaledPct / 100);
      const newVal       = oldVal + increase;

      await client.query(
        "UPDATE real_assets SET usdf_valuation = $1, updated_at = now() WHERE id = $2",
        [newVal.toFixed(7), asset.asset_id]
      );
      await client.query(
        `INSERT INTO asset_valuations (asset_id, usdf_value, reason, set_by)
         VALUES ($1, $2, $3, 'demand-engine')`,
        [asset.asset_id, newVal.toFixed(7), `demand_score=${score.toFixed(2)}_pct=${scaledPct.toFixed(2)}`]
      );
      await client.query(
        "UPDATE asset_activity SET last_signal_at = now() WHERE asset_id = $1",
        [asset.asset_id]
      );

      results.push({ asset_id: asset.asset_id, old_value: oldVal, new_value: newVal, score });
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return results;
}
