/**
 * @unykorn/a2a-router — Agent-to-Agent Discovery & Message Routing
 *
 * Previously contained hardcoded stub data.  Now proxies discovery requests
 * to the real agent-gateway (port 4010) and routes messages between live
 * agents registered in the PostgreSQL DB.
 *
 * Ports:
 *   - This router: 4011
 *   - Agent gateway: 4010  (all agent CRUD lives there)
 */

import Fastify from "fastify";
import http from "http";

const PORT = 4011;
const SERVICE = "@unykorn/a2a-router";
const GATEWAY_BASE = process.env.GATEWAY_URL ?? "http://127.0.0.1:4010";

const server = Fastify({ logger: true });

// ---------------------------------------------------------------------------
// Internal HTTP helper — proxy to agent-gateway
// ---------------------------------------------------------------------------

function proxyRequest(opts: {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  timeoutMs?: number;
}): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    const u = new URL(GATEWAY_BASE + opts.path);
    const raw = opts.body ? JSON.stringify(opts.body) : undefined;

    const req = http.request(
      {
        hostname: u.hostname,
        port: Number(u.port ?? 80),
        path: u.pathname + (u.search ?? ""),
        method: opts.method,
        headers: {
          "Content-Type": "application/json",
          ...(raw ? { "Content-Length": Buffer.byteLength(raw) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 200, body: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch {
            resolve({ status: res.statusCode ?? 200, body: {} });
          }
        });
      },
    );

    req.setTimeout(opts.timeoutMs ?? 5000, () => { req.destroy(); resolve({ status: 504, body: { error: "gateway timeout" } }); });
    req.on("error", (e) => resolve({ status: 502, body: { error: e.message } }));
    if (raw) req.write(raw);
    req.end();
  });
}

// In-memory message store for A2A messages (routed between agents)
// Key: correlationId → array of messages
const messageStore: Record<string, Array<{
  messageId: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  sentAt: string;
}>> = {};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
server.get("/health", async () => ({
  service: SERVICE,
  status: "healthy",
  gateway: GATEWAY_BASE,
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Discovery — backed by real agent-gateway DB
// ---------------------------------------------------------------------------

server.get<{
  Querystring: { limit?: string; offset?: string; status?: string; role?: string }
}>("/discovery", async (request, reply) => {
  const { limit = "50", offset = "0", status, role } = request.query;
  let path = `/agents?limit=${limit}&offset=${offset}`;
  if (status) path += `&status=${encodeURIComponent(status)}`;
  if (role) path += `&role=${encodeURIComponent(role)}`;

  const result = await proxyRequest({ method: "GET", path });
  const data = result.body as { agents?: unknown[]; total?: number };

  // Normalise response to A2A discovery format
  const agents = (data.agents ?? []).map((a: any) => ({
    agentId:     a.id,
    name:        a.name,
    description: a.description ?? "",
    role:        a.role,
    capabilities: a.allowedTools ?? [],
    endpoint:    `${GATEWAY_BASE}/agents/${a.id}`,
    protocol:    "a2a-v1",
    status:      a.status,
    registeredAt: a.createdAt,
  }));

  return reply.status(result.status < 300 ? 200 : result.status).send({
    agents,
    total: data.total ?? agents.length,
  });
});

server.get<{ Params: { agentId: string } }>("/discovery/:agentId", async (request, reply) => {
  const result = await proxyRequest({ method: "GET", path: `/agents/${request.params.agentId}` });
  const a = result.body as any;
  if (result.status === 404) return reply.status(404).send({ error: "Agent not found" });

  return reply.status(result.status).send({
    agentId:     a.id,
    name:        a.name,
    description: a.description ?? "",
    role:        a.role,
    capabilities: a.allowedTools ?? [],
    endpoint:    `${GATEWAY_BASE}/agents/${a.id}`,
    protocol:    "a2a-v1",
    metadata:    { version: "1.0.0", tier: a.tier },
    registeredAt: a.createdAt,
  });
});

server.post<{
  Body: {
    agentId?: string;
    name: string;
    orgId: string;
    role: string;
    tier?: string;
    capabilities?: string[];
    spendLimitDaily?: string;
    spendLimitPerTask?: string;
    approvalThreshold?: string;
    description?: string;
  };
}>("/discovery/register", async (request, reply) => {
  const body = request.body;
  const result = await proxyRequest({
    method: "POST",
    path: "/agents/register",
    body: {
      name:              body.name,
      orgId:             body.orgId,
      role:              body.role ?? "worker",
      tier:              body.tier ?? "standard",
      allowedTools:      body.capabilities ?? [],
      spendLimitDaily:   body.spendLimitDaily    ?? "0",
      spendLimitPerTask: body.spendLimitPerTask  ?? "0",
      approvalThreshold: body.approvalThreshold  ?? "0",
      description:       body.description,
    },
  });

  const data = result.body as any;
  return reply.status(result.status).send({
    agentId:     data.agent?.id,
    name:        data.agent?.name,
    capabilities: body.capabilities ?? [],
    endpoint:    `${GATEWAY_BASE}/agents/${data.agent?.id}`,
    protocol:    "a2a-v1",
    status:      "registered",
    registeredAt: data.agent?.createdAt ?? new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Capability discovery — query agents by capability/tool
// ---------------------------------------------------------------------------

server.post<{ Body: { capability: string; limit?: number } }>(
  "/discover/capability",
  async (request, reply) => {
    const { capability, limit = 10 } = request.body;

    // Fetch all agents and filter client-side (gateway doesn't yet have capability search)
    const result = await proxyRequest({ method: "GET", path: `/agents?limit=200` });
    const data = result.body as { agents?: any[] };
    const matched = (data.agents ?? [])
      .filter((a) => (a.allowedTools ?? []).some((t: string) =>
        t.toLowerCase().includes(capability.toLowerCase())))
      .slice(0, limit)
      .map((a) => ({
        agentId:    a.id,
        name:       a.name,
        endpoint:   `${GATEWAY_BASE}/agents/${a.id}`,
        matchScore: 1.0,
      }));

    return reply.send({ capability, agents: matched, total: matched.length });
  },
);

// ---------------------------------------------------------------------------
// Messages — in-memory routing between agents
// ---------------------------------------------------------------------------

server.post<{
  Body: {
    from: string;
    to: string;
    type: string;
    payload: unknown;
    correlationId?: string;
  };
}>("/messages", async (request, reply) => {
  const { from, to, type, payload, correlationId } = request.body;

  // Verify both agents exist in gateway
  const [fromRes, toRes] = await Promise.all([
    proxyRequest({ method: "GET", path: `/agents/${from}` }),
    proxyRequest({ method: "GET", path: `/agents/${to}` }),
  ]);

  if (fromRes.status === 404) return reply.status(400).send({ error: `Sender agent not found: ${from}` });
  if (toRes.status === 404)   return reply.status(400).send({ error: `Recipient agent not found: ${to}` });

  const corrId = correlationId ?? `corr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const msg = {
    messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    correlationId: corrId,
    from,
    to,
    type,
    payload,
    status: "routed",
    sentAt: new Date().toISOString(),
  };

  if (!messageStore[corrId]) messageStore[corrId] = [];
  messageStore[corrId].push(msg);

  // Keep store bounded — drop oldest thread when > 1000 correlation IDs
  const keys = Object.keys(messageStore);
  if (keys.length > 1000) delete messageStore[keys[0]!];

  return reply.status(201).send(msg);
});

server.get<{ Params: { correlationId: string } }>(
  "/messages/:correlationId",
  async (request, reply) => {
    const msgs = messageStore[request.params.correlationId] ?? [];
    return reply.send({ correlationId: request.params.correlationId, messages: msgs, total: msgs.length });
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const start = async () => {
  try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    server.log.info(`${SERVICE} listening on port ${PORT} — proxying discovery to ${GATEWAY_BASE}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
