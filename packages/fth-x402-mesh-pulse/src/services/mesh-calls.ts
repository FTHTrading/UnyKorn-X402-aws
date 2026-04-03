/**
 * mesh-calls.ts — Typed HTTP client for cross-service calls from the mesh-pulse.
 *
 * Mesh-pulse is the neural controller: when a signal arrives it must be able
 * to reach out to the real services and trigger actual work — not just write
 * DB rows.  All calls are fire-and-best-effort.  Failures are logged but
 * never throw — one bad outbound call must not stall the cascade loop.
 */

import http from "http";

// Service base URLs — all on localhost because docker network_mode = host
const SVC = {
  treasury:    "http://127.0.0.1:3200",
  facilitator: "http://127.0.0.1:3101",
  barter:      "http://127.0.0.1:3270",
  assetReg:    "http://127.0.0.1:3260",
  bridge:      "http://127.0.0.1:3250",
  guardian:    "http://127.0.0.1:3300",
  gateway:     "http://127.0.0.1:4010",
  ledger:      "http://127.0.0.1:4030",
} as const;

// Internal service-to-service auth token (set via SERVICE_SECRET in .env.x402)
const SERVICE_TOKEN = process.env.SERVICE_SECRET ?? process.env.ADMIN_API_TOKEN ?? "";

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(SERVICE_TOKEN ? { "x-service-token": SERVICE_TOKEN } : {}),
  };
}

/** Generic JSON POST with timeout. Returns parsed body or null on error. */
function post<T = unknown>(url: string, body: unknown, timeoutMs = 4000): Promise<T | null> {
  return new Promise((resolve) => {
    const raw = JSON.stringify(body);
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: Number(u.port),
        path: u.pathname + (u.search ?? ""),
        method: "POST",
        headers: { ...headers(), "Content-Length": Buffer.byteLength(raw) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()) as T);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.write(raw);
    req.end();
  });
}

/** Generic JSON GET with timeout. Returns parsed body or null on error. */
function get<T = unknown>(url: string, timeoutMs = 4000): Promise<T | null> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: Number(u.port),
        path: u.pathname + (u.search ?? ""),
        method: "GET",
        headers: headers(),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()) as T);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Treasury
// ---------------------------------------------------------------------------

/** Evaluate whether a treasury agent needs a refill after a trade. */
export async function evaluateTreasuryAgent(walletAddress: string): Promise<void> {
  await post(`${SVC.treasury}/treasury/policy/evaluate`, { wallet_address: walletAddress });
}

/**
 * Register a wallet as a treasury-managed agent if it does not already exist,
 * then trigger a recommended refill when a deposit arrives.
 */
export async function onDepositReceived(opts: {
  wallet: string;
  amount: string;
  asset?: string;
}): Promise<void> {
  // Register (idempotent — 409 is fine)
  await post(`${SVC.treasury}/treasury/agents/register`, {
    wallet_address: opts.wallet,
    namespace:      "mesh",
    asset:          opts.asset ?? "UNY",
    target_balance: "1000000000",  // 1 UNY in minimal units
    min_balance:    "100000000",
    max_single_refill: "500000000",
    max_daily_refill:  "2000000000",
    metadata: { registered_by: "mesh-pulse", trigger: "deposit_received" },
  });

  // Look up the agent id then trigger refill
  const agent = await get<{ agent_id?: string }>(
    `${SVC.treasury}/treasury/agents?wallet_address=${encodeURIComponent(opts.wallet)}&limit=1`,
  );
  const agentId = (agent as any)?.agents?.[0]?.agent_id;
  if (agentId) {
    await post(`${SVC.treasury}/treasury/agents/${agentId}/refill`, {
      reference: `deposit_${Date.now()}`,
      metadata: { amount: opts.amount, source: "cascade" },
    });
  }
}

// ---------------------------------------------------------------------------
// Barter
// ---------------------------------------------------------------------------

/**
 * After a trade is settled and its assets appreciated, notify barter so it can
 * update any open offers that reference the same assets.
 */
export async function notifyBarterPostTrade(tradeId: string, assetIds: string[]): Promise<void> {
  // The barter engine has an internal expiry loop; we just push a market
  // event so it can recalculate implied values for open offers.
  await post(`${SVC.barter}/barter/market/sync`, {
    trade_id:  tradeId,
    asset_ids: assetIds,
    reason:    "cascade_appreciation",
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Guardian
// ---------------------------------------------------------------------------

/**
 * Raise a MEDIUM severity alert with the Guardian when the heartbeat detects
 * a market imbalance (i.e. consecutive service failures).
 */
export async function raiseGuardianAlert(opts: {
  service: string;
  failureStreak: number;
  reason: string;
}): Promise<void> {
  // Guardian exposes POST /api/alerts (created by AlertManager)
  await post(`${SVC.guardian}/api/alerts`, {
    severity:    opts.failureStreak >= 4 ? "high" : "medium",
    source:      "mesh-pulse",
    event_type:  "market_imbalance_detected",
    title:       `Service ${opts.service} unhealthy`,
    description: `Failure streak: ${opts.failureStreak}. Reason: ${opts.reason}`,
    metadata: { service: opts.service, failure_streak: opts.failureStreak },
  });
}

/** Tell the guardian's Healer daemon to check and potentially restart a failing service. */
export async function triggerHeal(service: string): Promise<void> {
  await post(`${SVC.guardian}/api/commands/emit`, {
    event:  "daemon.ping",
    source: "mesh-pulse",
    data:   { target: service, action: "health_check", requested_by: "cascade" },
  });
}

// ---------------------------------------------------------------------------
// Agent Gateway
// ---------------------------------------------------------------------------

/** Update an agent's status in the gateway DB (e.g. activate after a deposit). */
export async function setAgentStatus(agentId: string, status: "active" | "paused"): Promise<void> {
  await post(`${SVC.gateway}/agents/${agentId}/status`, { status });
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/**
 * Record a cascade appreciation event on the UNY ledger so it is verifiable
 * on-chain.  The ledger accepts an opaque metadata blob for memo-recording.
 */
export async function recordCascadeOnLedger(opts: {
  assetId:    string;
  oldValue:   number;
  newValue:   number;
  tradeId:    string;
  reason:     string;
}): Promise<void> {
  await post(`${SVC.ledger}/ledger/memo`, {
    type:    "asset_appreciation",
    subject: opts.assetId,
    data: {
      trade_id:  opts.tradeId,
      old_value: opts.oldValue,
      new_value: opts.newValue,
      reason:    opts.reason,
    },
    timestamp: new Date().toISOString(),
  });
}
