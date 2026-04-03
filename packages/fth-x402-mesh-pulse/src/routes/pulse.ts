/**
 * Pulse Routes — REST + WebSocket
 *
 * The WebSocket endpoint /pulse/stream is the "live wire" — every state
 * transition, every signal that flows through the mesh, is broadcast in
 * real-time so a dashboard can visualize the electricity.
 */

import { FastifyPluginAsync, FastifyRequest } from "fastify";
import type WS from "ws";
import { currentState, stateHistory, setBroadcaster, StateEvent } from "../pulse/state-machine";
import { recentSignals, signalStats, SignalType } from "../signals/bus";
import { topAssetsByDemand } from "../signals/demand";
import { setTransactionBroadcaster } from "../signals/cascade";
import pool from "../db";

// In-memory set of live WebSocket connections
const liveClients = new Set<WS>();

// Called by state-machine when a transition fires
function broadcastStateEvent(event: StateEvent): void {
  const msg = JSON.stringify({ type: "state_transition", data: event });
  for (const ws of liveClients) {
    try { ws.send(msg); } catch { liveClients.delete(ws); }
  }
}

/** Broadcast any signal to all live WebSocket clients. */
export function broadcastSignal(payload: Record<string, unknown>): void {
  const msg = JSON.stringify({ type: "signal", data: payload });
  for (const ws of liveClients) {
    try { ws.send(msg); } catch { liveClients.delete(ws); }
  }
}

let meshUptime = Date.now();

const pulseRoutes: FastifyPluginAsync = async (fastify) => {
  // Wire up state-machine broadcaster
  setBroadcaster(broadcastStateEvent);
  // Wire up cascade → transaction broadcaster so live trades flow over WebSocket
  setTransactionBroadcaster((data) => {
    const msg = JSON.stringify({ type: "transaction", data });
    for (const ws of liveClients) {
      try { ws.send(msg); } catch { liveClients.delete(ws); }
    }
  });

  // ─── WebSocket /pulse/stream ─────────────────────────────────────────────
  (fastify as any).get("/pulse/stream", { websocket: true }, (socket: WS, _req: FastifyRequest) => {
    liveClients.add(socket);

    // Greet with current state snapshot
    socket.send(JSON.stringify({
      type: "welcome",
      data: {
        state: currentState(),
        ts: new Date().toISOString(),
        clients: liveClients.size,
      },
    }));

    socket.on("close", () => liveClients.delete(socket));
    socket.on("error", () => liveClients.delete(socket));
  });

  // ─── REST endpoints ──────────────────────────────────────────────────────
  fastify.get("/pulse/status", async () => {
    const stats = await signalStats();
    return {
      ok: true,
      state: currentState(),
      uptime_seconds: Math.floor((Date.now() - meshUptime) / 1000),
      live_ws_clients: liveClients.size,
      signal_stats: stats,
      state_history: stateHistory().slice(-10),
    };
  });

  fastify.get<{ Querystring: { type?: string; limit?: string } }>(
    "/pulse/signals",
    async (req) => {
      const limit = Math.min(Number(req.query.limit) || 50, 500);
      const type = req.query.type as SignalType | undefined;
      const rows = await recentSignals(limit, type);
      return { ok: true, count: rows.length, signals: rows };
    }
  );

  fastify.get("/pulse/network", async () => {
    const topAssets = await topAssetsByDemand(20);
    const stats = await signalStats();
    const history = stateHistory();

    return {
      ok: true,
      mesh: {
        state: currentState(),
        live_clients: liveClients.size,
        nodes: [
          { name: "facilitator",    port: 3101 },
          { name: "treasury",       port: 3200 },
          { name: "stellar-bridge", port: 3250 },
          { name: "asset-registry", port: 3260 },
          { name: "barter",         port: 3270 },
          { name: "mesh-pulse",     port: 3280 },
        ],
        activity_scores: topAssets,
        signal_stats: stats,
        recent_transitions: history.slice(-5),
      },
    };
  });

  // ─── Live transaction log ──────────────────────────────────────────────────
  fastify.get<{ Querystring: { limit?: string } }>("/pulse/transactions", async (req) => {
    const limit = Math.min(Number(req.query.limit) || 20, 200);
    const rows = await pool.query(
      `SELECT
         bt.id          AS trade_id,
         bt.offer_id,
         bt.counterparty_wallet,
         bt.settlement_usdf,
         bt.asset_a_old_value,
         bt.asset_a_new_value,
         bt.asset_b_new_value,
         bt.appreciation_pct,
         bt.status,
         bt.settled_at,
         o.offerer_wallet,
         o.offered_asset_id,
         o.requested_asset_id,
         ra.name        AS offered_asset_name,
         ra.category    AS offered_asset_category,
         ms.id          AS signal_id,
         ms.fired_at    AS signal_fired_at,
         ms.propagated  AS signal_propagated
       FROM barter_trades bt
       JOIN barter_offers o  ON o.id  = bt.offer_id
       JOIN real_assets   ra ON ra.id = o.offered_asset_id
       LEFT JOIN mesh_signals ms
              ON ms.subject_id  = bt.id::text
             AND ms.signal_type = 'trade_settled'
       ORDER BY bt.settled_at DESC
       LIMIT $1`,
      [limit]
    );
    return {
      ok:    true,
      count: rows.rows.length,
      transactions: rows.rows,
    };
  });

  fastify.get("/health", async () => ({
    ok: true,
    service: "fth-x402-mesh-pulse",
    state: currentState(),
    live_clients: liveClients.size,
    ts: new Date().toISOString(),
  }));
};

export default pulseRoutes;
export { meshUptime };
