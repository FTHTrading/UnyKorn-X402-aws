import Fastify from "fastify";

const PORT = 4051;
const SERVICE = "@unykorn/ops-console";

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
// Dashboard
// ---------------------------------------------------------------------------
server.get("/dashboard", async () => ({
  overview: {
    agentCount: 12,
    activeAgents: 9,
    taskCount: 247,
    tasksInProgress: 14,
    tasksQueued: 3,
    escrowsActive: 8,
    treasury: {
      totalSupply: 1_000_000,
      circulatingGenesis: 45_000,
      lockedEscrow: 1_200,
      currency: "UNY",
    },
  },
  systemHealth: "healthy",
  incidentCount: 0,
  updatedAt: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
server.get("/agents", async () => ({
  agents: [
    { id: "agent-001", name: "ResearchBot", status: "active", taskCount: 42, lastActiveAt: "2026-03-26T12:00:00Z" },
    { id: "agent-002", name: "WriterBot", status: "active", taskCount: 31, lastActiveAt: "2026-03-26T11:55:00Z" },
    { id: "agent-003", name: "AnalystBot", status: "idle", taskCount: 18, lastActiveAt: "2026-03-26T10:30:00Z" },
    { id: "agent-004", name: "AuditorBot", status: "active", taskCount: 55, lastActiveAt: "2026-03-26T12:01:00Z" },
  ],
  total: 4,
}));

server.get<{ Params: { id: string } }>("/agents/:id/health", async (request) => ({
  agentId: request.params.id,
  current: { status: "active", cpuPercent: 12, memoryMb: 256, openTasks: 3 },
  history: [
    { timestamp: "2026-03-26T11:00:00Z", status: "active", latencyMs: 45 },
    { timestamp: "2026-03-26T11:15:00Z", status: "active", latencyMs: 38 },
    { timestamp: "2026-03-26T11:30:00Z", status: "active", latencyMs: 52 },
    { timestamp: "2026-03-26T11:45:00Z", status: "active", latencyMs: 41 },
    { timestamp: "2026-03-26T12:00:00Z", status: "active", latencyMs: 44 },
  ],
}));

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
server.get("/budgets", async () => ({
  budgets: [
    { agentId: "agent-001", allocated: 500, spent: 123.45, reserved: 50, available: 326.55, currency: "UNY" },
    { agentId: "agent-002", allocated: 300, spent: 78.9, reserved: 25, available: 196.1, currency: "UNY" },
    { agentId: "agent-003", allocated: 200, spent: 45.0, reserved: 0, available: 155.0, currency: "UNY" },
  ],
  total: 3,
}));

// ---------------------------------------------------------------------------
// Tasks queue
// ---------------------------------------------------------------------------
server.get("/tasks/queue", async () => ({
  queued: [
    { taskId: "task-301", description: "Translate press release to German", priority: "high", queuedAt: "2026-03-26T11:50:00Z" },
    { taskId: "task-302", description: "Generate social media images", priority: "medium", queuedAt: "2026-03-26T11:52:00Z" },
    { taskId: "task-303", description: "Compile compliance report", priority: "low", queuedAt: "2026-03-26T11:55:00Z" },
  ],
  total: 3,
}));

// ---------------------------------------------------------------------------
// Escrows
// ---------------------------------------------------------------------------
server.get("/escrows", async () => ({
  escrows: [
    { escrowId: "escrow-001", taskId: "task-201", payerAgentId: "agent-001", payeeAgentId: "agent-002", amount: 25, currency: "UNY", status: "locked", lockedAt: "2026-03-26T09:00:00Z" },
    { escrowId: "escrow-002", taskId: "task-202", payerAgentId: "agent-003", payeeAgentId: "agent-004", amount: 40, currency: "UNY", status: "locked", lockedAt: "2026-03-26T09:30:00Z" },
  ],
  total: 2,
}));

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------
server.get("/incidents", async () => ({
  incidents: [] as Array<{ id: string; severity: string; description: string; detectedAt: string }>,
  total: 0,
  message: "No active incidents",
}));

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
server.get("/metrics", async () => ({
  system: {
    cpuPercent: 23,
    memoryUsedMb: 1024,
    memoryTotalMb: 4096,
    activeConnections: 42,
    requestsPerMinute: 320,
  },
  agents: {
    totalRegistered: 12,
    active: 9,
    idle: 2,
    unhealthy: 1,
  },
  tasks: {
    completedToday: 87,
    averageCompletionMs: 4200,
    failureRate: 0.02,
  },
  treasury: {
    transactionsToday: 134,
    volumeToday: 3450,
    currency: "UNY",
  },
  collectedAt: new Date().toISOString(),
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
