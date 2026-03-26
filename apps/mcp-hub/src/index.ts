import Fastify from "fastify";

const PORT = 4020;
const SERVICE = "@unykorn/mcp-hub";

const server = Fastify({ logger: true });

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
server.get("/health", async () => ({
  service: SERVICE,
  status: "healthy",
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------
server.get("/servers", async () => ({
  servers: [
    {
      name: "blockchain-mcp",
      description: "Blockchain data and transaction tools",
      status: "healthy",
      toolCount: 8,
      resourceCount: 3,
      endpoint: "http://localhost:5100",
      registeredAt: "2026-03-20T10:00:00Z",
    },
    {
      name: "market-data-mcp",
      description: "Real-time market data and analytics",
      status: "healthy",
      toolCount: 12,
      resourceCount: 5,
      endpoint: "http://localhost:5110",
      registeredAt: "2026-03-20T10:05:00Z",
    },
    {
      name: "knowledge-mcp",
      description: "Knowledge base and document retrieval",
      status: "degraded",
      toolCount: 6,
      resourceCount: 10,
      endpoint: "http://localhost:5120",
      registeredAt: "2026-03-20T10:10:00Z",
    },
  ],
  total: 3,
}));

server.get<{ Params: { name: string } }>("/servers/:name", async (request) => ({
  name: request.params.name,
  description: "Blockchain data and transaction tools",
  status: "healthy",
  version: "1.2.0",
  toolCount: 8,
  resourceCount: 3,
  endpoint: "http://localhost:5100",
  metadata: { protocol: "mcp-v1", maxConcurrency: 10 },
  registeredAt: "2026-03-20T10:00:00Z",
  lastHealthCheck: new Date().toISOString(),
}));

server.get<{ Params: { name: string } }>("/servers/:name/tools", async (request) => ({
  server: request.params.name,
  tools: [
    {
      name: "get_balance",
      description: "Get token balance for an address",
      inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
    },
    {
      name: "get_transaction",
      description: "Get transaction details by hash",
      inputSchema: { type: "object", properties: { hash: { type: "string" } }, required: ["hash"] },
    },
    {
      name: "estimate_gas",
      description: "Estimate gas for a transaction",
      inputSchema: { type: "object", properties: { to: { type: "string" }, value: { type: "string" } }, required: ["to"] },
    },
  ],
  total: 3,
}));

server.get<{ Params: { name: string } }>("/servers/:name/resources", async (request) => ({
  server: request.params.name,
  resources: [
    { uri: "blockchain://mainnet/blocks/latest", name: "Latest Block", mimeType: "application/json" },
    { uri: "blockchain://mainnet/gas-price", name: "Gas Price", mimeType: "application/json" },
    { uri: "blockchain://mainnet/network-stats", name: "Network Stats", mimeType: "application/json" },
  ],
  total: 3,
}));

server.post<{ Params: { name: string; tool: string }; Body: { args: Record<string, unknown> } }>(
  "/servers/:name/invoke/:tool",
  async (request) => ({
    server: request.params.name,
    tool: request.params.tool,
    result: {
      success: true,
      data: { placeholder: `Result of ${request.params.tool} invocation`, args: request.body.args },
      executionMs: 142,
    },
    invokedAt: new Date().toISOString(),
  }),
);

// ---------------------------------------------------------------------------
// Health — all servers
// ---------------------------------------------------------------------------
server.get("/health/all", async () => ({
  servers: [
    { name: "blockchain-mcp", status: "healthy", latencyMs: 12, checkedAt: new Date().toISOString() },
    { name: "market-data-mcp", status: "healthy", latencyMs: 8, checkedAt: new Date().toISOString() },
    { name: "knowledge-mcp", status: "degraded", latencyMs: 340, checkedAt: new Date().toISOString() },
  ],
  summary: { total: 3, healthy: 2, degraded: 1, unhealthy: 0 },
}));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const start = async () => {
  try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    server.log.info(`${SERVICE} listening on port ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
