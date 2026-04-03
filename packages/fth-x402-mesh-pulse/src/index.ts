/**
 * fth-x402-mesh-pulse — index.ts
 *
 * The living neural controller. Boots Fastify with WebSocket support,
 * then starts all background pulse loops:
 *
 *   • Cascade loop (3s)    — consume signals, fire appreciations
 *   • Demand loop (60s)    — score assets, emit velocity spikes
 *   • Heartbeat loop (30s) — ping all services, detect failures
 *
 * Every cycle feeds the state machine — the mesh moves: IDLE → SCANNING →
 * PROCESSING → CASCADING → RESTING → IDLE — like a heartbeat you can watch.
 */

import Fastify from "fastify";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fastifyWebsocket = require("@fastify/websocket") as any;
import pulseRoutes, { broadcastSignal } from "./routes/pulse";
import { runCascade } from "./signals/cascade";
import { refreshDemandScores, applyDemandAppreciation } from "./signals/demand";
import { pingAllServices } from "./signals/heartbeat";
import { advanceState } from "./pulse/state-machine";
import { emit, signalStats } from "./signals/bus";

const PORT  = Number(process.env.PULSE_PORT  || 3280);
const HOST  = process.env.HOST || "0.0.0.0";

const DEMAND_THRESHOLD = Number(process.env.DEMAND_THRESHOLD || "5.0");
const DEMAND_MICRO_PCT = Number(process.env.DEMAND_MICRO_PCT || "0.5");

let serviceFailureCount = 0;
let cascadeDepth        = 0;
let isBooted            = false;

const logger = {
  info: (msg: string) => console.log(`[mesh-pulse] ${msg}`),
  warn: (msg: string) => console.warn(`[mesh-pulse] WARN: ${msg}`),
};

// ─── Boot Fastify ────────────────────────────────────────────────────────────
const fastify = Fastify({ logger: false, disableRequestLogging: true });

(async () => {
  await fastify.register(fastifyWebsocket);
  await fastify.register(pulseRoutes);
  await fastify.listen({ port: PORT, host: HOST });
  logger.info(`listening on ${HOST}:${PORT}`);

  isBooted = true;
  await emit("heartbeat", "mesh-pulse-boot", "self", { event: "boot", port: PORT });

  // ── Cascade loop: 3 seconds ───────────────────────────────────────────────
  setInterval(async () => {
    const state = advanceState({
      pendingSignals: Number((await signalStats()).pending_propagation ?? 0),
      signalsProcessed: 0,
      cascadeDepth,
      serviceFailures: serviceFailureCount,
      isBooted,
    });

    const processed = await runCascade().catch((err) => {
      logger.warn(`cascade error: ${err.message}`);
      return 0;
    });

    cascadeDepth = processed > 0 ? cascadeDepth + 1 : 0;

    const nextState = advanceState({
      pendingSignals: Number((await signalStats().catch(() => ({ pending_propagation: 0 }))).pending_propagation ?? 0),
      signalsProcessed: processed,
      cascadeDepth,
      serviceFailures: serviceFailureCount,
      isBooted,
    });

    if (processed > 0) {
      // Broadcast to any live WS clients
      broadcastSignal({
        event: "cascade_tick",
        state: nextState,
        processed,
        ts: new Date().toISOString(),
      });
    }
  }, 3_000);

  // ── Demand loop: 60 seconds ───────────────────────────────────────────────
  setInterval(async () => {
    try {
      await refreshDemandScores();
      const appreciated = await applyDemandAppreciation(DEMAND_THRESHOLD, DEMAND_MICRO_PCT);

      for (const item of appreciated) {
        await emit("value_velocity_spike", "demand-engine", item.asset_id, item);
        broadcastSignal({ event: "value_velocity_spike", data: item });
      }

      if (appreciated.length) {
        await emit("demand_score_updated", "demand-engine", "mesh", {
          count: appreciated.length,
          ts: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      logger.warn(`demand loop error: ${err.message}`);
    }
  }, 60_000);

  // ── Heartbeat loop: 30 seconds ────────────────────────────────────────────
  setInterval(async () => {
    try {
      await pingAllServices(logger);
      // Reset failure count after a successful full ping cycle
      serviceFailureCount = 0;
    } catch (err: any) {
      serviceFailureCount++;
      logger.warn(`heartbeat error: ${err.message}`);
    }
  }, 30_000);

  logger.info("all pulse loops active — the mesh is alive");
})().catch((err) => {
  console.error("[mesh-pulse] fatal boot error:", err);
  process.exit(1);
});
