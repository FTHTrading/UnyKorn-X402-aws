/**
 * UnyKorn API Proxy — Cloudflare Worker
 *
 * Receives periodic state syncs from local services and serves
 * cached data to the public explorer at ex.unykorn.org.
 *
 * Architecture:
 *   Local Ledger → POST /sync (every 15s) → KV Store
 *   Explorer → GET/POST → Worker → reads KV → returns data
 */

interface Env {
  STATE: KVNamespace;
  SYNC_SECRET: string;
  ALLOWED_ORIGINS: string;
}

// ── CORS ────────────────────────────────────────────────────

function corsHeaders(origin: string, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim());
  const ao = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": ao,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Sync-Secret",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data: unknown, status: number, origin: string, env: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
  });
}

// ── Sync Handler ────────────────────────────────────────────

async function handleSync(request: Request, env: Env, origin: string): Promise<Response> {
  const secret = request.headers.get("X-Sync-Secret");
  if (!secret || secret !== env.SYNC_SECRET) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin, env);
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const keys = Object.keys(body);

    // Store each key separately for granular reads
    for (const key of keys) {
      await env.STATE.put(key, JSON.stringify(body[key]), { expirationTtl: 86400 }); // 24h TTL
    }
    await env.STATE.put("_lastSync", new Date().toISOString(), { expirationTtl: 86400 });

    return jsonResponse({ ok: true, keys: keys.length, timestamp: new Date().toISOString() }, 200, origin, env);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 400, origin, env);
  }
}

// ── JSON-RPC Handler ────────────────────────────────────────

async function handleRpc(request: Request, env: Env, origin: string): Promise<Response> {
  let body: { jsonrpc?: string; id?: number; method?: string; params?: unknown[] };
  try {
    body = await request.json() as any;
  } catch {
    return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400, origin, env);
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return jsonResponse({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "Invalid request" } }, 400, origin, env);
  }

  // Map RPC methods to KV keys
  const methodKeyMap: Record<string, string> = {
    chain_status: "rpc:chain_status",
    chain_getBlocks: "rpc:chain_getBlocks",
    chain_getBlockDetail: "rpc:chain_getBlockDetail",
    chain_getNodes: "rpc:chain_getNodes",
    chain_getInfrastructure: "rpc:chain_getInfrastructure",
    chain_getEconomicState: "rpc:chain_getEconomicState",
    chain_verifyIntegrity: "rpc:chain_verifyIntegrity",
    chain_getSystemState: "rpc:chain_getSystemState",
    chain_getRecentTasks: "rpc:chain_getRecentTasks",
    chain_getRecentPolicies: "rpc:chain_getRecentPolicies",
    chain_getRecentSettlements: "rpc:chain_getRecentSettlements",
    chain_getLatestBlock: "rpc:chain_getLatestBlock",
  };

  const kvKey = methodKeyMap[body.method];
  if (!kvKey) {
    return jsonResponse({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: `Method not found: ${body.method}` } }, 200, origin, env);
  }

  const cached = await env.STATE.get(kvKey);
  if (!cached) {
    return jsonResponse({
      jsonrpc: "2.0", id: body.id ?? null,
      error: { code: -32603, message: "Data not yet synced — chain node offline or sync pending" }
    }, 200, origin, env);
  }

  try {
    const result = JSON.parse(cached);
    return jsonResponse({ jsonrpc: "2.0", id: body.id ?? null, result }, 200, origin, env);
  } catch {
    return jsonResponse({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32603, message: "Cached data corrupted" } }, 200, origin, env);
  }
}

// ── REST Handler ────────────────────────────────────────────

async function handleRest(path: string, env: Env, origin: string): Promise<Response> {
  const restKeyMap: Record<string, string> = {
    "/health": "rest:health",
    "/status": "rest:status",
    "/ledger": "rest:ledger",
    "/treasury": "rest:treasury",
    // Facilitator
    "/explorer/stats": "rest:facilitator:stats",
    "/explorer/invoices": "rest:facilitator:invoices",
    "/explorer/receipts": "rest:facilitator:receipts",
    "/explorer/roots": "rest:facilitator:roots",
    "/explorer/namespaces": "rest:facilitator:namespaces",
    "/explorer/revenue": "rest:facilitator:revenue",
    "/economics/overview": "rest:facilitator:economics",
    "/economics/credibility": "rest:facilitator:credibility",
    // Listing / CoinGecko / CMC
    "/listing/v1/overview": "rest:facilitator:listing:overview",
    "/listing/v1/readiness": "rest:facilitator:listing:readiness",
    "/listing/v1/pairs": "rest:facilitator:listing:pairs",
    "/listing/v1/tickers": "rest:facilitator:listing:tickers",
    "/listing/v1/summary": "rest:facilitator:listing:summary",
    "/listing/v1/assets": "rest:facilitator:listing:assets",
    "/listing/v1/asset-info": "rest:facilitator:listing:asset-info",
    "/listing/v1/contracts": "rest:facilitator:listing:contracts",
    "/listing/v1/proof-of-reserves": "rest:facilitator:listing:por",
    // Gateway
    "/agents": "rest:gateway:agents",
    "/agents/active": "rest:gateway:agents",
    "/organizations": "rest:gateway:organizations",
    // Signer
    "/keys": "rest:signer:keys",
    "/audit": "rest:signer:audit",
    // Service-specific health endpoints
    "/facilitator/health": "rest:facilitator:health",
    "/gateway/health": "rest:gateway:health",
    "/signer/health": "rest:signer:health",
  };

  // Strip query params for matching
  const cleanPath = path.split("?")[0];
  const kvKey = restKeyMap[cleanPath];

  if (!kvKey) {
    return jsonResponse({ error: "Not found", path: cleanPath }, 404, origin, env);
  }

  const cached = await env.STATE.get(kvKey);
  if (!cached) {
    return jsonResponse({ error: "Data not synced yet" }, 503, origin, env);
  }

  try {
    return jsonResponse(JSON.parse(cached), 200, origin, env);
  } catch {
    return jsonResponse({ error: "Cached data corrupted" }, 500, origin, env);
  }
}

// ── Main Handler ────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    // Sync endpoint — receives state push from local services
    if (url.pathname === "/sync" && request.method === "POST") {
      return handleSync(request, env, origin);
    }

    // JSON-RPC endpoint
    if (url.pathname === "/rpc" && request.method === "POST") {
      return handleRpc(request, env, origin);
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/ping") {
      const lastSync = await env.STATE.get("_lastSync");
      return jsonResponse({
        service: "unykorn-api-proxy",
        status: lastSync ? "synced" : "waiting",
        lastSync,
        timestamp: new Date().toISOString(),
      }, 200, origin, env);
    }

    // REST endpoints
    return handleRest(url.pathname, env, origin);
  },
};
