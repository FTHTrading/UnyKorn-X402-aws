import Fastify from "fastify";

const PORT = 4070;
const SERVICE = "@unykorn/concierge";

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
// Customer Requests
// ---------------------------------------------------------------------------
server.post<{
  Body: {
    customerId: string;
    message: string;
    category?: string;
    priority?: string;
  };
}>("/requests", async (request) => ({
  requestId: `req-${Date.now()}`,
  customerId: request.body.customerId,
  message: request.body.message,
  category: request.body.category ?? "general",
  priority: request.body.priority ?? "normal",
  status: "received",
  assignedAgentId: null,
  estimatedResponseMs: 5000,
  createdAt: new Date().toISOString(),
}));

server.get<{ Params: { id: string } }>("/requests/:id", async (request) => ({
  requestId: request.params.id,
  customerId: "cust-001",
  message: "I need help analysing my portfolio performance this quarter",
  category: "analysis",
  priority: "normal",
  status: "in-progress",
  assignedAgentId: "agent-001",
  taskId: "task-401",
  createdAt: "2026-03-26T11:00:00Z",
  updatedAt: "2026-03-26T11:00:30Z",
}));

server.get<{ Params: { id: string } }>("/requests/:id/updates", async (request) => ({
  requestId: request.params.id,
  updates: [
    {
      updateId: "upd-001",
      type: "status-change",
      message: "Request received and queued for routing",
      timestamp: "2026-03-26T11:00:00Z",
    },
    {
      updateId: "upd-002",
      type: "agent-assigned",
      message: "Assigned to ResearchBot (agent-001) based on capability match",
      agentId: "agent-001",
      timestamp: "2026-03-26T11:00:15Z",
    },
    {
      updateId: "upd-003",
      type: "task-created",
      message: "Task created: portfolio analysis Q1 2026",
      taskId: "task-401",
      timestamp: "2026-03-26T11:00:30Z",
    },
    {
      updateId: "upd-004",
      type: "progress",
      message: "Agent is gathering market data and computing performance metrics",
      progress: 45,
      timestamp: "2026-03-26T11:02:00Z",
    },
  ],
  total: 4,
}));

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------
server.post<{
  Body: {
    requestId: string;
    customerId: string;
    rating: number;
    comment?: string;
  };
}>("/feedback", async (request) => ({
  feedbackId: `fb-${Date.now()}`,
  requestId: request.body.requestId,
  customerId: request.body.customerId,
  rating: request.body.rating,
  comment: request.body.comment ?? "",
  status: "submitted",
  submittedAt: new Date().toISOString(),
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
