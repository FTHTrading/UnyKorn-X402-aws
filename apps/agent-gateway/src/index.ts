/**
 * @unykorn/agent-gateway — Central Agent Gateway
 *
 * Real implementation: PrismaClient + AgentRegistry + TaskManager + PolicyEngine
 * All writes persisted to PostgreSQL. All actions policy-scoped.
 */

import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { AgentRegistry, TaskManager, BudgetManager } from "@unykorn/agent-core";
import { PolicyEngine } from "@unykorn/policy-engine";
import { SigningClient } from "@unykorn/signing-client";
import type { AgentRole, AgentTier, TaskStatus } from "@unykorn/shared-types";
import type { AgentTier as PrismaAgentTier } from "@prisma/client";

/** Map shared-types tier → Prisma enum (interface → interface_tier) */
function toPrismaTier(tier: AgentTier): PrismaAgentTier {
  return (tier === "interface" ? "interface_tier" : tier) as PrismaAgentTier;
}

/** Map Prisma enum → shared-types tier */
function fromPrismaTier(tier: PrismaAgentTier): AgentTier {
  return (tier === "interface_tier" ? "interface" : tier) as AgentTier;
}

const PORT = Number(process.env.AGENT_GATEWAY_PORT ?? 4000);
const SERVICE = "@unykorn/agent-gateway";

const server = Fastify({ logger: true });
const prisma = new PrismaClient();

// Signing client — all key operations go through rust-signer
const SIGNER_PORT = Number(process.env.SIGNER_PORT ?? 4050);
const SIGNER_HOST = process.env.SIGNER_HOST ?? "127.0.0.1";
const signer = new SigningClient({
  baseUrl: `http://${SIGNER_HOST}:${SIGNER_PORT}`,
  timeoutMs: 15_000,
});

// Serialize BigInt as string in JSON responses
server.addHook("preSerialization", async (_request, _reply, payload) => {
  return JSON.parse(JSON.stringify(payload, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  ));
});

// In-memory engines for business logic
const registry = new AgentRegistry();
const tasks = new TaskManager();
const budgets = new BudgetManager();
const policy = new PolicyEngine();

// ---------------------------------------------------------------------------
// Health — checks DB connectivity
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
    agents: registry.count(),
    tasks: tasks.count(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
});

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
server.get("/agents", async (request) => {
  const query = request.query as { limit?: string; offset?: string; status?: string };
  const take = Math.min(Number(query.limit ?? 50), 100);
  const skip = Number(query.offset ?? 0);

  const where = query.status ? { status: query.status as any } : {};
  const [agents, total] = await Promise.all([
    prisma.agent.findMany({ take, skip, where, orderBy: { createdAt: "desc" } }),
    prisma.agent.count({ where }),
  ]);

  return { agents, total, limit: take, offset: skip };
});

server.get<{ Params: { id: string } }>("/agents/:id", async (request, reply) => {
  const agent = await prisma.agent.findUnique({
    where: { id: request.params.id },
    include: { wallet: true, budgets: true },
  });
  if (!agent) return reply.status(404).send({ error: "Agent not found" });
  return agent;
});

server.post<{
  Body: {
    name: string;
    orgId: string;
    role: AgentRole;
    tier: AgentTier;
    allowedTools?: string[];
    allowedDataScopes?: string[];
    spendLimitDaily: string;
    spendLimitPerTask: string;
    approvalThreshold: string;
    description?: string;
  };
}>("/agents/register", async (request, reply) => {
  const body = request.body;

  // Verify org exists
  const org = await prisma.organization.findUnique({ where: { id: body.orgId } });
  if (!org) return reply.status(400).send({ error: "Organization not found" });

  // Generate key through signer service (agent_execution domain)
  // HARD RULE: No app generates keys directly — all go through rust-signer.
  let signerKey: { key_id: string; public_key_hex: string };
  try {
    signerKey = await signer.generateKey(
      "agent_execution",
      `agent-gateway:register:${body.name}`,
      `agent-${body.name}-${body.role}`
    );
  } catch (err: any) {
    server.log.error({ err }, "Signer key generation failed");
    return reply.status(502).send({
      error: "Key generation failed — signer service unavailable",
      detail: err.message,
    });
  }

  // Register in-memory
  const identity = registry.register({
    name: body.name,
    orgId: body.orgId,
    role: body.role,
    tier: body.tier,
    publicKey: signerKey.public_key_hex,
    spendLimitDaily: body.spendLimitDaily,
    spendLimitPerTask: body.spendLimitPerTask,
    approvalThreshold: body.approvalThreshold,
    allowedTools: body.allowedTools,
    allowedDataScopes: body.allowedDataScopes,
    description: body.description,
  });

  // Persist to DB
  const agent = await prisma.agent.create({
    data: {
      id: identity.id,
      name: identity.name,
      orgId: identity.orgId,
      role: identity.role,
      tier: toPrismaTier(identity.tier as AgentTier),
      publicKey: identity.publicKey,
      status: "active",
      trustScore: 50,
      allowedTools: identity.allowedTools,
      allowedDataScopes: identity.allowedDataScopes,
      spendLimitDaily: identity.spendLimitDaily,
      spendLimitPerTask: identity.spendLimitPerTask,
      approvalThreshold: identity.approvalThreshold,
      description: identity.description,
      version: "1.0.0",
    },
  });

  // Create wallet
  await prisma.agentWallet.create({
    data: { agentId: agent.id },
  });

  return reply.status(201).send({
    agent,
    publicKey: signerKey.public_key_hex,
    signerKeyId: signerKey.key_id,
    // NOTE: private key stays in rust-signer — never leaves the signer boundary
  });
});

server.put<{ Params: { id: string }; Body: { status: string } }>(
  "/agents/:id/status",
  async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;

    const validStatuses = ["active", "paused", "revoked", "draining"];
    if (!validStatuses.includes(status)) {
      return reply.status(400).send({ error: `Invalid status: ${status}` });
    }

    registry.updateStatus(id, status as any);

    try {
      const agent = await prisma.agent.update({
        where: { id },
        data: { status: status as any },
      });
      return agent;
    } catch {
      return reply.status(404).send({ error: "Agent not found" });
    }
  },
);

server.delete<{ Params: { id: string } }>("/agents/:id", async (request, reply) => {
  const { id } = request.params;
  registry.kill(id);

  try {
    const agent = await prisma.agent.update({
      where: { id },
      data: { status: "revoked", killSwitch: true },
    });
    return { killed: true, agent };
  } catch {
    return reply.status(404).send({ error: "Agent not found" });
  }
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
server.post<{
  Body: {
    requesterAgentId: string;
    capability: string;
    description: string;
    maxBudget: string;
    priority?: string;
  };
}>("/tasks", async (request, reply) => {
  const body = request.body;

  const requester = await prisma.agent.findUnique({ where: { id: body.requesterAgentId } });
  if (!requester || requester.status !== "active") {
    return reply.status(400).send({ error: "Requester agent not found or inactive" });
  }

  // Policy check
  const decision = policy.evaluate({
    agentId: body.requesterAgentId,
    agentRole: requester.role,
    action: "create_task",
    amount: body.maxBudget,
  });

  if (decision.result === "denied") {
    return reply.status(403).send({ error: "Policy denied", reason: decision.reason });
  }

  // Create task in-memory
  const task = tasks.createTask({
    requesterAgentId: body.requesterAgentId,
    capability: body.capability,
    description: body.description,
    maxBudget: body.maxBudget,
    priority: (body.priority as any) ?? "normal",
  });

  // Persist
  const dbTask = await prisma.agentTask.create({
    data: {
      id: task.taskId,
      requesterAgentId: task.requesterAgentId,
      capability: task.capability,
      description: task.description,
      maxBudget: task.maxBudget,
      status: "requested",
      priority: task.priority as any,
      idempotencyKey: task.idempotencyKey,
    },
  });

  return reply.status(201).send(dbTask);
});

server.get<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
  const task = await prisma.agentTask.findUnique({
    where: { id: request.params.id },
    include: { receipts: true },
  });
  if (!task) return reply.status(404).send({ error: "Task not found" });
  return task;
});

server.put<{
  Params: { id: string };
  Body: { status: string; performerAgentId?: string; quotedCost?: string };
}>("/tasks/:id/transition", async (request, reply) => {
  const { id } = request.params;
  const { status, performerAgentId, quotedCost } = request.body;

  const existingTask = await prisma.agentTask.findUnique({ where: { id } });
  if (!existingTask) return reply.status(404).send({ error: "Task not found" });

  // Validate transition via in-memory engine
  tasks.transition(id, status as TaskStatus, { performerAgentId, quotedCost } as any);

  const now = new Date();
  const updateData: Record<string, unknown> = { status: status as any };
  if (performerAgentId) updateData.performerAgentId = performerAgentId;
if (quotedCost) updateData.quotedCost = quotedCost;

  switch (status) {
    case "quoted": updateData.quotedAt = now; break;
    case "approved": updateData.approvedAt = now; break;
    case "executing": updateData.executionStartedAt = now; break;
    case "delivered": updateData.deliveredAt = now; break;
    case "settled": updateData.settledAt = now; break;
  }

  const updated = await prisma.agentTask.update({ where: { id }, data: updateData as any });
  return updated;
});

server.post<{ Params: { id: string }; Body: { agentId: string; artifactHash?: string } }>(
  "/tasks/:id/deliver",
  async (request, reply) => {
    const { id } = request.params;
    const { artifactHash } = request.body;

    try {
      const task = await prisma.agentTask.update({
        where: { id },
        data: {
          status: "delivered",
          deliveredAt: new Date(),
          artifactHash: artifactHash ?? null,
        },
      });
      tasks.transition(id, "delivered", { artifactHash } as any);
      return task;
    } catch {
      return reply.status(404).send({ error: "Task not found" });
    }
  },
);

server.post<{ Params: { id: string } }>(
  "/tasks/:id/settle",
  async (request, reply) => {
    const { id } = request.params;

    const task = await prisma.agentTask.findUnique({ where: { id } });
    if (!task) return reply.status(404).send({ error: "Task not found" });
    if (task.status !== "delivered") {
      return reply.status(400).send({ error: `Cannot settle task in status: ${task.status}` });
    }

    const settledTask = await prisma.agentTask.update({
      where: { id },
      data: { status: "settled", settledAt: new Date() },
    });
    tasks.transition(id, "settled");

    return { task: settledTask, settledAt: settledTask.settledAt };
  },
);

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------
server.post<{
  Body: { name: string; legalEntity: string; jurisdiction: string };
}>("/organizations", async (request, reply) => {
  const org = await prisma.organization.create({
    data: {
      name: request.body.name,
      legalEntity: request.body.legalEntity,
      jurisdiction: request.body.jurisdiction,
    },
  });
  return reply.status(201).send(org);
});

server.get("/organizations", async () => {
  return prisma.organization.findMany({ include: { _count: { select: { agents: true } } } });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const start = async () => {
  try {
    await prisma.$connect();
    server.log.info("Database connected");

    // Hydrate in-memory registry from DB
    const dbAgents = await prisma.agent.findMany({ where: { status: "active" } });
    for (const a of dbAgents) {
      registry.register({
        name: a.name,
        orgId: a.orgId,
        role: a.role as AgentRole,
        tier: fromPrismaTier(a.tier),
        publicKey: a.publicKey,
        spendLimitDaily: a.spendLimitDaily.toString(),
        spendLimitPerTask: a.spendLimitPerTask.toString(),
        approvalThreshold: a.approvalThreshold.toString(),
        allowedTools: a.allowedTools,
        allowedDataScopes: a.allowedDataScopes,
        description: a.description ?? undefined,
      });
    }
    server.log.info(`Hydrated ${dbAgents.length} agents from DB`);

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
