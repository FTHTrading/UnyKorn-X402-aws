import Fastify from "fastify";

const PORT = 4040;
const SERVICE = "@unykorn/proof-center-app";

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
// Receipts
// ---------------------------------------------------------------------------
server.get<{ Params: { id: string } }>("/receipts/:id", async (request) => ({
  receiptId: request.params.id,
  taskId: "task-100001",
  payerAgentId: "agent-001",
  payeeAgentId: "agent-002",
  amount: 25,
  currency: "UNY",
  description: "Summarise quarterly earnings report",
  status: "verified",
  proofHash: "sha256:abc123def456789012345678901234567890abcdef",
  batchId: "batch-001",
  issuedAt: "2026-03-26T09:30:00Z",
  verifiedAt: "2026-03-26T09:30:05Z",
}));

server.get<{ Params: { id: string } }>("/receipts/:id/verify", async (request) => ({
  receiptId: request.params.id,
  valid: true,
  proofHash: "sha256:abc123def456789012345678901234567890abcdef",
  verificationMethod: "merkle-proof",
  batchId: "batch-001",
  batchRoot: "sha256:root0000111122223333444455556666aaaa",
  verifiedAt: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------
server.get<{ Params: { id: string } }>("/batches/:id", async (request) => ({
  batchId: request.params.id,
  receiptCount: 12,
  merkleRoot: "sha256:root0000111122223333444455556666aaaa",
  anchoredTxHash: "0xabc123...def789",
  anchoredChain: "base-sepolia",
  anchoredAt: "2026-03-26T10:00:00Z",
  receipts: [
    { receiptId: "receipt-001", amount: 25, currency: "UNY" },
    { receiptId: "receipt-002", amount: 10, currency: "UNY" },
  ],
}));

// ---------------------------------------------------------------------------
// Proofs
// ---------------------------------------------------------------------------
server.get<{ Params: { id: string } }>("/proofs/:id", async (request) => ({
  proofId: request.params.id,
  type: "merkle-inclusion",
  receiptId: "receipt-001",
  batchId: "batch-001",
  proof: [
    "sha256:leaf01",
    "sha256:sibling01",
    "sha256:sibling02",
  ],
  root: "sha256:root0000111122223333444455556666aaaa",
  verified: true,
  generatedAt: "2026-03-26T10:01:00Z",
}));

// ---------------------------------------------------------------------------
// Verify by hash
// ---------------------------------------------------------------------------
server.post<{ Body: { hash: string } }>(
  "/receipts/verify",
  async (request) => ({
    hash: request.body.hash,
    found: true,
    receiptId: "receipt-001",
    valid: true,
    batchId: "batch-001",
    anchoredChain: "base-sepolia",
    verifiedAt: new Date().toISOString(),
  }),
);

// ---------------------------------------------------------------------------
// Supply & Treasury truth
// ---------------------------------------------------------------------------
server.get("/supply", async () => ({
  totalSupply: 1_000_000,
  circulatingGenesis: 45_000,
  lockedEscrow: 1_200,
  burned: 0,
  currency: "UNY",
  lastVerifiedAt: new Date().toISOString(),
  proofHash: "sha256:supplyhash000111222333",
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
  verified: true,
  proofHash: "sha256:treasuryhash000111222333",
  verifiedAt: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Changelog / Audit library
// ---------------------------------------------------------------------------
server.get("/changelog", async () => ({
  entries: [
    {
      id: "cl-001",
      type: "batch-anchored",
      batchId: "batch-001",
      description: "Batch of 12 receipts anchored to base-sepolia",
      timestamp: "2026-03-26T10:00:00Z",
    },
    {
      id: "cl-002",
      type: "supply-verified",
      description: "Supply truth snapshot verified against on-chain state",
      timestamp: "2026-03-26T10:05:00Z",
    },
    {
      id: "cl-003",
      type: "treasury-audit",
      description: "Treasury reconciliation completed — no discrepancies",
      timestamp: "2026-03-26T10:10:00Z",
    },
  ],
  total: 3,
  page: 1,
  pageSize: 50,
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
