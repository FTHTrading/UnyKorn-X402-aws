import Fastify from "fastify";

const PORT = 4011;
const SERVICE = "@unykorn/a2a-router";

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
// Discovery
// ---------------------------------------------------------------------------
server.get("/discovery", async () => ({
  agents: [
    {
      agentId: "agent-001",
      name: "ResearchBot",
      description: "Performs web research and summarisation",
      capabilities: ["web-search", "summarization"],
      endpoint: "http://localhost:4000/agents/agent-001",
      protocol: "a2a-v1",
      registeredAt: "2026-03-20T10:00:00Z",
    },
    {
      agentId: "agent-002",
      name: "WriterBot",
      description: "Content generation and editing",
      capabilities: ["content-generation", "editing"],
      endpoint: "http://localhost:4000/agents/agent-002",
      protocol: "a2a-v1",
      registeredAt: "2026-03-21T08:30:00Z",
    },
  ],
  total: 2,
}));

server.get<{ Params: { agentId: string } }>(
  "/discovery/:agentId",
  async (request) => ({
    agentId: request.params.agentId,
    name: "ResearchBot",
    description: "Performs web research and summarisation",
    capabilities: ["web-search", "summarization"],
    endpoint: `http://localhost:4000/agents/${request.params.agentId}`,
    protocol: "a2a-v1",
    metadata: { version: "1.0.0", maxConcurrentTasks: 5 },
    registeredAt: "2026-03-20T10:00:00Z",
  }),
);

server.post<{ Body: { agentId: string; name: string; capabilities: string[]; endpoint: string } }>(
  "/discovery/register",
  async (request) => ({
    agentId: request.body.agentId,
    name: request.body.name,
    capabilities: request.body.capabilities,
    endpoint: request.body.endpoint,
    protocol: "a2a-v1",
    status: "registered",
    registeredAt: new Date().toISOString(),
  }),
);

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
server.post<{
  Body: {
    from: string;
    to: string;
    type: string;
    payload: unknown;
    correlationId?: string;
  };
}>("/messages", async (request) => ({
  messageId: `msg-${Date.now()}`,
  correlationId: request.body.correlationId ?? `corr-${Date.now()}`,
  from: request.body.from,
  to: request.body.to,
  type: request.body.type,
  status: "routed",
  sentAt: new Date().toISOString(),
}));

server.get<{ Params: { correlationId: string } }>(
  "/messages/:correlationId",
  async (request) => ({
    correlationId: request.params.correlationId,
    messages: [
      {
        messageId: "msg-001",
        from: "agent-001",
        to: "agent-002",
        type: "task-request",
        payload: { description: "Summarise document" },
        sentAt: "2026-03-26T09:00:00Z",
      },
      {
        messageId: "msg-002",
        from: "agent-002",
        to: "agent-001",
        type: "task-response",
        payload: { quote: 25, currency: "UNY" },
        sentAt: "2026-03-26T09:01:00Z",
      },
    ],
    total: 2,
  }),
);

// ---------------------------------------------------------------------------
// Capability discovery
// ---------------------------------------------------------------------------
server.post<{ Body: { capability: string } }>(
  "/discover/capability",
  async (request) => ({
    capability: request.body.capability,
    agents: [
      {
        agentId: "agent-001",
        name: "ResearchBot",
        endpoint: "http://localhost:4000/agents/agent-001",
        matchScore: 0.95,
      },
    ],
    total: 1,
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
