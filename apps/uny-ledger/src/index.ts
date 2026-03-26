import Fastify from "fastify";

const PORT = 4030;
const SERVICE = "@unykorn/uny-ledger";

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
// Accounts
// ---------------------------------------------------------------------------
server.post<{ Body: { agentId: string; label?: string } }>(
  "/accounts",
  async (request) => ({
    accountId: `acct-${Date.now()}`,
    agentId: request.body.agentId,
    label: request.body.label ?? "default",
    balance: { core: 0, genesis: 0, currency: "UNY" },
    status: "active",
    createdAt: new Date().toISOString(),
  }),
);

server.get<{ Params: { agentId: string } }>("/accounts/:agentId", async (request) => ({
  accountId: "acct-100001",
  agentId: request.params.agentId,
  label: "default",
  balance: { core: 10000, genesis: 4500, currency: "UNY" },
  status: "active",
  createdAt: "2026-03-20T10:00:00Z",
}));

// ---------------------------------------------------------------------------
// Deposit / Withdraw / Transfer
// ---------------------------------------------------------------------------
server.post<{ Body: { agentId: string; amount: number } }>(
  "/deposit",
  async (request) => ({
    transactionId: `txn-${Date.now()}`,
    type: "deposit",
    agentId: request.body.agentId,
    amount: request.body.amount,
    currency: "UNY",
    from: "core",
    to: "genesis",
    status: "confirmed",
    processedAt: new Date().toISOString(),
  }),
);

server.post<{ Body: { agentId: string; amount: number } }>(
  "/withdraw",
  async (request) => ({
    transactionId: `txn-${Date.now()}`,
    type: "withdrawal",
    agentId: request.body.agentId,
    amount: request.body.amount,
    currency: "UNY",
    from: "genesis",
    to: "core",
    status: "confirmed",
    processedAt: new Date().toISOString(),
  }),
);

server.post<{ Body: { fromAgentId: string; toAgentId: string; amount: number; memo?: string } }>(
  "/transfer",
  async (request) => ({
    transactionId: `txn-${Date.now()}`,
    type: "transfer",
    from: request.body.fromAgentId,
    to: request.body.toAgentId,
    amount: request.body.amount,
    currency: "UNY",
    memo: request.body.memo ?? "",
    status: "confirmed",
    processedAt: new Date().toISOString(),
  }),
);

// ---------------------------------------------------------------------------
// Escrow
// ---------------------------------------------------------------------------
server.post<{ Body: { taskId: string; payerAgentId: string; payeeAgentId: string; amount: number } }>(
  "/escrow/lock",
  async (request) => ({
    escrowId: `escrow-${Date.now()}`,
    taskId: request.body.taskId,
    payerAgentId: request.body.payerAgentId,
    payeeAgentId: request.body.payeeAgentId,
    amount: request.body.amount,
    currency: "UNY",
    status: "locked",
    lockedAt: new Date().toISOString(),
  }),
);

server.post<{ Params: { id: string } }>(
  "/escrow/:id/release",
  async (request) => ({
    escrowId: request.params.id,
    status: "released",
    settlement: { amount: 25, currency: "UNY", receiptId: `receipt-${Date.now()}` },
    releasedAt: new Date().toISOString(),
  }),
);

server.post<{ Params: { id: string } }>(
  "/escrow/:id/refund",
  async (request) => ({
    escrowId: request.params.id,
    status: "refunded",
    refund: { amount: 25, currency: "UNY", returnedTo: "agent-001" },
    refundedAt: new Date().toISOString(),
  }),
);

// ---------------------------------------------------------------------------
// Reserve / Settle
// ---------------------------------------------------------------------------
server.post<{ Body: { agentId: string; amount: number; purpose: string } }>(
  "/reserve",
  async (request) => ({
    reservationId: `rsv-${Date.now()}`,
    agentId: request.body.agentId,
    amount: request.body.amount,
    currency: "UNY",
    purpose: request.body.purpose,
    status: "reserved",
    reservedAt: new Date().toISOString(),
  }),
);

server.post<{ Body: { taskId: string; receiptId: string } }>(
  "/settle",
  async (request) => ({
    settlementId: `stl-${Date.now()}`,
    taskId: request.body.taskId,
    receiptId: request.body.receiptId,
    amount: 25,
    currency: "UNY",
    from: "agent-001",
    to: "agent-002",
    status: "settled",
    settledAt: new Date().toISOString(),
  }),
);

// ---------------------------------------------------------------------------
// Ledger & Treasury
// ---------------------------------------------------------------------------
server.get("/ledger", async () => ({
  entries: [
    { id: "le-001", type: "deposit", agentId: "agent-001", amount: 500, currency: "UNY", timestamp: "2026-03-25T10:00:00Z" },
    { id: "le-002", type: "escrow-lock", agentId: "agent-001", amount: 25, currency: "UNY", timestamp: "2026-03-26T09:00:00Z" },
    { id: "le-003", type: "settlement", agentId: "agent-002", amount: 25, currency: "UNY", timestamp: "2026-03-26T09:30:00Z" },
  ],
  total: 3,
  page: 1,
  pageSize: 50,
}));

server.get("/treasury", async () => ({
  treasury: {
    totalSupply: 1_000_000,
    circulatingGenesis: 45_000,
    lockedEscrow: 1_200,
    reservedBudgets: 8_500,
    availableCore: 945_300,
    currency: "UNY",
  },
  updatedAt: new Date().toISOString(),
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
