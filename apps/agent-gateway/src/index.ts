import Fastify from "fastify";

const PORT = 4000;
const SERVICE = "@unykorn/agent-gateway";

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
// Agents
// ---------------------------------------------------------------------------
server.get("/agents", async () => ({
  agents: [
    {
      id: "agent-001",
      name: "ResearchBot",
      role: "researcher",
      status: "active",
      capabilities: ["web-search", "summarization"],
      registeredAt: "2026-03-20T10:00:00Z",
    },
    {
      id: "agent-002",
      name: "WriterBot",
      role: "writer",
      status: "active",
      capabilities: ["content-generation", "editing"],
      registeredAt: "2026-03-21T08:30:00Z",
    },
  ],
  total: 2,
}));

server.get<{ Params: { id: string } }>("/agents/:id", async (request) => ({
  id: request.params.id,
  name: "ResearchBot",
  role: "researcher",
  status: "active",
  capabilities: ["web-search", "summarization"],
  budget: { allocated: 500, spent: 123.45, currency: "UNY" },
  registeredAt: "2026-03-20T10:00:00Z",
  lastActiveAt: "2026-03-26T12:00:00Z",
}));

server.post<{ Body: { name: string; role: string; capabilities: string[] } }>(
  "/agents/register",
  async (request) => ({
    id: `agent-${Date.now()}`,
    name: request.body.name,
    role: request.body.role,
    capabilities: request.body.capabilities,
    status: "registered",
    registeredAt: new Date().toISOString(),
  }),
);

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
server.post<{ Body: { description: string; requesterAgentId: string; capabilities: string[] } }>(
  "/tasks",
  async (request) => ({
    id: `task-${Date.now()}`,
    description: request.body.description,
    requesterAgentId: request.body.requesterAgentId,
    requiredCapabilities: request.body.capabilities,
    status: "open",
    createdAt: new Date().toISOString(),
  }),
);

server.get<{ Params: { id: string } }>("/tasks/:id", async (request) => ({
  id: request.params.id,
  description: "Summarise quarterly earnings report",
  requesterAgentId: "agent-001",
  assignedAgentId: "agent-002",
  status: "in-progress",
  quote: { amount: 25, currency: "UNY" },
  createdAt: "2026-03-26T09:00:00Z",
  updatedAt: "2026-03-26T09:15:00Z",
}));

server.post<{ Params: { id: string }; Body: { agentId: string; amount: number } }>(
  "/tasks/:id/quote",
  async (request) => ({
    taskId: request.params.id,
    agentId: request.body.agentId,
    quote: { amount: request.body.amount, currency: "UNY" },
    status: "quoted",
    quotedAt: new Date().toISOString(),
  }),
);

server.post<{ Params: { id: string }; Body: { quoteId: string } }>(
  "/tasks/:id/accept",
  async (request) => ({
    taskId: request.params.id,
    quoteId: request.body.quoteId,
    status: "accepted",
    escrowId: `escrow-${Date.now()}`,
    acceptedAt: new Date().toISOString(),
  }),
);

server.post<{ Params: { id: string }; Body: { agentId: string; result: unknown } }>(
  "/tasks/:id/deliver",
  async (request) => ({
    taskId: request.params.id,
    agentId: request.body.agentId,
    status: "delivered",
    receiptId: `receipt-${Date.now()}`,
    deliveredAt: new Date().toISOString(),
  }),
);

server.post<{ Params: { id: string } }>(
  "/tasks/:id/settle",
  async (request) => ({
    taskId: request.params.id,
    status: "settled",
    settlement: {
      amount: 25,
      currency: "UNY",
      from: "agent-001",
      to: "agent-002",
      receiptId: `receipt-${Date.now()}`,
    },
    settledAt: new Date().toISOString(),
  }),
);

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
