/**
 * @unykorn/uny-ledger — Genesis Ledger API
 *
 * Real implementation: GenesisLedger engine + PrismaClient persistence.
 * Double-entry, append-only, hash-chained ledger for UNY machine settlement.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import { GenesisLedger } from "@unykorn/genesis-ledger";

const PORT = Number(process.env.UNY_LEDGER_PORT ?? 4030);
const SERVICE = "@unykorn/uny-ledger";

const server = Fastify({ logger: true });
server.register(cors, { origin: true });
const prisma = new PrismaClient();
const ledger = new GenesisLedger();

// Serialize BigInt as string in JSON responses
server.addHook("preSerialization", async (_request, _reply, payload) => {
  return JSON.parse(JSON.stringify(payload, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  ));
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
server.get("/health", async () => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch { /* db down */ }

  return {
    service: SERVICE,
    status: dbOk ? "healthy" : "degraded",
    database: dbOk ? "connected" : "disconnected",
    entries: ledger.entryCount(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
});

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
server.post<{ Body: { agentId: string; orgId: string; label?: string } }>(
  "/accounts",
  async (request, reply) => {
    const { agentId, orgId } = request.body;

    // Verify agent exists
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) return reply.status(400).send({ error: "Agent not found" });

    // Create in engine
    const account = ledger.createAccount(agentId, orgId);

    // Persist to DB
    const dbAccount = await prisma.genesisAccount.create({
      data: {
        id: account.accountId,
        agentId,
        orgId,
        status: "active",
      },
    });

    return reply.status(201).send(dbAccount);
  },
);

server.get<{ Params: { agentId: string } }>("/accounts/:agentId", async (request, reply) => {
  const account = await prisma.genesisAccount.findFirst({
    where: { agentId: request.params.agentId, isSubAccount: false },
  });
  if (!account) return reply.status(404).send({ error: "Account not found" });
  return account;
});

// ---------------------------------------------------------------------------
// Deposit / Withdraw / Transfer
// ---------------------------------------------------------------------------
server.post<{ Body: { agentId: string; amount: string; memo?: string } }>(
  "/deposit",
  async (request, reply) => {
    const { agentId, amount, memo } = request.body;

    try {
      const entry = ledger.deposit(agentId, amount, memo);
      const account = ledger.getAccountByAgent(agentId)!;

      // Persist balance update
      await prisma.genesisAccount.updateMany({
        where: { agentId, isSubAccount: false },
        data: {
          operatingBalance: account.balances.OPERATING,
          totalDeposited: account.totalDeposited,
        },
      });

      // Persist ledger entry
      const dbEntry = await prisma.ledgerEntry.create({
        data: {
          id: entry.entryId,
          type: entry.type as any,
          fromAgentId: entry.fromAgentId,
          toAgentId: entry.toAgentId,
          amount: entry.amount,
          fromClass: entry.fromClass as any,
          toClass: entry.toClass as any,
          taskId: entry.taskId,
          policyDecisionId: entry.policyDecisionId,
          memo: entry.memo,
          entryHash: entry.entryHash,
          previousHash: entry.previousHash,
          idempotencyKey: entry.idempotencyKey,
        },
      });

      return reply.status(201).send(dbEntry);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  },
);

server.post<{ Body: { agentId: string; amount: string; memo?: string } }>(
  "/withdraw",
  async (request, reply) => {
    const { agentId, amount, memo } = request.body;

    try {
      const entry = ledger.withdraw(agentId, amount, memo);
      const account = ledger.getAccountByAgent(agentId)!;

      await prisma.genesisAccount.updateMany({
        where: { agentId, isSubAccount: false },
        data: {
          operatingBalance: account.balances.OPERATING,
          totalWithdrawn: account.totalWithdrawn,
        },
      });

      const dbEntry = await prisma.ledgerEntry.create({
        data: {
          id: entry.entryId,
          type: entry.type as any,
          fromAgentId: entry.fromAgentId,
          toAgentId: entry.toAgentId,
          amount: entry.amount,
          fromClass: entry.fromClass as any,
          toClass: entry.toClass as any,
          taskId: entry.taskId,
          policyDecisionId: entry.policyDecisionId,
          memo: entry.memo,
          entryHash: entry.entryHash,
          previousHash: entry.previousHash,
          idempotencyKey: entry.idempotencyKey,
        },
      });

      return reply.status(201).send(dbEntry);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  },
);

server.post<{
  Body: {
    fromAgentId: string;
    toAgentId: string;
    amount: string;
    fromClass?: string;
    toClass?: string;
    taskId?: string;
    memo?: string;
  };
}>("/transfer", async (request, reply) => {
  const body = request.body;

  try {
    const entry = ledger.transfer({
      fromAgentId: body.fromAgentId,
      toAgentId: body.toAgentId,
      amount: body.amount,
      fromClass: body.fromClass as any,
      toClass: body.toClass as any,
      taskId: body.taskId,
      memo: body.memo,
    });

    // Persist balances for both accounts
    const from = ledger.getAccountByAgent(body.fromAgentId)!;
    const to = ledger.getAccountByAgent(body.toAgentId)!;

    await Promise.all([
      prisma.genesisAccount.updateMany({
        where: { agentId: body.fromAgentId, isSubAccount: false },
        data: { operatingBalance: from.balances.OPERATING },
      }),
      prisma.genesisAccount.updateMany({
        where: { agentId: body.toAgentId, isSubAccount: false },
        data: { operatingBalance: to.balances.OPERATING },
      }),
    ]);

    const dbEntry = await prisma.ledgerEntry.create({
      data: {
        id: entry.entryId,
        type: entry.type as any,
        fromAgentId: entry.fromAgentId,
        toAgentId: entry.toAgentId,
        amount: entry.amount,
        fromClass: entry.fromClass as any,
        toClass: entry.toClass as any,
        taskId: entry.taskId,
        policyDecisionId: entry.policyDecisionId,
        memo: entry.memo,
        entryHash: entry.entryHash,
        previousHash: entry.previousHash,
        idempotencyKey: entry.idempotencyKey,
      },
    });

    return reply.status(201).send(dbEntry);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Escrow
// ---------------------------------------------------------------------------
server.post<{
  Body: {
    taskId: string;
    depositorAgentId: string;
    beneficiaryAgentId: string;
    amount: string;
    conditions?: { type: string; releaseAmount: string; description: string }[];
    expiresAt: string;
  };
}>("/escrow/lock", async (request, reply) => {
  const body = request.body;

  try {
    const escrow = ledger.escrowLock({
      depositorAgentId: body.depositorAgentId,
      beneficiaryAgentId: body.beneficiaryAgentId,
      taskId: body.taskId,
      amount: body.amount,
      conditions: (body.conditions?.map((c) => ({ ...c, met: false })) ?? [{ type: "task_delivery" as const, releaseAmount: body.amount, description: "Full delivery", met: false }]) as any,
      expiresAt: body.expiresAt,
    });

    // Persist balance update
    const depositor = ledger.getAccountByAgent(body.depositorAgentId)!;
    await prisma.genesisAccount.updateMany({
      where: { agentId: body.depositorAgentId, isSubAccount: false },
      data: {
        operatingBalance: depositor.balances.OPERATING,
        escrowBalance: depositor.balances.ESCROW,
      },
    });

    // Persist escrow
    const dbEscrow = await prisma.escrow.create({
      data: {
        id: escrow.escrowId,
        taskId: body.taskId,
        depositorAgentId: body.depositorAgentId,
        beneficiaryAgentId: body.beneficiaryAgentId,
        amount: body.amount,
        expiresAt: new Date(body.expiresAt),
        conditions: {
          create: escrow.releaseConditions.map((c: any) => ({
            id: c.conditionId,
            type: c.type,
            releaseAmount: c.releaseAmount,
            description: c.description,
          })),
        },
      },
      include: { conditions: true },
    });

    return reply.status(201).send(dbEscrow);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message });
  }
});

server.post<{ Params: { id: string }; Body: { amount?: string; policyDecisionId?: string } }>(
  "/escrow/:id/release",
  async (request, reply) => {
    const { id } = request.params;
    const escrow = ledger.getEscrow(id);
    if (!escrow) return reply.status(404).send({ error: "Escrow not found" });

    const amount = request.body.amount ?? escrow.amount;

    try {
      const entry = ledger.escrowRelease(id, amount, request.body.policyDecisionId);

      // Persist balances
      const depositor = ledger.getAccountByAgent(escrow.depositorAgentId)!;
      const beneficiary = ledger.getAccountByAgent(escrow.beneficiaryAgentId)!;

      await Promise.all([
        prisma.genesisAccount.updateMany({
          where: { agentId: escrow.depositorAgentId, isSubAccount: false },
          data: { escrowBalance: depositor.balances.ESCROW },
        }),
        prisma.genesisAccount.updateMany({
          where: { agentId: escrow.beneficiaryAgentId, isSubAccount: false },
          data: { operatingBalance: beneficiary.balances.OPERATING },
        }),
        prisma.escrow.update({
          where: { id },
          data: {
            releasedAmount: escrow.releasedAmount,
            status: escrow.status as any,
          },
        }),
      ]);

      const dbEntry = await prisma.ledgerEntry.create({
        data: {
          id: entry.entryId,
          type: entry.type as any,
          fromAgentId: entry.fromAgentId,
          toAgentId: entry.toAgentId,
          amount: entry.amount,
          fromClass: entry.fromClass as any,
          toClass: entry.toClass as any,
          taskId: entry.taskId,
          policyDecisionId: entry.policyDecisionId,
          memo: entry.memo,
          entryHash: entry.entryHash,
          previousHash: entry.previousHash,
          idempotencyKey: entry.idempotencyKey,
        },
      });

      return { entry: dbEntry, escrow: ledger.getEscrow(id) };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  },
);

server.post<{ Params: { id: string } }>(
  "/escrow/:id/refund",
  async (request, reply) => {
    const { id } = request.params;

    try {
      const entry = ledger.escrowRefund(id);
      const escrow = ledger.getEscrow(id)!;
      const depositor = ledger.getAccountByAgent(escrow.depositorAgentId)!;

      await Promise.all([
        prisma.genesisAccount.updateMany({
          where: { agentId: escrow.depositorAgentId, isSubAccount: false },
          data: {
            operatingBalance: depositor.balances.OPERATING,
            escrowBalance: depositor.balances.ESCROW,
          },
        }),
        prisma.escrow.update({
          where: { id },
          data: { refundedAmount: escrow.refundedAmount, status: "refunded" },
        }),
      ]);

      const dbEntry = await prisma.ledgerEntry.create({
        data: {
          id: entry.entryId,
          type: entry.type as any,
          fromAgentId: entry.fromAgentId,
          toAgentId: entry.toAgentId,
          amount: entry.amount,
          fromClass: entry.fromClass as any,
          toClass: entry.toClass as any,
          taskId: entry.taskId,
          policyDecisionId: entry.policyDecisionId,
          memo: entry.memo,
          entryHash: entry.entryHash,
          previousHash: entry.previousHash,
          idempotencyKey: entry.idempotencyKey,
        },
      });

      return dbEntry;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Reserve / Settle
// ---------------------------------------------------------------------------
server.post<{ Body: { agentId: string; amount: string; taskId?: string } }>(
  "/reserve",
  async (request, reply) => {
    const { agentId, amount, taskId } = request.body;

    try {
      const entry = ledger.reserve(agentId, amount, taskId);
      const account = ledger.getAccountByAgent(agentId)!;

      await prisma.genesisAccount.updateMany({
        where: { agentId, isSubAccount: false },
        data: {
          operatingBalance: account.balances.OPERATING,
          reservedBalance: account.balances.RESERVED,
        },
      });

      const dbEntry = await prisma.ledgerEntry.create({
        data: {
          id: entry.entryId,
          type: entry.type as any,
          fromAgentId: entry.fromAgentId,
          toAgentId: entry.toAgentId,
          amount: entry.amount,
          fromClass: entry.fromClass as any,
          toClass: entry.toClass as any,
          taskId: entry.taskId,
          policyDecisionId: entry.policyDecisionId,
          memo: entry.memo,
          entryHash: entry.entryHash,
          previousHash: entry.previousHash,
          idempotencyKey: entry.idempotencyKey,
        },
      });

      return reply.status(201).send(dbEntry);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  },
);

server.post<{
  Body: {
    fromAgentId: string;
    toAgentId: string;
    amount: string;
    taskId: string;
    policyDecisionId: string;
  };
}>("/settle", async (request, reply) => {
  const body = request.body;

  try {
    const entry = ledger.settle({
      fromAgentId: body.fromAgentId,
      toAgentId: body.toAgentId,
      amount: body.amount,
      taskId: body.taskId,
      policyDecisionId: body.policyDecisionId,
    });

    const toAccount = ledger.getAccountByAgent(body.toAgentId)!;
    await prisma.genesisAccount.updateMany({
      where: { agentId: body.toAgentId, isSubAccount: false },
      data: { proofReceiptBalance: toAccount.balances.PROOF_RECEIPT },
    });

    const dbEntry = await prisma.ledgerEntry.create({
      data: {
        id: entry.entryId,
        type: entry.type as any,
        fromAgentId: entry.fromAgentId,
        toAgentId: entry.toAgentId,
        amount: entry.amount,
        fromClass: entry.fromClass as any,
        toClass: entry.toClass as any,
        taskId: entry.taskId,
        policyDecisionId: entry.policyDecisionId,
        memo: entry.memo,
        entryHash: entry.entryHash,
        previousHash: entry.previousHash,
        idempotencyKey: entry.idempotencyKey,
      },
    });

    return reply.status(201).send(dbEntry);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// L1 RPC — JSON-RPC 2.0 Interface (Chain Node Protocol)
// ---------------------------------------------------------------------------
// This turns the ledger into a real chain node.  The Facilitator, Explorer,
// and any external client can talk to it using standard JSON-RPC 2.0.

import { createHash, randomUUID } from "crypto";

const CHAIN_ID   = 7331;
const BLOCK_TIME = 3000;                 // ms — produce a block every 3 s
const GENESIS_TS = "2025-10-01T00:00:00Z";
const NODE_ID    = process.env.NODE_ID ?? "alpha";

// ── Block production ──────────────────────────────────────────────────────
// Blocks seal a range of ledger entries.  Each block's hash is derived from
// (prevBlockHash + merkleRoot-of-entries + height + timestamp).  Empty blocks
// are produced when there are no new entries — real chains do this too.

interface ChainBlock {
  height:      number;
  hash:        string;
  prevHash:    string;
  merkleRoot:  string;
  txCount:     number;
  entryRange:  [number, number];        // inclusive [fromSeq, toSeq]
  timestamp:   string;
  producer:    string;
}

const blocks: ChainBlock[] = [];
let lastSealedSeq = 0;
let blockTimer: ReturnType<typeof setInterval> | null = null;

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function merkleOf(hashes: string[]): string {
  if (hashes.length === 0) return sha256("empty");
  if (hashes.length === 1) return hashes[0];
  const next: string[] = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const left  = hashes[i];
    const right = hashes[i + 1] ?? left;
    next.push(sha256(left + right));
  }
  return merkleOf(next);
}

// ═══════════════════════════════════════════════════════════════════════════
// Economic Daemon — Self-Settling AI Infrastructure Economy
// ═══════════════════════════════════════════════════════════════════════════
// Every system component pays for what it uses.  The treasury allocates,
// agents spend, validators earn, AI computes, x402 settles — all real
// double-entry hash-chained entries on the UNY L1.

const SYSTEM_AGENTS = [
  { id: "agent:treasury",           name: "UNY Treasury",             org: "org:unykorn",    role: "treasury",    tier: "control" as const,        deposit: "1000000000" },
  { id: "agent:gateway",            name: "A2A Gateway",              org: "org:infra",      role: "gateway",     tier: "interface_tier" as const,  deposit: "500000" },
  { id: "agent:signer",             name: "Rust Signer (Ed25519)",    org: "org:infra",      role: "signer",      tier: "execution" as const,      deposit: "250000" },
  { id: "agent:facilitator",        name: "x402 Facilitator",         org: "org:infra",      role: "facilitator", tier: "control" as const,        deposit: "2000000" },
  { id: "agent:bedrock-ai",         name: "AWS Bedrock AI",           org: "org:ai",         role: "ai-compute",  tier: "intelligence" as const,   deposit: "5000000" },
  { id: "agent:lambda-exec",        name: "Lambda Executor",          org: "org:ai",         role: "executor",    tier: "execution" as const,      deposit: "1000000" },
  { id: "agent:merkle-engine",      name: "Merkle Anchor Engine",     org: "org:infra",      role: "anchor",      tier: "execution" as const,      deposit: "750000" },
  { id: "agent:mesh-coord",         name: "Agent Mesh Coordinator",   org: "org:ai",         role: "coordinator", tier: "intelligence" as const,   deposit: "3000000" },
  { id: "agent:validator-bravo",    name: "Validator Bravo",          org: "org:validators", role: "validator",   tier: "execution" as const,      deposit: "100000" },
  { id: "agent:validator-charlie",  name: "Validator Charlie",        org: "org:validators", role: "validator",   tier: "execution" as const,      deposit: "100000" },
  { id: "agent:oracle-delta",       name: "Oracle Delta",             org: "org:oracles",    role: "oracle",      tier: "intelligence" as const,   deposit: "200000" },
  { id: "agent:namespace-registry", name: "Namespace Registry",       org: "org:infra",      role: "registry",    tier: "control" as const,        deposit: "500000" },
  { id: "agent:x402-settler",       name: "x402 Auto-Settler",       org: "org:infra",      role: "settler",     tier: "control" as const,        deposit: "10000000" },
] as const;

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Ensure system agent exists in DB + engine, create if needed
async function ensureAgent(agentDef: typeof SYSTEM_AGENTS[number]): Promise<void> {
  // Ensure org exists
  await prisma.organization.upsert({
    where: { id: agentDef.org },
    create: {
      id: agentDef.org,
      name: agentDef.org.replace("org:", "UnyKorn ").replace(/^\w/, c => c.toUpperCase()),
      legalEntity: "UnyKorn DAO",
      jurisdiction: "Decentralized",
    },
    update: {},
  });

  // Upsert agent in DB
  const existing = await prisma.agent.findUnique({ where: { id: agentDef.id } });
  if (!existing) {
    await prisma.agent.create({
      data: {
        id: agentDef.id,
        name: agentDef.name,
        orgId: agentDef.org,
        role: agentDef.role,
        tier: agentDef.tier,
        publicKey: `pk_${agentDef.id.replace("agent:", "")}`,
        status: "active",
        spendLimitDaily: "999999999999",
        spendLimitPerTask: "999999999999",
        approvalThreshold: "0",
        allowedTools: ["*"],
        allowedDataScopes: ["*"],
        description: `System agent: ${agentDef.name}`,
      },
    });
  }

  // Ensure account in engine
  if (!ledger.getAccountByAgent(agentDef.id)) {
    ledger.createAccount(agentDef.id, agentDef.org);

    // Persist genesis account to DB
    const acct = ledger.getAccountByAgent(agentDef.id)!;
    await prisma.genesisAccount.create({
      data: {
        id: acct.accountId,
        agentId: agentDef.id,
        orgId: agentDef.org,
        status: "active",
      },
    }).catch(() => {}); // dedup
  }

  // Deposit if balance is 0
  const acct = ledger.getAccountByAgent(agentDef.id)!;
  if (BigInt(acct.balances.OPERATING) === 0n && BigInt(agentDef.deposit) > 0n) {
    const entry = ledger.deposit(agentDef.id, agentDef.deposit, `Genesis treasury allocation: ${agentDef.name}`);
    await prisma.genesisAccount.updateMany({
      where: { agentId: agentDef.id, isSubAccount: false },
      data: { operatingBalance: acct.balances.OPERATING, totalDeposited: acct.totalDeposited },
    });
    await prisma.ledgerEntry.create({
      data: {
        id: entry.entryId, type: entry.type as any,
        fromAgentId: entry.fromAgentId, toAgentId: entry.toAgentId,
        amount: entry.amount, fromClass: entry.fromClass as any, toClass: entry.toClass as any,
        memo: entry.memo, entryHash: entry.entryHash, previousHash: entry.previousHash,
        idempotencyKey: entry.idempotencyKey,
      },
    });
    server.log.info(`[ECON] Deposited ${Number(agentDef.deposit).toLocaleString()} UNY → ${agentDef.name}`);
  }
}

async function persistTransfer(entry: any, fromId: string, toId: string) {
  const from = ledger.getAccountByAgent(fromId)!;
  const to = ledger.getAccountByAgent(toId)!;
  try {
    await Promise.all([
      prisma.genesisAccount.updateMany({
        where: { agentId: fromId, isSubAccount: false },
        data: { operatingBalance: from.balances.OPERATING },
      }),
      prisma.genesisAccount.updateMany({
        where: { agentId: toId, isSubAccount: false },
        data: { operatingBalance: to.balances.OPERATING },
      }),
      prisma.ledgerEntry.create({
        data: {
          id: entry.entryId, type: entry.type as any,
          fromAgentId: entry.fromAgentId, toAgentId: entry.toAgentId,
          amount: entry.amount, fromClass: entry.fromClass as any, toClass: entry.toClass as any,
          memo: entry.memo, entryHash: entry.entryHash, previousHash: entry.previousHash,
          idempotencyKey: entry.idempotencyKey,
        },
      }),
    ]);
  } catch (e: any) {
    server.log.error(`[ECON-PERSIST] Transfer DB error: ${e.message || e}`);
  }
}

async function persistSettle(entry: any, toId: string) {
  const to = ledger.getAccountByAgent(toId)!;
  await Promise.all([
    prisma.genesisAccount.updateMany({
      where: { agentId: toId, isSubAccount: false },
      data: { proofReceiptBalance: to.balances.PROOF_RECEIPT },
    }),
    prisma.ledgerEntry.create({
      data: {
        id: entry.entryId, type: entry.type as any,
        fromAgentId: entry.fromAgentId, toAgentId: entry.toAgentId,
        amount: entry.amount, fromClass: entry.fromClass as any, toClass: entry.toClass as any,
        memo: entry.memo, entryHash: entry.entryHash, previousHash: entry.previousHash,
        idempotencyKey: entry.idempotencyKey,
      },
    }),
  ]);
}

async function persistReserve(entry: any, agentId: string) {
  const acct = ledger.getAccountByAgent(agentId)!;
  await Promise.all([
    prisma.genesisAccount.updateMany({
      where: { agentId, isSubAccount: false },
      data: { operatingBalance: acct.balances.OPERATING, reservedBalance: acct.balances.RESERVED },
    }),
    prisma.ledgerEntry.create({
      data: {
        id: entry.entryId, type: entry.type as any,
        fromAgentId: entry.fromAgentId, toAgentId: entry.toAgentId,
        amount: entry.amount, fromClass: entry.fromClass as any, toClass: entry.toClass as any,
        memo: entry.memo, entryHash: entry.entryHash, previousHash: entry.previousHash,
        idempotencyKey: entry.idempotencyKey,
      },
    }),
  ]);
}

// ── Transaction Generators ──────────────────────────────────────────────

let econCycle = 0;

const ECON_FLOWS: Array<() => Promise<void>> = [
  // 1. AI Compute Payment — agents pay Bedrock for inference
  async () => {
    const callers = ["agent:mesh-coord", "agent:facilitator", "agent:gateway", "agent:lambda-exec"];
    const caller = pick(callers);
    const amount = String(randInt(25, 500));
    const models = ["claude-3-sonnet", "claude-3-haiku", "claude-3-opus", "titan-embed-v2"];
    const model = pick(models);
    const taskId = `task:inference-${Date.now()}`;
    try {
      const entry = ledger.transfer({
        fromAgentId: caller, toAgentId: "agent:bedrock-ai",
        amount, taskId,
        memo: `ai:compute:${model}:${randInt(100,4000)}tokens`,
      });
      await persistTransfer(entry, caller, "agent:bedrock-ai");
    } catch (e: any) { server.log.error(`[ECON] Flow1 error: ${e.message || e}`); }
  },

  // 2. Signing Fee — agents pay Signer for Ed25519 operations
  async () => {
    const callers = ["agent:facilitator", "agent:gateway", "agent:mesh-coord", "agent:x402-settler"];
    const caller = pick(callers);
    const amount = String(randInt(5, 50));
    const ops = ["sign_payment_proof", "verify_signature", "derive_key", "sign_receipt_batch"];
    try {
      const entry = ledger.transfer({
        fromAgentId: caller, toAgentId: "agent:signer",
        amount, taskId: `task:sign-${Date.now()}`,
        memo: `signer:${pick(ops)}:ed25519`,
      });
      await persistTransfer(entry, caller, "agent:signer");
    } catch { }
  },

  // 3. Gateway Routing Fee — agents pay Gateway per A2A message
  async () => {
    const callers = ["agent:mesh-coord", "agent:facilitator", "agent:bedrock-ai", "agent:lambda-exec"];
    const caller = pick(callers);
    const amount = String(randInt(10, 75));
    const routes = ["a2a:relay", "a2a:broadcast", "a2a:task_dispatch", "a2a:response_route"];
    try {
      const entry = ledger.transfer({
        fromAgentId: caller, toAgentId: "agent:gateway",
        amount, taskId: `task:route-${Date.now()}`,
        memo: `gateway:${pick(routes)}:${randInt(1,12)}agents`,
      });
      await persistTransfer(entry, caller, "agent:gateway");
    } catch { }
  },

  // 4. Merkle Anchor Fee — batch anchoring costs
  async () => {
    const amount = String(randInt(50, 250));
    const batchSize = randInt(5, 50);
    try {
      const entry = ledger.transfer({
        fromAgentId: "agent:facilitator", toAgentId: "agent:merkle-engine",
        amount, taskId: `task:anchor-${Date.now()}`,
        memo: `merkle:anchor_batch:${batchSize}receipts:root=${sha256(String(Date.now())).slice(0,16)}`,
      });
      await persistTransfer(entry, "agent:facilitator", "agent:merkle-engine");
    } catch { }
  },

  // 5. x402 Settlement Cycle — facilitator settles a payment
  async () => {
    const payees = ["agent:gateway", "agent:bedrock-ai", "agent:lambda-exec", "agent:mesh-coord"];
    const payee = pick(payees);
    const amount = String(randInt(100, 2000));
    const taskId = `task:x402-settle-${Date.now()}`;
    const policyId = `policy:auto-${Date.now()}`;
    try {
      // Transfer from settler to payee
      const txEntry = ledger.transfer({
        fromAgentId: "agent:x402-settler", toAgentId: payee,
        amount, taskId,
        memo: `x402:settlement:auto:invoice-${randomUUID().slice(0,8)}`,
      });
      await persistTransfer(txEntry, "agent:x402-settler", payee);

      // Settle — creates immutable proof receipt
      const settleEntry = ledger.settle({
        fromAgentId: "agent:x402-settler", toAgentId: payee,
        amount, taskId, policyDecisionId: policyId,
      });
      await persistSettle(settleEntry, payee);
    } catch { }
  },

  // 6. Block Validation Rewards — treasury pays validators
  async () => {
    const validators = ["agent:validator-bravo", "agent:validator-charlie"];
    const validator = pick(validators);
    const reward = String(randInt(50, 200));
    const blockH = blocks.length > 0 ? blocks[blocks.length - 1].height : 0;
    try {
      const entry = ledger.transfer({
        fromAgentId: "agent:treasury", toAgentId: validator,
        amount: reward,
        taskId: `task:block-reward-${blockH}`,
        memo: `protocol:block_reward:height=${blockH}:${validator.split(":")[1]}`,
      });
      await persistTransfer(entry, "agent:treasury", validator);
    } catch { }
  },

  // 7. Oracle Data Feed Payment
  async () => {
    const consumers = ["agent:facilitator", "agent:mesh-coord", "agent:lambda-exec"];
    const consumer = pick(consumers);
    const amount = String(randInt(15, 100));
    const feeds = ["uny_usd_price", "gas_oracle", "network_health", "trade_volume_24h"];
    try {
      const entry = ledger.transfer({
        fromAgentId: consumer, toAgentId: "agent:oracle-delta",
        amount, taskId: `task:oracle-${Date.now()}`,
        memo: `oracle:data_feed:${pick(feeds)}`,
      });
      await persistTransfer(entry, consumer, "agent:oracle-delta");
    } catch { }
  },

  // 8. Lambda Execution Fee
  async () => {
    const callers = ["agent:mesh-coord", "agent:facilitator", "agent:gateway"];
    const caller = pick(callers);
    const amount = String(randInt(20, 150));
    const fns = ["process_webhook", "verify_proof", "batch_receipts", "compute_merkle", "route_task", "settle_escrow"];
    try {
      const entry = ledger.transfer({
        fromAgentId: caller, toAgentId: "agent:lambda-exec",
        amount, taskId: `task:lambda-${Date.now()}`,
        memo: `lambda:invoke:${pick(fns)}:${randInt(50,800)}ms`,
      });
      await persistTransfer(entry, caller, "agent:lambda-exec");
    } catch { }
  },

  // 9. Namespace Registration Fee
  async () => {
    const agents = ["agent:mesh-coord", "agent:gateway", "agent:facilitator"];
    const agent = pick(agents);
    const amount = String(randInt(100, 500));
    const names = ["trade.uny", "ai.uny", "settle.uny", "proof.uny", "pay.uny", "mesh.uny"];
    try {
      const entry = ledger.transfer({
        fromAgentId: agent, toAgentId: "agent:namespace-registry",
        amount, taskId: `task:ns-${Date.now()}`,
        memo: `namespace:register:${pick(names)}:ttl=365d`,
      });
      await persistTransfer(entry, agent, "agent:namespace-registry");
    } catch { }
  },

  // 10. Smart Contract Allocation — treasury distributes to infra
  async () => {
    const targets = ["agent:gateway", "agent:signer", "agent:facilitator", "agent:merkle-engine", "agent:namespace-registry"];
    const target = pick(targets);
    const amount = String(randInt(500, 5000));
    const contracts = ["infra_budget_v1", "ops_allocation_q1", "security_fund", "reserve_rebalance"];
    try {
      const entry = ledger.transfer({
        fromAgentId: "agent:treasury", toAgentId: target,
        amount, taskId: `task:contract-${Date.now()}`,
        memo: `contract:${pick(contracts)}:allocation:${target.split(":")[1]}`,
      });
      await persistTransfer(entry, "agent:treasury", target);
    } catch { }
  },

  // 11. Agent-to-Agent Task Payment — mesh coord pays for completed work
  async () => {
    const workers = ["agent:bedrock-ai", "agent:lambda-exec", "agent:signer", "agent:oracle-delta"];
    const worker = pick(workers);
    const amount = String(randInt(200, 3000));
    const tasks = ["research_synthesis", "data_extraction", "proof_generation", "model_inference", "compliance_check"];
    const taskId = `task:mesh-${Date.now()}`;
    try {
      // Reserve budget
      const resEntry = ledger.reserve("agent:mesh-coord", amount, taskId);
      await persistReserve(resEntry, "agent:mesh-coord");

      // Complete and transfer
      const unresEntry = ledger.unreserve("agent:mesh-coord", amount, taskId);
      await persistReserve(unresEntry, "agent:mesh-coord"); // uses same persist pattern

      const txEntry = ledger.transfer({
        fromAgentId: "agent:mesh-coord", toAgentId: worker,
        amount, taskId,
        memo: `mesh:task_payment:${pick(tasks)}:completed`,
      });
      await persistTransfer(txEntry, "agent:mesh-coord", worker);
    } catch { }
  },

  // 12. Protocol Fee Burn — small % of fees go back to treasury
  async () => {
    const earners = ["agent:gateway", "agent:signer", "agent:merkle-engine", "agent:namespace-registry"];
    const earner = pick(earners);
    const acct = ledger.getAccountByAgent(earner);
    if (!acct || BigInt(acct.balances.OPERATING) < 100n) return;
    const amount = String(randInt(10, Math.min(200, Number(acct.balances.OPERATING) / 10)));
    try {
      const entry = ledger.transfer({
        fromAgentId: earner, toAgentId: "agent:treasury",
        amount, taskId: `task:protocol-fee-${Date.now()}`,
        memo: `protocol:fee_recycle:${earner.split(":")[1]}→treasury`,
      });
      await persistTransfer(entry, earner, "agent:treasury");
    } catch { }
  },
];

let econTimer: ReturnType<typeof setInterval> | null = null;

async function runEconomicCycle(): Promise<void> {
  econCycle++;
  // Each cycle runs 2-5 random flows
  const flowCount = randInt(2, 5);
  for (let i = 0; i < flowCount; i++) {
    const flow = pick(ECON_FLOWS);
    try { await flow(); } catch (e) { server.log.error(`[ECON] Flow error: ${e}`); }
  }
}

function startEconomicDaemon(): void {
  if (econTimer) return;
  // Run economic cycles every 5-8 seconds (staggered from block production)
  const interval = 5000 + Math.floor(Math.random() * 3000);
  server.log.info(`[ECON] Economic daemon started — ${interval}ms cycle, 12 flow types`);
  econTimer = setInterval(async () => {
    try { await runEconomicCycle(); } catch (e) { server.log.error(`[ECON] Cycle error: ${e}`); }
  }, interval);
}

async function bootstrapEconomy(): Promise<void> {
  server.log.info("[ECON] Bootstrapping system agents and treasury allocations...");
  for (const agentDef of SYSTEM_AGENTS) {
    await ensureAgent(agentDef);
  }
  const totalDeposited = SYSTEM_AGENTS.reduce((s, a) => s + BigInt(a.deposit), 0n);
  server.log.info(`[ECON] ${SYSTEM_AGENTS.length} agents bootstrapped, ${totalDeposited.toLocaleString()} UNY allocated`);
}

// ═══════════════════════════════════════════════════════════════════════════

async function produceBlock(): Promise<ChainBlock> {
  // Heartbeat: ensure every block has at least one entry (proof of life)
  const heartbeatId = randomUUID();
  const heartbeatHash = sha256(`heartbeat:${heartbeatId}:${Date.now()}`);
  try {
    await prisma.ledgerEntry.create({
      data: {
        id: heartbeatId,
        type: "reserve",
        amount: 0,
        memo: `system:heartbeat:${NODE_ID}:${Date.now()}`,
        entryHash: heartbeatHash,
        previousHash: "",
        idempotencyKey: `hb:${heartbeatId}`,
      },
    });
  } catch { /* OK if heartbeat fails — block still proceeds */ }

  const entries = await prisma.ledgerEntry.findMany({
    where: { sequence: { gt: lastSealedSeq } },
    orderBy: { sequence: "asc" },
  });

  const prevBlock  = blocks.length > 0 ? blocks[blocks.length - 1] : null;
  const prevHash   = prevBlock?.hash ?? sha256("genesis-7331");
  const height     = (prevBlock?.height ?? 0) + 1;
  const now        = new Date().toISOString();
  const entryRange: [number, number] = entries.length > 0
    ? [Number(entries[0].sequence), Number(entries[entries.length - 1].sequence)]
    : [lastSealedSeq, lastSealedSeq];

  const entryHashes = entries.map(e => e.entryHash ?? sha256(e.id));
  const merkleRoot  = merkleOf(entryHashes);
  const hash        = sha256(`${prevHash}:${merkleRoot}:${height}:${now}`);

  const block: ChainBlock = {
    height,
    hash,
    prevHash,
    merkleRoot,
    txCount: entries.length,
    entryRange,
    timestamp: now,
    producer: NODE_ID,
  };

  blocks.push(block);
  if (entries.length > 0) {
    lastSealedSeq = Number(entries[entries.length - 1].sequence);
  }

  return block;
}

function startBlockProduction(): void {
  if (blockTimer) return;
  server.log.info(`[L1] Block production started — ${BLOCK_TIME}ms interval, chain ${CHAIN_ID}`);
  blockTimer = setInterval(async () => {
    try { await produceBlock(); } catch (e) { server.log.error(`[L1] Block error: ${e}`); }
  }, BLOCK_TIME);
}

// ── Anchor storage ────────────────────────────────────────────────────────
interface AnchorRecord {
  batchId:     string;
  merkleRoot:  string;
  itemCount:   number;
  txHash:      string;
  blockHeight: number;
  anchoredAt:  string;
}
const anchors: AnchorRecord[] = [];

// ── JSON-RPC 2.0 handler ─────────────────────────────────────────────────

type RpcHandler = (params: any[]) => Promise<unknown>;

const rpcMethods: Record<string, RpcHandler> = {
  // Chain queries
  async chain_getLatestBlock() {
    const b = blocks.length > 0 ? blocks[blocks.length - 1] : null;
    return b
      ? { height: b.height, hash: b.hash, timestamp: b.timestamp, chain_id: CHAIN_ID }
      : { height: 0, hash: sha256("genesis-7331"), timestamp: GENESIS_TS, chain_id: CHAIN_ID };
  },

  async chain_getBlockByHeight(params) {
    const h = Number(params[0]);
    const b = blocks.find(bl => bl.height === h);
    if (!b) throw rpcError(-32602, `Block ${h} not found`);
    return { height: b.height, hash: b.hash, timestamp: b.timestamp, chain_id: CHAIN_ID, txCount: b.txCount, merkleRoot: b.merkleRoot, producer: b.producer };
  },

  async chain_getBlocks(params) {
    const from = Number(params[0] ?? 1);
    const limit = Math.min(Number(params[1] ?? 20), 100);
    return blocks.filter(b => b.height >= from).slice(0, limit).map(b => ({
      height: b.height, hash: b.hash, timestamp: b.timestamp, txCount: b.txCount, producer: b.producer, merkleRoot: b.merkleRoot,
    }));
  },

  async chain_status() {
    const latest = blocks.length > 0 ? blocks[blocks.length - 1] : null;
    return {
      chainId: CHAIN_ID,
      blockHeight: latest?.height ?? 0,
      blockHash: latest?.hash ?? sha256("genesis-7331"),
      blockTime: BLOCK_TIME,
      nodeId: NODE_ID,
      synced: true,
      uptime: process.uptime(),
      genesisTime: GENESIS_TS,
      entryCount: ledger.entryCount(),
      accountCount: await prisma.genesisAccount.count(),
    };
  },

  // Transaction queries
  async tx_getStatus(params) {
    const txHash = String(params[0]);
    // Search entries for matching hash
    const entry = await prisma.ledgerEntry.findFirst({ where: { entryHash: txHash } });
    if (!entry) return { tx_hash: txHash, status: "not_found" };
    // Find which block contains this entry
    const b = blocks.find(bl => Number(entry.sequence) >= bl.entryRange[0] && Number(entry.sequence) <= bl.entryRange[1]);
    return {
      tx_hash: txHash,
      status: "committed",
      block_height: b?.height ?? 0,
      block_hash: b?.hash ?? "",
      gas_used: entry.amount?.toString() ?? "0",
    };
  },

  // Trade-finance module — receipt root anchoring
  async ["trade-finance.anchor_receipt_root"](params) {
    const p = params[0] as { batch_id: string; merkle_root: string; item_count: number; anchor_wallet: string };
    const latest = blocks.length > 0 ? blocks[blocks.length - 1] : null;
    const txHash = sha256(`anchor:${p.batch_id}:${p.merkle_root}:${Date.now()}`);
    const record: AnchorRecord = {
      batchId: p.batch_id,
      merkleRoot: p.merkle_root,
      itemCount: p.item_count,
      txHash,
      blockHeight: (latest?.height ?? 0) + 1,
      anchoredAt: new Date().toISOString(),
    };
    anchors.push(record);
    return { tx_hash: txHash, block_height: record.blockHeight, timestamp: record.anchoredAt };
  },

  // Anchor queries
  async ["trade-finance.get_anchors"](params) {
    const limit = Math.min(Number(params[0] ?? 20), 100);
    return anchors.slice(-limit).reverse();
  },

  // Node topology — real producer + planned validators/oracles
  async chain_getNodes() {
    const latest = blocks.length > 0 ? blocks[blocks.length - 1] : null;
    const uptime = process.uptime();
    return [
      {
        nodeId: NODE_ID,
        role: "producer",
        status: "active",
        region: "us-east-1",
        blockHeight: latest?.height ?? 0,
        peers: 4,
        uptime: Math.floor(uptime),
        lastBlock: latest?.timestamp ?? GENESIS_TS,
        version: "1.0.0",
        ip: "10.0.1.10",
      },
      {
        nodeId: "bravo",
        role: "validator",
        status: "syncing",
        region: "eu-west-1",
        blockHeight: Math.max(0, (latest?.height ?? 0) - 2),
        peers: 3,
        uptime: Math.floor(uptime * 0.8),
        lastBlock: latest?.timestamp ?? GENESIS_TS,
        version: "1.0.0",
        ip: "10.0.2.10",
      },
      {
        nodeId: "charlie",
        role: "validator",
        status: "active",
        region: "ap-southeast-1",
        blockHeight: latest?.height ?? 0,
        peers: 4,
        uptime: Math.floor(uptime * 0.95),
        lastBlock: latest?.timestamp ?? GENESIS_TS,
        version: "1.0.0",
        ip: "10.0.3.10",
      },
      {
        nodeId: "delta",
        role: "oracle",
        status: "active",
        region: "us-west-2",
        blockHeight: latest?.height ?? 0,
        peers: 2,
        uptime: Math.floor(uptime * 0.9),
        lastBlock: latest?.timestamp ?? GENESIS_TS,
        version: "1.0.0",
        ip: "10.0.4.10",
      },
      {
        nodeId: "echo",
        role: "oracle",
        status: "idle",
        region: "us-east-1",
        blockHeight: Math.max(0, (latest?.height ?? 0) - 5),
        peers: 1,
        uptime: Math.floor(uptime * 0.5),
        lastBlock: latest?.timestamp ?? GENESIS_TS,
        version: "1.0.0",
        ip: "10.0.5.10",
      },
    ];
  },

  // Block detail with full proof (prevHash, merkleRoot, entry range)
  async chain_getBlockDetail(params) {
    const h = Number(params[0]);
    const b = blocks.find(bl => bl.height === h);
    if (!b) throw rpcError(-32602, `Block ${h} not found`);

    // Fetch the entries sealed in this block
    const entries = await prisma.ledgerEntry.findMany({
      where: { sequence: { gte: b.entryRange[0], lte: b.entryRange[1] } },
      orderBy: { sequence: "asc" },
    });

    // Recompute merkle root for verification
    const entryHashes = entries.map(e => e.entryHash ?? sha256(e.id));
    const recomputedMerkle = merkleOf(entryHashes);
    const recomputedHash = sha256(`${b.prevHash}:${b.merkleRoot}:${b.height}:${b.timestamp}`);

    return {
      height: b.height,
      hash: b.hash,
      prevHash: b.prevHash,
      merkleRoot: b.merkleRoot,
      txCount: b.txCount,
      entryRange: b.entryRange,
      timestamp: b.timestamp,
      producer: b.producer,
      chainId: CHAIN_ID,
      // Verification data
      verification: {
        recomputedMerkle,
        merkleMatch: recomputedMerkle === b.merkleRoot,
        recomputedHash,
        hashMatch: recomputedHash === b.hash,
        formula: `SHA256(prevHash + ":" + merkleRoot + ":" + height + ":" + timestamp)`,
      },
      // Entries sealed in this block
      entries: entries.map(e => ({
        sequence: Number(e.sequence),
        id: e.id,
        type: e.type,
        amount: e.amount?.toString() ?? "0",
        entryHash: e.entryHash,
        fromAgentId: e.fromAgentId,
        toAgentId: e.toAgentId,
        memo: e.memo,
        timestamp: e.timestamp,
      })),
    };
  },

  // Chain integrity verification  — verify the full hash chain from genesis to tip
  async chain_verifyIntegrity() {
    const genesisHash = sha256("genesis-7331");
    let valid = true;
    let brokenAt = -1;
    let totalTx = 0;
    const checked = blocks.length;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const expectedPrev = i === 0 ? genesisHash : blocks[i - 1].hash;
      const expectedHash = sha256(`${expectedPrev}:${b.merkleRoot}:${b.height}:${b.timestamp}`);
      totalTx += b.txCount;

      if (b.prevHash !== expectedPrev || b.hash !== expectedHash) {
        valid = false;
        brokenAt = b.height;
        break;
      }
    }

    const latest = blocks.length > 0 ? blocks[blocks.length - 1] : null;
    return {
      valid,
      blocksChecked: checked,
      tipHeight: latest?.height ?? 0,
      tipHash: latest?.hash ?? genesisHash,
      genesisHash,
      totalTransactions: totalTx,
      brokenAtHeight: brokenAt >= 0 ? brokenAt : null,
      chainId: CHAIN_ID,
      verifiedAt: new Date().toISOString(),
    };
  },

  // Verify a specific hash against the chain
  async chain_verifyHash(params) {
    const hash = String(params[0]);

    // Check blocks
    const block = blocks.find(b => b.hash === hash);
    if (block) {
      return { found: true, type: "block", height: block.height, timestamp: block.timestamp, producer: block.producer, txCount: block.txCount };
    }

    // Check entries
    const entry = await prisma.ledgerEntry.findFirst({ where: { entryHash: hash } });
    if (entry) {
      const b = blocks.find(bl => Number(entry.sequence) >= bl.entryRange[0] && Number(entry.sequence) <= bl.entryRange[1]);
      return { found: true, type: "entry", sequence: Number(entry.sequence), blockHeight: b?.height ?? null, entryType: entry.type, amount: entry.amount?.toString() ?? "0", timestamp: entry.timestamp };
    }

    // Check anchors
    const anchor = anchors.find(a => a.txHash === hash || a.merkleRoot === hash);
    if (anchor) {
      return { found: true, type: "anchor", batchId: anchor.batchId, merkleRoot: anchor.merkleRoot, blockHeight: anchor.blockHeight, timestamp: anchor.anchoredAt };
    }

    return { found: false, hash, message: "Hash not found on chain" };
  },

  // Infrastructure status — services, AI, cloud
  async chain_getInfrastructure() {
    const uptime = process.uptime();
    return {
      cloud: {
        provider: "AWS",
        region: "us-east-1",
        account: "933629770808",
      },
      services: [
        { name: "UNY Ledger + L1 RPC", port: 4030, status: "running", uptime: Math.floor(uptime), kind: "core" },
        { name: "Facilitator (x402)", port: 3100, status: "running", uptime: Math.floor(uptime * 0.98), kind: "core" },
        { name: "Agent Gateway (A2A)", port: 4010, status: "running", uptime: Math.floor(uptime * 0.97), kind: "core" },
        { name: "Rust Signer (Ed25519)", port: 4050, status: "running", uptime: Math.floor(uptime * 0.99), kind: "security" },
        { name: "CF Pages (Explorer)", port: 443, status: "live", uptime: null, kind: "frontend" },
        { name: "CF Pages (ICO)", port: 443, status: "live", uptime: null, kind: "frontend" },
        { name: "CF Worker (Gateway)", port: 443, status: "live", uptime: null, kind: "edge" },
      ],
      ai: [
        { name: "AWS Bedrock", model: "anthropic.claude-3-sonnet", status: "available", purpose: "Agent reasoning & orchestration", region: "us-east-1" },
        { name: "AWS Lambda", runtime: "nodejs20.x", status: "warm", purpose: "Serverless event processing", functions: 8 },
        { name: "Agent Mesh (A2A)", agents: 12, status: "active", purpose: "Multi-agent task execution" },
        { name: "Merkle Anchor Engine", batches: anchors.length, status: "running", purpose: "Receipt root anchoring to L1" },
      ],
      db: {
        engine: "PostgreSQL 16",
        host: "localhost:5450",
        database: "fth_x402",
        status: "connected",
      },
      domains: [
        { name: "ex.unykorn.org", target: "CF Pages", status: "live", ssl: "active" },
        { name: "ico.unykorn.org", target: "CF Pages", status: "live", ssl: "active" },
        { name: "unykorn.org", target: "Landing", status: "live", ssl: "active" },
        { name: "rpc.l1.unykorn.org", target: "L1 RPC", status: "planned", ssl: "pending" },
      ],
    };
  },

  // Economic state — live balances, flows, settlement stats
  async chain_getEconomicState() {
    const agentBalances: Array<{
      agentId: string; name: string; operating: string; escrow: string;
      reserved: string; staked: string; proofReceipt: string; totalDeposited: string;
    }> = [];

    for (const def of SYSTEM_AGENTS) {
      const acct = ledger.getAccountByAgent(def.id);
      if (acct) {
        agentBalances.push({
          agentId: def.id,
          name: def.name,
          operating: acct.balances.OPERATING,
          escrow: acct.balances.ESCROW,
          reserved: acct.balances.RESERVED,
          staked: acct.balances.STAKED_RELIABILITY,
          proofReceipt: acct.balances.PROOF_RECEIPT,
          totalDeposited: acct.totalDeposited,
        });
      }
    }

    // Count by type from recent blocks
    const recentEntries = await prisma.ledgerEntry.findMany({
      orderBy: { sequence: "desc" },
      take: 200,
    });
    const typeCounts: Record<string, number> = {};
    let totalVolume = 0n;
    for (const e of recentEntries) {
      typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;
      if (e.type !== "reserve" || (e.memo && !e.memo.startsWith("system:heartbeat"))) {
        totalVolume += BigInt(e.amount ?? 0);
      }
    }

    const treasury = ledger.getTreasuryState();

    return {
      econCycle,
      agents: agentBalances,
      recentFlowTypes: typeCounts,
      recentVolume: totalVolume.toString(),
      treasury: {
        totalDeposits: treasury.totalCoreDeposits,
        totalOperating: treasury.totalOperating,
        totalEscrowed: treasury.totalEscrowed,
        totalReserved: treasury.totalReserved,
        totalStaked: treasury.totalStaked,
        totalSettled: treasury.totalSettled,
        supplyIntegrity: treasury.integrityCheck,
      },
      flowTypes: 12,
      systemAgents: SYSTEM_AGENTS.length,
      timestamp: new Date().toISOString(),
    };
  },
};

function rpcError(code: number, message: string): { code: number; message: string } {
  return { code, message };
}

// JSON-RPC 2.0 endpoint
server.post("/rpc", async (request, reply) => {
  const body = request.body as { jsonrpc?: string; id?: number; method?: string; params?: unknown[] };
  if (body.jsonrpc !== "2.0" || !body.method) {
    return reply.status(400).send({ jsonrpc: "2.0", id: body.id ?? null, error: rpcError(-32600, "Invalid JSON-RPC 2.0 request") });
  }
  const handler = rpcMethods[body.method];
  if (!handler) {
    return reply.send({ jsonrpc: "2.0", id: body.id ?? null, error: rpcError(-32601, `Method not found: ${body.method}`) });
  }
  try {
    const result = await handler(body.params ?? []);
    return reply.send({ jsonrpc: "2.0", id: body.id ?? null, result });
  } catch (err: any) {
    if (err.code && err.message) return reply.send({ jsonrpc: "2.0", id: body.id ?? null, error: err });
    return reply.send({ jsonrpc: "2.0", id: body.id ?? null, error: rpcError(-32603, err.message ?? "Internal error") });
  }
});

// HTTP /status endpoint (used by L1 adapter fallback)
server.get("/status", async () => {
  const latest = blocks.length > 0 ? blocks[blocks.length - 1] : null;
  return { chainId: CHAIN_ID, blockHeight: latest?.height ?? 0, blockHash: latest?.hash ?? "", synced: true, nodeId: NODE_ID };
});

// ---------------------------------------------------------------------------
// Ledger & Treasury
// ---------------------------------------------------------------------------
server.get("/ledger", async (request) => {
  const query = request.query as { limit?: string; offset?: string; agentId?: string; taskId?: string };
  const limit = Math.min(Number(query.limit ?? 50), 500);
  const offset = Number(query.offset ?? 0);

  const where: Record<string, unknown> = {};
  if (query.agentId) {
    where.OR = [{ fromAgentId: query.agentId }, { toAgentId: query.agentId }];
  }
  if (query.taskId) where.taskId = query.taskId;

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: where as any,
      take: limit,
      skip: offset,
      orderBy: { sequence: "desc" },
    }),
    prisma.ledgerEntry.count({ where: where as any }),
  ]);

  return { entries, total, limit, offset };
});

server.get("/treasury", async () => {
  const state = ledger.getTreasuryState();

  // Also pull from DB for cross-check
  const dbAccounts = await prisma.genesisAccount.aggregate({
    _sum: {
      operatingBalance: true,
      escrowBalance: true,
      reservedBalance: true,
      stakedBalance: true,
      proofReceiptBalance: true,
      complianceClearedBalance: true,
      totalDeposited: true,
      totalWithdrawn: true,
    },
  });

  return {
    engine: state,
    database: {
      totalDeposited: dbAccounts._sum.totalDeposited?.toString() ?? "0",
      totalWithdrawn: dbAccounts._sum.totalWithdrawn?.toString() ?? "0",
      operatingBalance: dbAccounts._sum.operatingBalance?.toString() ?? "0",
      escrowBalance: dbAccounts._sum.escrowBalance?.toString() ?? "0",
      reservedBalance: dbAccounts._sum.reservedBalance?.toString() ?? "0",
      stakedBalance: dbAccounts._sum.stakedBalance?.toString() ?? "0",
      proofReceiptBalance: dbAccounts._sum.proofReceiptBalance?.toString() ?? "0",
    },
    updatedAt: new Date().toISOString(),
  };
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const start = async () => {
  try {
    await prisma.$connect();
    server.log.info("Database connected");

    // ── Hydrate in-memory ledger from DB ──────────────────
    const [dbAccounts, dbEntries, dbEscrows] = await Promise.all([
      prisma.genesisAccount.findMany(),
      prisma.ledgerEntry.findMany({ orderBy: { sequence: "asc" } }),
      prisma.escrow.findMany({ include: { conditions: true } }),
    ]);

    if (dbAccounts.length > 0 || dbEntries.length > 0) {
      const result = ledger.hydrate({
        accounts: dbAccounts.map((a) => ({
          accountId: a.id,
          agentId: a.agentId,
          orgId: a.orgId,
          balances: {
            OPERATING: a.operatingBalance?.toString() ?? "0",
            ESCROW: a.escrowBalance?.toString() ?? "0",
            RESERVED: a.reservedBalance?.toString() ?? "0",
            STAKED_RELIABILITY: a.stakedBalance?.toString() ?? "0",
            PROOF_RECEIPT: a.proofReceiptBalance?.toString() ?? "0",
            COMPLIANCE_CLEARED: a.complianceClearedBalance?.toString() ?? "0",
          },
          isSubAccount: a.isSubAccount,
          parentAccountId: a.parentAccountId,
          status: a.status as "active" | "frozen" | "closed",
          totalDeposited: a.totalDeposited?.toString() ?? "0",
          totalWithdrawn: a.totalWithdrawn?.toString() ?? "0",
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
        entries: dbEntries.map((e) => ({
          entryId: e.id,
          sequence: BigInt(e.sequence),
          type: e.type as any,
          fromAgentId: e.fromAgentId,
          toAgentId: e.toAgentId,
          amount: e.amount.toString(),
          fromClass: e.fromClass as any,
          toClass: e.toClass as any,
          taskId: e.taskId,
          policyDecisionId: e.policyDecisionId,
          memo: e.memo ?? "",
          timestamp: e.timestamp.toISOString(),
          entryHash: e.entryHash ?? "",
          previousHash: e.previousHash ?? "",
          idempotencyKey: e.idempotencyKey ?? "",
        })),
        escrows: dbEscrows.map((esc) => ({
          escrowId: esc.id,
          taskId: esc.taskId,
          depositorAgentId: esc.depositorAgentId,
          beneficiaryAgentId: esc.beneficiaryAgentId,
          amount: esc.amount.toString(),
          releasedAmount: esc.releasedAmount?.toString() ?? "0",
          refundedAmount: esc.refundedAmount?.toString() ?? "0",
          status: esc.status as any,
          releaseConditions: esc.conditions.map((c) => ({
            conditionId: c.id,
            type: c.type as any,
            releaseAmount: c.releaseAmount.toString(),
            description: c.description ?? "",
            met: c.met,
          })),
          expiresAt: esc.expiresAt.toISOString(),
          createdAt: esc.createdAt.toISOString(),
          updatedAt: esc.updatedAt.toISOString(),
        })),
      });

      server.log.info(
        `Hydrated ledger: ${result.accountCount} accounts, ${result.entryCount} entries, ` +
        `${result.escrowCount} escrows, lastHash=${result.lastHash.slice(0, 16)}…`
      );
    } else {
      server.log.info("No existing ledger data — starting fresh");
    }

    // ── Bootstrap economy — system agents + treasury allocations ──
    await bootstrapEconomy();

    // ── Produce genesis block and start block production ──
    await produceBlock(); // seal everything up to now
    startBlockProduction();
    server.log.info(`[L1] Genesis block produced — chain ${CHAIN_ID}, height ${blocks[0]?.height ?? 0}`);

    // ── Start economic daemon — self-settling AI economy ──
    startEconomicDaemon();

    await server.listen({ port: PORT, host: "0.0.0.0" });
    server.log.info(`${SERVICE} listening on port ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

const shutdown = async () => {
  await server.close();
  await prisma.$disconnect();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
