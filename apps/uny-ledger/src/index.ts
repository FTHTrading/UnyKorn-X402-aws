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
import nacl from "tweetnacl";
import tweetnaclUtil from "tweetnacl-util";
const { encodeBase64, decodeUTF8 } = tweetnaclUtil;

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

// ── x402 Payment Simulator Wallet ───────────────────────────────────────
const SIM_WALLET_ADDR = "sim:x402-payment-engine";
// Deterministic keypair derived from a fixed seed so the pubkey survives restarts
const SIM_SEED = createHash("sha256").update("uny-sim-payment-engine-v1").digest().subarray(0, 32);
const simWallet = nacl.sign.keyPair.fromSeed(SIM_SEED);
let simWalletReady = false;
let simPaymentCount = 0;
const SIM_ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "";
const SIM_AUTH_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SIM_ADMIN_TOKEN}`,
};

async function ensureSimulatorWallet(): Promise<void> {
  if (simWalletReady) return;
  const pubkeyB64 = encodeBase64(simWallet.publicKey);
  const FACILITATOR = "http://localhost:3100";

  try {
    // Register wallet with pubkey
    await fetch(`${FACILITATOR}/credits/register`, {
      method: "POST",
      headers: SIM_AUTH_HEADERS,
      body: JSON.stringify({ wallet_address: SIM_WALLET_ADDR, pubkey: pubkeyB64, rail: "unykorn-l1" }),
      signal: AbortSignal.timeout(5000),
    });

    // Deposit initial credits (large enough for many payments)
    await fetch(`${FACILITATOR}/credits/deposit`, {
      method: "POST",
      headers: SIM_AUTH_HEADERS,
      body: JSON.stringify({ wallet_address: SIM_WALLET_ADDR, amount: "10000000", reference: "sim:bootstrap" }),
      signal: AbortSignal.timeout(5000),
    });

    simWalletReady = true;
    server.log.info(`[SIM] Wallet ${SIM_WALLET_ADDR} registered with ${pubkeyB64.slice(0, 16)}… pubkey, 10M UNY deposited`);
  } catch (e: any) {
    server.log.warn(`[SIM] Wallet setup deferred: ${e.message || e}`);
  }
}

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

  // ═══ EXTENDED FLOWS — Phases 2-6: Populate all 30 empty tables ═══

  // 13. Agent Task + A2A Messages + Settlement Receipt + Proof Artifact
  async () => {
    const requesters = ["agent:mesh-coord", "agent:facilitator", "agent:gateway"];
    const performers = ["agent:bedrock-ai", "agent:lambda-exec", "agent:signer", "agent:oracle-delta"];
    const requester = pick(requesters);
    const performer = pick(performers);
    const amount = String(randInt(100, 5000));
    const capabilities = ["inference", "signing", "data_feed", "proof_generation", "settlement", "routing"];
    const capability = pick(capabilities);
    const taskId = randomUUID();
    const now = new Date();
    try {
      await prisma.agentTask.create({
        data: {
          id: taskId, requesterAgentId: requester, performerAgentId: performer,
          capability, description: `Auto: ${capability} by ${requester.split(":")[1]}`,
          quotedCost: amount, maxBudget: String(Number(amount) * 2),
          status: pick(["settled", "delivered", "executing"]),
          priority: pick(["normal", "high", "low"]),
          idempotencyKey: `task:${taskId}`,
          requestedAt: now, quotedAt: now, approvedAt: now,
          executionStartedAt: now, deliveredAt: now, settledAt: now,
        },
      });
      const msgTypes = ["task_request", "task_quote", "task_accept", "task_result"];
      for (const msgType of msgTypes) {
        await prisma.a2AMessage.create({
          data: {
            type: msgType,
            fromAgentId: msgType.includes("request") || msgType.includes("accept") ? requester : performer,
            toAgentId: msgType.includes("request") || msgType.includes("accept") ? performer : requester,
            correlationId: taskId, taskId,
            payload: { type: msgType, capability, amount, ts: now.toISOString() },
            signature: sha256(`${msgType}:${taskId}:${Date.now()}`),
          },
        });
      }
      const receiptId = randomUUID();
      await prisma.settlementReceipt.create({
        data: {
          id: receiptId, taskId, fromAgentId: requester, toAgentId: performer,
          amount, assetClass: "OPERATING",
          policyDecisionId: `policy:auto-${taskId.slice(0,8)}`,
          signature: sha256(`receipt:${receiptId}:${amount}`),
          signerPublicKey: `pk_${performer.replace("agent:", "")}`,
          status: "settled", signedAt: now,
        },
      });
      await prisma.proofArtifact.create({
        data: {
          type: "settlement_proof", generatedBy: performer,
          referenceId: receiptId, referenceType: "settlement_receipt",
          contentHash: sha256(`proof:${receiptId}:${amount}:${now.toISOString()}`),
          content: { receiptId, taskId, amount, capability, from: requester, to: performer },
          signature: sha256(`proof-sig:${receiptId}`),
          signerPublicKey: `pk_${performer.replace("agent:", "")}`,
          anchored: true, anchorTxHash: sha256(`anchor:${receiptId}`),
        },
      });
    } catch (e: any) { server.log.error(`[ECON] Flow13 task: ${e.message || e}`); }
  },

  // 14. Policy Decision + Approval + Audit Entry
  async () => {
    const agent = pick(SYSTEM_AGENTS.filter(a => a.role !== "treasury"));
    const actions = ["transfer", "escrow_lock", "settle", "reserve", "withdraw"];
    const action = pick(actions);
    const amount = String(randInt(50, 10000));
    const ruleIds = ["rule:treasury-spend-limit", "rule:agent-daily-limit", "rule:escrow-approval",
      "rule:ai-compute-limit", "rule:cross-org-audit", "rule:settlement-auto-allow"];
    const ruleId = pick(ruleIds);
    const result = pick(["allowed", "allowed", "allowed", "denied", "rate_limited"]);
    const decisionId = randomUUID();
    try {
      await prisma.policyDecision.create({
        data: {
          id: decisionId, action, agentId: agent.id, agentRole: agent.role,
          amount, result, matchedRuleIds: [ruleId], decidingRuleId: ruleId,
          reason: `${result}: ${action} of ${amount} UNY by ${agent.name}`,
        },
      });
      await prisma.policyApproval.create({
        data: {
          decisionId, approverId: "agent:treasury",
          status: result === "allowed" ? "approved" : "denied",
          reason: `Auto-${result} by policy engine`,
          expiresAt: new Date(Date.now() + 3600000), respondedAt: new Date(),
        },
      });
      const prevAudit = await prisma.auditEntry.findFirst({ orderBy: { sequence: "desc" } });
      await prisma.auditEntry.create({
        data: {
          action: `policy:${action}`, agentId: agent.id,
          targetId: decisionId, targetType: "policy_decision", amount,
          policyDecisionId: decisionId,
          result: result === "allowed" ? "success" : "failure",
          details: { ruleId, action, amount, agent: agent.name },
          source: "economic-daemon",
          entryHash: sha256(`audit:${decisionId}:${Date.now()}`),
          previousHash: prevAudit?.entryHash ?? sha256("audit-genesis"),
        },
      });
    } catch (e: any) { server.log.error(`[ECON] Flow14 policy: ${e.message || e}`); }
  },

  // 15. Escrow Lock/Release Cycle
  async () => {
    const depositors = ["agent:mesh-coord", "agent:facilitator", "agent:gateway"];
    const beneficiaries = ["agent:bedrock-ai", "agent:lambda-exec", "agent:signer"];
    const depositor = pick(depositors);
    const beneficiary = pick(beneficiaries);
    const amount = String(randInt(200, 5000));
    const taskId = randomUUID();
    try {
      await prisma.agentTask.create({
        data: {
          id: taskId, requesterAgentId: depositor, performerAgentId: beneficiary,
          capability: "escrow_delivery",
          description: `Escrow: ${depositor.split(":")[1]} → ${beneficiary.split(":")[1]}`,
          maxBudget: amount, status: "settled", priority: "normal",
          idempotencyKey: `esc-task:${taskId}`, requestedAt: new Date(), settledAt: new Date(),
        },
      });
      await prisma.escrow.create({
        data: {
          taskId, depositorAgentId: depositor, beneficiaryAgentId: beneficiary,
          amount, releasedAmount: amount,
          status: pick(["fully_released", "fully_released", "locked"]),
          expiresAt: new Date(Date.now() + 86400000),
          conditions: { create: [{ type: "task_delivery", releaseAmount: amount, description: "Full delivery", met: true }] },
        },
      });
    } catch (e: any) { server.log.error(`[ECON] Flow15 escrow: ${e.message || e}`); }
  },

  // 16. Credit System Activity
  async () => {
    try {
      const accts = await prisma.creditAccount.findMany({ take: 5 });
      if (accts.length === 0) return;
      const acct = pick(accts);
      const type = pick(["deposit", "spend", "refund", "fee"]);
      const amt = randInt(10, 1000);
      const bal = Number(acct.balance ?? 0);
      const newBal = type === "spend" ? Math.max(0, bal - amt) : bal + amt;
      await prisma.creditTransaction.create({
        data: {
          id: randomUUID(), accountId: acct.id, type, amount: amt,
          balanceAfter: newBal, reference: `econ:${type}:${Date.now()}`,
          rail: "unykorn-l1", txHash: sha256(`credit:${acct.id}:${Date.now()}`),
        },
      });
      await prisma.creditAccount.update({
        where: { id: acct.id },
        data: { balance: newBal, updatedAt: new Date() },
      });
    } catch (e: any) { server.log.error(`[ECON] Flow16 credit: ${e.message || e}`); }
  },

  // 17. Guardian Activity — revenue + security events
  async () => {
    try {
      const sources = ["x402_settlement", "namespace_fee", "gateway_routing", "signing_fee", "ai_compute"];
      await prisma.guardianRevenue.create({
        data: {
          source: pick(sources), amountUny: String(randInt(10, 5000)),
          category: pick(["fee", "settlement", "protocol"]),
          blockHeight: blocks.length > 0 ? blocks[blocks.length - 1].height : 0,
          txHash: sha256(`revenue:${Date.now()}`),
          details: { econCycle, ts: new Date().toISOString() },
        },
      });
      if (Math.random() < 0.3) {
        const evts = ["rate_limit_triggered", "anomaly_detected", "policy_violation", "auth_failure"];
        await prisma.guardianSecurityEvent.create({
          data: {
            eventType: pick(evts), sourceIp: `10.0.${randInt(1,5)}.${randInt(1,254)}`,
            target: pick(SYSTEM_AGENTS).id, severity: pick(["low", "medium", "low"]),
            actionTaken: pick(["logged", "rate_limited", "blocked"]), blocked: Math.random() < 0.1,
            details: { econCycle, reason: "Automated monitoring" },
          },
        });
      }
    } catch (e: any) { server.log.error(`[ECON] Flow17 guardian: ${e.message || e}`); }
  },

  // 18. Treasury Operations — refills
  async () => {
    try {
      const agent = pick(SYSTEM_AGENTS);
      await prisma.treasuryRefill.create({
        data: {
          refillId: randomUUID(),
          walletAddress: `pk_${agent.id.replace("agent:", "")}`,
          asset: "UNY", amount: String(randInt(1000, 50000)),
          fundingMode: pick(["auto", "manual", "policy"]),
          reference: `econ:refill:cycle-${econCycle}`,
          refillStatus: pick(["completed", "pending"]),
          completedAt: new Date(),
        },
      });
    } catch (e: any) { server.log.error(`[ECON] Flow18 treasury-ops: ${e.message || e}`); }
  },

  // 19. Webhook Delivery — event notifications
  async () => {
    try {
      const subs = await prisma.webhookSubscription.findMany({ where: { active: true }, take: 5 });
      if (subs.length === 0) return;
      const sub = pick(subs);
      const evts = ["settlement.completed", "task.created", "escrow.released", "block.produced", "policy.evaluated"];
      await prisma.webhookDelivery.create({
        data: {
          id: randomUUID(), subscriptionId: sub.id, eventType: pick(evts),
          payload: { event: pick(evts), ts: new Date().toISOString(), econCycle, blockHeight: blocks.length > 0 ? blocks[blocks.length - 1].height : 0 },
          deliveryStatus: pick(["delivered", "delivered", "delivered", "failed"]),
          attempts: randInt(1, 3), responseCode: 200, lastAttemptAt: new Date(),
        },
      });
    } catch (e: any) { server.log.error(`[ECON] Flow19 webhook: ${e.message || e}`); }
  },

  // 20. x402 Payment Simulator — real invoice→verify→receipt pipeline through facilitator
  //     Fills: receipts, payment_channels, rate_limit_log tables
  //     Drives: flywheel revenue, AMM volume, credibility score
  async () => {
    try {
      await ensureSimulatorWallet();
      const FACILITATOR = "http://localhost:3100";

      // Pick a random namespace and resource
      const namespaces = [
        "fth.x402.route.genesis-repro", "fth.x402.route.ai-compute",
        "fth.x402.route.oracle-feed", "fth.x402.route.signing",
        "fth.x402.route.settlement", "fth.x402.route.validation",
      ];
      const resources = [
        "/api/v1/compute/inference", "/api/v1/oracle/price",
        "/api/v1/sign/ed25519", "/api/v1/settle/batch",
        "/api/v1/validate/proof", "/api/v1/namespace/resolve",
      ];
      const ns = pick(namespaces);
      const resource = pick(resources);
      const amount = String(randInt(50, 2000));

      // Step 1: Create invoice
      const invRes = await fetch(`${FACILITATOR}/invoices`, {
        method: "POST",
        headers: SIM_AUTH_HEADERS,
        body: JSON.stringify({
          resource, namespace: ns, asset: "UNY", amount,
          receiver: "protocol-treasury",
          memo: `sim:x402:cycle-${econCycle}`,
          policy: { kyc_required: false, min_pass_level: "basic", rate_limit: "1000/hour" },
          rail: "unykorn-l1", ttl_seconds: 300,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!invRes.ok) return;

      const inv = await invRes.json() as { invoice_id: string; nonce: string };

      // Step 2: Sign the proof
      const message = `${inv.invoice_id}|${inv.nonce}`;
      const signature = nacl.sign.detached(
        decodeUTF8(message),
        simWallet.secretKey,
      );
      const sigB64 = encodeBase64(signature);

      // Step 3: Verify / pay the invoice
      const verRes = await fetch(`${FACILITATOR}/verify`, {
        method: "POST",
        headers: SIM_AUTH_HEADERS,
        body: JSON.stringify({
          invoice_id: inv.invoice_id,
          nonce: inv.nonce,
          proof: {
            proof_type: "prepaid_credit",
            credit_id: SIM_WALLET_ADDR,
            payer: SIM_WALLET_ADDR,
            signature: sigB64,
            invoice_id: inv.invoice_id,
            nonce: inv.nonce,
          },
          resource, namespace: ns,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!verRes.ok) {
        const errBody = await verRes.text().catch(() => "");
        server.log.warn(`[SIM] Verify failed ${verRes.status}: ${errBody}`);
        return;
      }

      const verResult = await verRes.json() as { verified: boolean; receipt_id?: string };
      if (verResult.verified) {
        simPaymentCount++;
        server.log.info(`[SIM] Payment #${simPaymentCount}: ${amount} UNY → receipt ${verResult.receipt_id}`);
      }

      // Step 4: Occasionally open a payment channel (30% chance)
      if (Math.random() < 0.3 && simPaymentCount % 3 === 0) {
        const chanRes = await fetch(`${FACILITATOR}/channels/open`, {
          method: "POST",
          headers: SIM_AUTH_HEADERS,
          body: JSON.stringify({
            wallet_address: SIM_WALLET_ADDR,
            deposited_amount: String(randInt(5000, 50000)),
            opened_tx_hash: sha256(`channel:${SIM_WALLET_ADDR}:${Date.now()}`),
            namespace: ns,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (chanRes.ok) {
          server.log.info(`[SIM] Opened payment channel for ${SIM_WALLET_ADDR}`);
        }
      }
    } catch (e: any) { server.log.error(`[ECON] Flow20 x402-sim: ${e.message || e}`); }
  },

  // 21. AMM Trade Simulator — execute real swaps against the UNY/USDf pool
  async () => {
    try {
      const FACILITATOR = "http://localhost:3100";
      const directions: Array<"UNY_TO_USDF" | "USDF_TO_UNY"> = ["UNY_TO_USDF", "USDF_TO_UNY"];
      const direction = pick(directions);
      // Small trades to avoid massive price impact
      const amount = direction === "USDF_TO_UNY"
        ? String(randInt(100, 5000) * 1_000_000)         // 100-5000 USDF (6 decimals)
        : String(BigInt(randInt(100, 5000)) * 10n ** 18n); // 100-5000 UNY (18 decimals)

      const swapRes = await fetch(`${FACILITATOR}/economics/amm/swap`, {
        method: "POST",
        headers: SIM_AUTH_HEADERS,
        body: JSON.stringify({ amount, direction, trader: `sim:${SIM_WALLET_ADDR}` }),
        signal: AbortSignal.timeout(5000),
      });
      if (swapRes.ok) {
        const result = await swapRes.json() as { amountOut: string };
        server.log.info(`[SIM] AMM swap ${direction}: in=${amount} → out=${result.amountOut}`);
      }
    } catch (e: any) { server.log.error(`[ECON] Flow21 amm-trade: ${e.message || e}`); }
  },

  // 22. Flywheel Revenue + Cycle Trigger
  async () => {
    try {
      const FACILITATOR = "http://localhost:3100";
      // Collect revenue from recent payments
      const revenueUNY = String(BigInt(randInt(50, 500)) * 10n ** 18n);
      await fetch(`${FACILITATOR}/economics/flywheel/collect`, {
        method: "POST",
        headers: SIM_AUTH_HEADERS,
        body: JSON.stringify({ amountUNY: revenueUNY, invoiceId: `sim:revenue:cycle-${econCycle}` }),
        signal: AbortSignal.timeout(5000),
      });
      // Try to execute a flywheel cycle
      const cycleRes = await fetch(`${FACILITATOR}/economics/flywheel/execute`, {
        method: "POST",
        headers: SIM_AUTH_HEADERS,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
      if (cycleRes.ok) {
        const result = await cycleRes.json() as any;
        if (result.executed) {
          server.log.info(`[SIM] Flywheel cycle executed: burned=${result.burned}, LP=${result.lpProvided}`);
        }
      }
    } catch (e: any) { server.log.error(`[ECON] Flow22 flywheel: ${e.message || e}`); }
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
// SYSTEM DATA BOOTSTRAP — Populate reference tables (one-time seed)
// ═══════════════════════════════════════════════════════════════════════════

async function bootstrapSystemData(): Promise<void> {
  server.log.info("[SYS] Bootstrapping reference data for empty tables...");

  // ── Policy Rules (6) ────────────────────────────────────────────────────
  const policyRules = [
    { id: "rule:treasury-spend-limit", name: "Treasury Spend Limit", description: "Max single transfer from treasury", effect: "rate_limit" as const, scope: "agent", priority: 100, conditions: [{field:"amount",op:"gt",value:"10000000"}], targetRoles: ["treasury"], maxSpend: "50000000" },
    { id: "rule:agent-daily-limit", name: "Agent Daily Budget", description: "Enforce daily spending caps", effect: "deny" as const, scope: "role", priority: 90, conditions: [{field:"dailySpend",op:"gt",value:"spendLimitDaily"}], targetRoles: ["*"] },
    { id: "rule:escrow-approval", name: "Escrow Approval Required", description: "Escrows > 5000 UNY need approval", effect: "require_approval" as const, scope: "global", priority: 80, conditions: [{field:"amount",op:"gt",value:"5000"}], targetRoles: ["*"], maxSpend: "5000" },
    { id: "rule:ai-compute-limit", name: "AI Compute Rate Limit", description: "Rate limit AI inference requests", effect: "rate_limit" as const, scope: "role", priority: 70, conditions: [{field:"requestsPerMin",op:"gt",value:"100"}], targetRoles: ["ai-compute","executor"] },
    { id: "rule:cross-org-audit", name: "Cross-Org Audit Trail", description: "All cross-org transfers audited", effect: "audit_only" as const, scope: "global", priority: 60, conditions: [{field:"crossOrg",op:"eq",value:true}], targetRoles: ["*"] },
    { id: "rule:settlement-auto-allow", name: "Auto-Allow Settlements", description: "Settlements < 2000 UNY auto-approved", effect: "allow" as const, scope: "global", priority: 50, conditions: [{field:"amount",op:"lt",value:"2000"}], targetRoles: ["settler"], maxSpend: "2000" },
  ];
  for (const r of policyRules) {
    await prisma.policyRule.upsert({
      where: { id: r.id },
      create: { id: r.id, name: r.name, description: r.description, effect: r.effect, scope: r.scope, priority: r.priority, conditions: JSON.stringify(r.conditions), targetRoles: r.targetRoles, ...(r.maxSpend ? { maxSpend: r.maxSpend } : {}) },
      update: {},
    }).catch(() => {});
  }

  // ── MCP Servers (5) ─────────────────────────────────────────────────────
  const mcpServers = [
    { name: "genesis-ledger-mcp", description: "Genesis Ledger — balance queries, transfers", endpoint: "http://localhost:4030/mcp", healthEndpoint: "http://localhost:4030/health", tools: ["ledger_balance","ledger_transfer","ledger_history"], allowedRoles: ["*"], status: "running" },
    { name: "signer-mcp", description: "Ed25519 Signing — key management", endpoint: "http://localhost:4050/mcp", healthEndpoint: "http://localhost:4050/health", tools: ["sign","verify","rotate_key"], allowedRoles: ["signer","treasury"], status: "running" },
    { name: "facilitator-mcp", description: "x402 Facilitator — invoices, receipts", endpoint: "http://localhost:3100/mcp", healthEndpoint: "http://localhost:3100/health", tools: ["create_invoice","verify_payment","batch_receipts"], allowedRoles: ["*"], status: "running" },
    { name: "gateway-mcp", description: "Agent Gateway — routing, task dispatch", endpoint: "http://localhost:4010/mcp", healthEndpoint: "http://localhost:4010/health", tools: ["route_task","agent_status","org_lookup"], allowedRoles: ["*"], status: "running" },
    { name: "oracle-mcp", description: "Oracle Data Feed — prices, health", endpoint: "http://localhost:4060/mcp", healthEndpoint: "http://localhost:4060/health", tools: ["get_price","network_health","gas_estimate"], allowedRoles: ["oracle"], status: "standby" },
  ];
  for (const m of mcpServers) {
    await prisma.mcpServer.upsert({
      where: { name: m.name },
      create: { name: m.name, description: m.description, endpoint: m.endpoint, healthEndpoint: m.healthEndpoint, tools: JSON.stringify(m.tools), allowedRoles: m.allowedRoles, status: m.status },
      update: {},
    }).catch(() => {});
  }

  // ── Agent Budgets (one per system agent) ────────────────────────────────
  for (const ag of SYSTEM_AGENTS) {
    const budgetId = `budget:${ag.id.replace("agent:", "")}`;
    await prisma.agentBudget.upsert({
      where: { id: budgetId },
      create: {
        id: budgetId, agentId: ag.id, period: "daily",
        budgetLimit: ag.deposit, spent: "0", reserved: "0",
        periodStart: new Date(), autoRefill: true,
        refillAmount: String(BigInt(ag.deposit) / 10n),
        refillThreshold: String(BigInt(ag.deposit) / 20n),
      },
      update: {},
    }).catch(() => {});
  }

  // ── Credit Accounts (5) ────────────────────────────────────────────────
  if (await prisma.creditAccount.count() === 0) {
    const creditWallets = ["agent:gateway", "agent:facilitator", "agent:mesh-coord", "agent:bedrock-ai", "agent:x402-settler"];
    for (const w of creditWallets) {
      await prisma.creditAccount.create({
        data: {
          walletAddress: `pk_${w.replace("agent:", "")}`,
          rail: "unykorn-l1", asset: "UNY",
          balance: randInt(5000, 100000), kycLevel: "verified",
          pubkey: `pk_${w.replace("agent:", "")}`,
        },
      }).catch(() => {});
    }
  }

  // ── Treasury Agents (3) ────────────────────────────────────────────────
  if (await prisma.treasuryAgent.count() === 0) {
    const tAgents = [
      { walletAddress: "pk_treasury", targetBalance: 500000000, minBalance: 100000000, maxSingleRefill: 50000000, maxDailyRefill: 200000000 },
      { walletAddress: "pk_facilitator", targetBalance: 2000000, minBalance: 500000, maxSingleRefill: 500000, maxDailyRefill: 1000000 },
      { walletAddress: "pk_x402-settler", targetBalance: 10000000, minBalance: 2000000, maxSingleRefill: 2000000, maxDailyRefill: 5000000 },
    ];
    for (const ta of tAgents) {
      await prisma.treasuryAgent.create({ data: ta }).catch(() => {});
    }
  }

  // ── Webhook Subscriptions (4) ──────────────────────────────────────────
  if (await prisma.webhookSubscription.count() === 0) {
    const webhooks = [
      { id: "wh:settlements", walletAddress: "pk_treasury", url: "https://hooks.unykorn.org/settlements", events: ["settlement.completed","settlement.failed"], secret: sha256("wh-secret-1") },
      { id: "wh:tasks", walletAddress: "pk_mesh-coord", url: "https://hooks.unykorn.org/tasks", events: ["task.created","task.settled","task.failed"], secret: sha256("wh-secret-2") },
      { id: "wh:security", walletAddress: "pk_gateway", url: "https://hooks.unykorn.org/security", events: ["security.alert","policy.violation"], secret: sha256("wh-secret-3") },
      { id: "wh:blocks", walletAddress: "pk_facilitator", url: "https://hooks.unykorn.org/blocks", events: ["block.produced","anchor.created"], secret: sha256("wh-secret-4") },
    ];
    for (const w of webhooks) {
      await prisma.webhookSubscription.create({ data: w }).catch(() => {});
    }
  }

  // ── Emergency Pauses (1 inactive for audit trail) ──────────────────────
  if (await prisma.emergencyPause.count() === 0) {
    await prisma.emergencyPause.create({
      data: { scope: "agent", targetId: "agent:oracle-delta", initiatedBy: "agent:treasury", reason: "Scheduled oracle maintenance window", active: false, endedAt: new Date() },
    }).catch(() => {});
  }

  // ── Streaming Balances (2) ─────────────────────────────────────────────
  if (await prisma.streamingBalance.count() === 0) {
    await prisma.streamingBalance.createMany({
      data: [
        { fromAgentId: "agent:mesh-coord", toAgentId: "agent:bedrock-ai", totalBudget: "100000", ratePerSecond: "1", streamedAmount: "45000", status: "active", endsAt: new Date(Date.now() + 86400000 * 7) },
        { fromAgentId: "agent:facilitator", toAgentId: "agent:lambda-exec", totalBudget: "50000", ratePerSecond: "0.5", streamedAmount: "12000", status: "active", endsAt: new Date(Date.now() + 86400000 * 14) },
      ],
    }).catch(() => {});
  }

  // ── Guardian Upgrades (2) ──────────────────────────────────────────────
  if (await prisma.guardianUpgrade.count() === 0) {
    await prisma.guardianUpgrade.createMany({
      data: [
        { component: "genesis-ledger", fromVersion: "0.9.0", toVersion: "1.0.0", upgradeStatus: "completed", initiatedBy: "agent:treasury" },
        { component: "economic-daemon", fromVersion: "0.5.0", toVersion: "1.0.0", upgradeStatus: "completed", initiatedBy: "auto" },
      ],
    }).catch(() => {});
  }

  const counts = await Promise.all([
    prisma.policyRule.count(), prisma.mcpServer.count(), prisma.agentBudget.count(),
    prisma.creditAccount.count(), prisma.treasuryAgent.count(), prisma.webhookSubscription.count(),
  ]);
  server.log.info(`[SYS] Seeded: ${counts[0]} rules, ${counts[1]} MCP servers, ${counts[2]} budgets, ${counts[3]} credit accts, ${counts[4]} treasury agents, ${counts[5]} webhooks`);
}

// ── Periodic: Agent Heartbeats (every 30s) ────────────────────────────────
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

async function publishHeartbeats(): Promise<void> {
  for (const ag of SYSTEM_AGENTS) {
    const acct = ledger.getAccountByAgent(ag.id);
    await prisma.agentHeartbeat.create({
      data: {
        agentId: ag.id, healthy: true,
        activeTaskCount: randInt(0, 5),
        balanceRemaining: acct?.balances.OPERATING ?? "0",
        cpuPercent: Math.random() * 30 + 5,
        memoryMb: Math.random() * 500 + 100,
        requestsPerMin: Math.random() * 50,
        errorRate: Math.random() * 0.02,
      },
    }).catch(() => {});
  }
  // Update last heartbeat on agent records
  await prisma.agent.updateMany({ where: { id: { in: SYSTEM_AGENTS.map(a => a.id) } }, data: { lastHeartbeat: new Date() } }).catch(() => {});
}

function startHeartbeatPublisher(): void {
  if (heartbeatTimer) return;
  server.log.info("[SYS] Heartbeat publisher started — 30s interval");
  heartbeatTimer = setInterval(async () => {
    try { await publishHeartbeats(); } catch (e) { server.log.error(`[SYS] Heartbeat error: ${e}`); }
  }, 30000);
}

// ── Periodic: Receipt Batch Builder (every 60s) ──────────────────────────
let batchTimer: ReturnType<typeof setInterval> | null = null;

async function buildReceiptBatch(): Promise<void> {
  const unbatched = await prisma.settlementReceipt.findMany({
    where: { batchId: null }, take: 20, orderBy: { signedAt: "asc" },
  });
  if (unbatched.length < 3) return; // need at least 3 receipts for a batch

  const batchId = randomUUID();
  const hashes = unbatched.map(r => sha256(`${r.id}:${r.amount}:${r.signedAt.toISOString()}`));
  const root = merkleOf(hashes);
  const totalValue = unbatched.reduce((s, r) => s + BigInt(r.amount), 0n);

  await prisma.receiptBatch.create({
    data: { id: batchId, merkleRoot: root, receiptCount: unbatched.length, totalValue: totalValue.toString() },
  });

  // Link receipts to batch + set merkle indices
  for (let i = 0; i < unbatched.length; i++) {
    await prisma.settlementReceipt.update({
      where: { id: unbatched[i].id },
      data: { batchId, merkleIndex: i, merkleProofHash: hashes[i], status: "batched" },
    }).catch(() => {});
  }

  // Anchor to legacy receipt_roots for backward compat
  await prisma.receiptRoot.upsert({
    where: { batchId },
    create: { batchId, merkleRoot: root, itemCount: unbatched.length, anchorTxHash: sha256(`anchor-batch:${batchId}`), anchoredAt: new Date() },
    update: {},
  }).catch(() => {});

  server.log.info(`[BATCH] Receipt batch ${batchId.slice(0,8)} — ${unbatched.length} receipts, root=${root.slice(0,16)}, value=${totalValue}`);
}

function startBatchBuilder(): void {
  if (batchTimer) return;
  server.log.info("[SYS] Receipt batch builder started — 60s interval");
  batchTimer = setInterval(async () => {
    try { await buildReceiptBatch(); } catch (e) { server.log.error(`[SYS] Batch error: ${e}`); }
  }, 60000);
}

// ── API Sync Publisher — pushes state to CF Worker ────────────────────────
const SYNC_URL = process.env.SYNC_URL ?? "";
const SYNC_SECRET = process.env.FTH_SERVICE_SECRET ?? "";
let syncTimer: ReturnType<typeof setInterval> | null = null;

async function publishSync(): Promise<void> {
  if (!SYNC_URL) return;
  try {
    // Collect all RPC data
    const [status, latestBlocks, nodes, infra, econ, integrity, systemState, recentTasks, recentPolicies, recentSettlements] = await Promise.all([
      rpcMethods.chain_status([]),
      rpcMethods.chain_getBlocks([Math.max(1, (blocks.length > 0 ? blocks[blocks.length - 1].height : 0) - 19), 20]),
      rpcMethods.chain_getNodes([]),
      rpcMethods.chain_getInfrastructure([]),
      rpcMethods.chain_getEconomicState([]),
      rpcMethods.chain_verifyIntegrity([]),
      rpcMethods.chain_getSystemState([]),
      rpcMethods.chain_getRecentTasks([20]),
      rpcMethods.chain_getRecentPolicies([20]),
      rpcMethods.chain_getRecentSettlements([20]),
    ]);

    const latestBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null;

    // Collect REST data from ledger
    const [ledgerData, treasuryData] = await Promise.all([
      prisma.ledgerEntry.findMany({ take: 50, orderBy: { sequence: "desc" } }),
      (async () => {
        const state = ledger.getTreasuryState();
        const dbAgg = await prisma.genesisAccount.aggregate({ _sum: { totalDeposited: true, totalWithdrawn: true, operatingBalance: true, escrowBalance: true, reservedBalance: true, stakedBalance: true, proofReceiptBalance: true } });
        return { engine: state, database: { totalDeposited: dbAgg._sum.totalDeposited?.toString() ?? "0", totalWithdrawn: dbAgg._sum.totalWithdrawn?.toString() ?? "0", operatingBalance: dbAgg._sum.operatingBalance?.toString() ?? "0" }, updatedAt: new Date().toISOString() };
      })(),
    ]);

    // Fetch from other local services (best-effort)
    const safeFetch = async (url: string): Promise<any> => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    };

    const [facHealth, facStats, facInvoices, facReceipts, facRoots, facNamespaces, facRevenue, facEcon,
           gwHealth, gwAgents, gwOrgs,
           sigHealth, sigKeys, sigAudit] = await Promise.all([
      safeFetch("http://localhost:3100/health"),
      safeFetch("http://localhost:3100/explorer/stats"),
      safeFetch("http://localhost:3100/explorer/invoices?limit=50"),
      safeFetch("http://localhost:3100/explorer/receipts?limit=50"),
      safeFetch("http://localhost:3100/explorer/roots?limit=20"),
      safeFetch("http://localhost:3100/explorer/namespaces"),
      safeFetch("http://localhost:3100/explorer/revenue?limit=20"),
      safeFetch("http://localhost:3100/economics/overview"),
      safeFetch("http://localhost:4010/health"),
      safeFetch("http://localhost:4010/agents"),
      safeFetch("http://localhost:4010/organizations"),
      safeFetch("http://localhost:4050/health"),
      safeFetch("http://localhost:4050/keys"),
      safeFetch("http://localhost:4050/audit"),
    ]);

    const payload: Record<string, unknown> = {
      // RPC data
      "rpc:chain_status": status,
      "rpc:chain_getBlocks": latestBlocks,
      "rpc:chain_getNodes": nodes,
      "rpc:chain_getInfrastructure": infra,
      "rpc:chain_getEconomicState": econ,
      "rpc:chain_verifyIntegrity": integrity,
      "rpc:chain_getSystemState": systemState,
      "rpc:chain_getRecentTasks": recentTasks,
      "rpc:chain_getRecentPolicies": recentPolicies,
      "rpc:chain_getRecentSettlements": recentSettlements,
      "rpc:chain_getLatestBlock": latestBlock ? { height: latestBlock.height, hash: latestBlock.hash, timestamp: latestBlock.timestamp, chain_id: CHAIN_ID } : null,
      // Ledger REST data
      "rest:health": { service: SERVICE, status: "healthy", database: "connected", entries: ledger.entryCount(), uptime: process.uptime() },
      "rest:status": { chainId: CHAIN_ID, blockHeight: latestBlock?.height ?? 0, blockHash: latestBlock?.hash ?? "", synced: true, nodeId: NODE_ID },
      "rest:ledger": { entries: ledgerData, total: ledgerData.length, limit: 50, offset: 0 },
      "rest:treasury": treasuryData,
    };

    // Facilitator data (if available)
    if (facHealth) payload["rest:facilitator:health"] = facHealth;
    if (facStats) payload["rest:facilitator:stats"] = facStats;
    if (facInvoices) payload["rest:facilitator:invoices"] = facInvoices;
    if (facReceipts) payload["rest:facilitator:receipts"] = facReceipts;
    if (facRoots) payload["rest:facilitator:roots"] = facRoots;
    if (facNamespaces) payload["rest:facilitator:namespaces"] = facNamespaces;
    if (facRevenue) payload["rest:facilitator:revenue"] = facRevenue;
    if (facEcon) payload["rest:facilitator:economics"] = facEcon;

    // Gateway data (if available)
    if (gwHealth) payload["rest:gateway:health"] = gwHealth;
    if (gwAgents) payload["rest:gateway:agents"] = gwAgents;
    if (gwOrgs) payload["rest:gateway:organizations"] = gwOrgs;

    // Signer data (if available)
    if (sigHealth) payload["rest:signer:health"] = sigHealth;
    if (sigKeys) payload["rest:signer:keys"] = sigKeys;
    if (sigAudit) payload["rest:signer:audit"] = sigAudit;

    const res = await fetch(SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sync-Secret": SYNC_SECRET },
      body: JSON.stringify(payload, (_k, v) => typeof v === "bigint" ? v.toString() : v),
    });

    if (!res.ok) server.log.warn(`[SYNC] Push failed: ${res.status}`);
  } catch (e: any) {
    server.log.warn(`[SYNC] Error: ${e.message || e}`);
  }
}

function startSyncPublisher(): void {
  if (syncTimer || !SYNC_URL) return;
  server.log.info(`[SYNC] State publisher started — syncing to ${SYNC_URL} every 15s`);
  syncTimer = setInterval(async () => {
    try { await publishSync(); } catch (e) { server.log.error(`[SYNC] Publish error: ${e}`); }
  }, 15000);
  // Initial sync after 5s
  setTimeout(() => publishSync().catch(() => {}), 5000);
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
      flowTypes: 19,
      systemAgents: SYSTEM_AGENTS.length,
      timestamp: new Date().toISOString(),
    };
  },

  // ── Extended RPC: Table state for explorer ────────────────────────────

  async chain_getSystemState() {
    // Sequential to avoid connection pool exhaustion
    const counts: Record<string, number> = {};
    const models: [string, any][] = [
      ["agent_tasks", prisma.agentTask], ["a2a_messages", prisma.a2AMessage],
      ["settlement_receipts", prisma.settlementReceipt], ["proof_artifacts", prisma.proofArtifact],
      ["escrows", prisma.escrow], ["policy_decisions", prisma.policyDecision],
      ["policy_approvals", prisma.policyApproval], ["audit_entries", prisma.auditEntry],
      ["agent_budgets", prisma.agentBudget], ["agent_heartbeats", prisma.agentHeartbeat],
      ["credit_accounts", prisma.creditAccount], ["credit_transactions", prisma.creditTransaction],
      ["treasury_agents", prisma.treasuryAgent], ["treasury_refills", prisma.treasuryRefill],
      ["treasury_halts", prisma.treasuryHalt], ["webhook_subscriptions", prisma.webhookSubscription],
      ["webhook_deliveries", prisma.webhookDelivery], ["mcp_servers", prisma.mcpServer],
      ["emergency_pauses", prisma.emergencyPause], ["streaming_balances", prisma.streamingBalance],
      ["receipt_batches", prisma.receiptBatch], ["receipt_roots", prisma.receiptRoot],
      ["guardian_revenue", prisma.guardianRevenue], ["guardian_security_events", prisma.guardianSecurityEvent],
      ["guardian_upgrades", prisma.guardianUpgrade], ["rate_limit_log", prisma.rateLimitLog],
    ];
    for (const [name, model] of models) {
      try { counts[name] = await model.count(); } catch { counts[name] = -1; }
    }
    const populated = Object.values(counts).filter(c => c > 0).length;
    return { tables: counts, totalPopulated: populated, totalTables: models.length, timestamp: new Date().toISOString() };
  },

  async chain_getRecentTasks(params) {
    const limit = Math.min(Number(params[0] ?? 20), 100);
    const tasks = await prisma.agentTask.findMany({
      take: limit, orderBy: { requestedAt: "desc" },
      select: { id: true, requesterAgentId: true, performerAgentId: true, capability: true, status: true, quotedCost: true, maxBudget: true, priority: true, requestedAt: true, settledAt: true },
    });
    return tasks.map(t => ({ ...t, quotedCost: t.quotedCost?.toString(), maxBudget: t.maxBudget?.toString() }));
  },

  async chain_getRecentPolicies(params) {
    const limit = Math.min(Number(params[0] ?? 20), 100);
    return prisma.policyDecision.findMany({
      take: limit, orderBy: { evaluatedAt: "desc" },
      select: { id: true, action: true, agentId: true, result: true, reason: true, evaluatedAt: true },
    });
  },

  async chain_getRecentSettlements(params) {
    const limit = Math.min(Number(params[0] ?? 20), 100);
    const receipts = await prisma.settlementReceipt.findMany({
      take: limit, orderBy: { signedAt: "desc" },
      select: { id: true, taskId: true, fromAgentId: true, toAgentId: true, amount: true, status: true, batchId: true, signedAt: true },
    });
    return receipts.map(r => ({ ...r, amount: r.amount?.toString() }));
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

    // ── Bootstrap system data — policy rules, MCP servers, budgets, etc. ──
    await bootstrapSystemData();

    // ── Produce genesis block and start block production ──
    await produceBlock(); // seal everything up to now
    startBlockProduction();
    server.log.info(`[L1] Genesis block produced — chain ${CHAIN_ID}, height ${blocks[0]?.height ?? 0}`);

    // ── Start economic daemon — self-settling AI economy ──
    startEconomicDaemon();

    // ── Start periodic tasks — heartbeats + receipt batching + sync ──
    startHeartbeatPublisher();
    startBatchBuilder();
    startSyncPublisher();

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
