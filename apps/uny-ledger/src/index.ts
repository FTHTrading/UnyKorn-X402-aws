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
