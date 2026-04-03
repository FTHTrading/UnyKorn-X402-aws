/**
 * Service Heartbeat Monitor
 *
 * Pings every x402 service on its known internal port every 30 seconds.
 * Emits a 'heartbeat' signal for each healthy response.
 * Emits 'market_imbalance_detected' if 2+ consecutive failures per service.
 */

import http from "http";
import { emit } from "./bus";

interface ServiceDef {
  name: string;
  port: number;
  path: string;
}

const SERVICES: ServiceDef[] = [
  { name: "facilitator",    port: 3101,  path: "/health" },
  { name: "treasury",       port: 3200,  path: "/health" },
  { name: "stellar-bridge", port: 3250,  path: "/health" },
  { name: "asset-registry", port: 3260,  path: "/health" },
  { name: "barter",         port: 3270,  path: "/health" },
  { name: "guardian",       port: 3300,  path: "/health" },
];

// Track consecutive failure counts per service
const failureCounts: Record<string, number> = {};

function httpGet(port: number, path: string, timeoutMs = 3000): Promise<{ ok: boolean; latency: number; statusCode?: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.get({ hostname: "127.0.0.1", port, path }, (res) => {
      res.resume(); // consume body
      resolve({ ok: res.statusCode === 200, latency: Date.now() - start, statusCode: res.statusCode });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, latency: timeoutMs });
    });
    req.on("error", () => resolve({ ok: false, latency: Date.now() - start }));
  });
}

export async function pingAllServices(logger: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  for (const svc of SERVICES) {
    const { ok, latency, statusCode } = await httpGet(svc.port, svc.path);

    if (!failureCounts[svc.name]) failureCounts[svc.name] = 0;

    if (ok) {
      failureCounts[svc.name] = 0;
      await emit("heartbeat", "heartbeat-monitor", svc.name, {
        service: svc.name,
        port: svc.port,
        latency_ms: latency,
        ok: true,
        status_code: statusCode,
      });
      logger.info(`[heartbeat] ${svc.name} OK (${latency}ms)`);
    } else {
      failureCounts[svc.name]++;
      logger.warn(`[heartbeat] ${svc.name} FAIL (streak: ${failureCounts[svc.name]})`);

      await emit("heartbeat", "heartbeat-monitor", svc.name, {
        service: svc.name,
        port: svc.port,
        latency_ms: latency,
        ok: false,
        failure_streak: failureCounts[svc.name],
      });

      if (failureCounts[svc.name] >= 2) {
        await emit("market_imbalance_detected", "heartbeat-monitor", svc.name, {
          service: svc.name,
          failure_streak: failureCounts[svc.name],
          reason: "consecutive_health_check_failures",
        });
      }
    }
  }
}
