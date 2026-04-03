/**
 * Mesh Signal Bus
 *
 * This is the synapse layer. Every event that happens in the UnyKorn mesh
 * is emitted as a signal. The pulse controller reads unpropagated signals
 * and fires cascades — value appreciation, demand scoring, treasury refills.
 *
 * Think of it as: signals = electrical impulses. Propagation = firing.
 */

import pool from "../db";

export type SignalType =
  | "trade_settled"
  | "asset_appreciated"
  | "deposit_received"
  | "offer_created"
  | "offer_expired"
  | "offer_cancelled"
  | "treasury_refill"
  | "heartbeat"
  | "agent_activated"
  | "cascade_fired"
  | "demand_score_updated"
  | "value_velocity_spike"
  | "market_imbalance_detected";

export interface MeshSignal {
  id: string;
  signal_type: SignalType;
  source: string;
  subject_id: string | null;
  payload: Record<string, unknown>;
  propagated: boolean;
  fired_at: string;
}

/** Emit a signal into the mesh. Returns signal id. */
export async function emit(
  type: SignalType,
  source: string,
  subjectId: string | null,
  payload: Record<string, unknown> = {}
): Promise<string> {
  const row = await pool.query<{ id: string }>(
    `INSERT INTO mesh_signals (signal_type, source, subject_id, payload)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [type, source, subjectId, JSON.stringify(payload)]
  );
  return row.rows[0].id;
}

/** Fetch all unpropagated signals, ordered by fire time. */
export async function fetchUnpropagated(limit = 100): Promise<MeshSignal[]> {
  const rows = await pool.query<MeshSignal>(
    `SELECT * FROM mesh_signals
     WHERE propagated = false
     ORDER BY fired_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );
  return rows.rows;
}

/** Mark signals as propagated (consumed by the pulse controller). */
export async function markPropagated(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await pool.query(
    `UPDATE mesh_signals SET propagated = true WHERE id = ANY($1::uuid[])`,
    [ids]
  );
}

/** Recent signals for API reads (no lock). */
export async function recentSignals(limit = 50, type?: SignalType): Promise<MeshSignal[]> {
  const params: unknown[] = [limit];
  const whereClause = type ? `WHERE signal_type = $2` : "";
  if (type) params.push(type);
  const rows = await pool.query<MeshSignal>(
    `SELECT * FROM mesh_signals ${whereClause} ORDER BY fired_at DESC LIMIT $1`,
    params
  );
  return rows.rows;
}

/** Signal volume stats. */
export async function signalStats(): Promise<Record<string, unknown>> {
  const counts = await pool.query(`
    SELECT signal_type, COUNT(*) AS count
    FROM mesh_signals
    WHERE fired_at > now() - INTERVAL '1 hour'
    GROUP BY signal_type ORDER BY count DESC
  `);
  const total = await pool.query(`SELECT COUNT(*) AS total FROM mesh_signals`);
  const unprop = await pool.query(`SELECT COUNT(*) AS pending FROM mesh_signals WHERE propagated = false`);
  return {
    last_hour: counts.rows,
    total_signals: Number(total.rows[0].total),
    pending_propagation: Number(unprop.rows[0].pending),
  };
}
