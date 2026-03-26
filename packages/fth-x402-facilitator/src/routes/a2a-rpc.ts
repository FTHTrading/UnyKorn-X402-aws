/**
 * FTH x402 Facilitator — A2A JSON-RPC Endpoint
 *
 * Provides the main A2A protocol endpoint at POST /a2a
 * Handles JSON-RPC 2.0 requests and delegates to the A2A agent network.
 *
 * Also provides:
 *   GET  /a2a/status  — Network status and agent summary
 *   GET  /a2a/agents  — List all registered agents
 *   POST /a2a/:role   — Direct agent invocation by role
 */

import type { FastifyInstance } from "fastify";
import {
  createA2ANetwork,
  handleA2ARequest,
  type A2ANetwork,
} from "fth-x402-a2a";

// ═══════════════════════════════════════════════════════════
// Singleton Network Instance
// ═══════════════════════════════════════════════════════════

let network: A2ANetwork | null = null;

/**
 * Get or create the A2A network.
 * Lazy-initialized on first request.
 */
function getNetwork(): A2ANetwork {
  if (!network) {
    const baseUrl = process.env.A2A_BASE_URL ?? "http://localhost:3100";
    network = createA2ANetwork({
      baseUrl,
      eventBusDebug: process.env.NODE_ENV !== "production",
      maxTasks: 10_000,
    });
  }
  return network;
}

// ═══════════════════════════════════════════════════════════
// Route Registration
// ═══════════════════════════════════════════════════════════

export default async function a2aJsonRpcRoutes(app: FastifyInstance): Promise<void> {
  // Start the network when the plugin loads
  const net = getNetwork();
  await net.start();

  // Cleanup on server close
  app.addHook("onClose", async () => {
    await net.stop();
    network = null;
  });

  // ─── Main A2A JSON-RPC Endpoint ──────────────────────

  /**
   * POST /a2a — A2A JSON-RPC 2.0 endpoint
   *
   * All A2A operations go through this single endpoint.
   * The orchestrator routes tasks to specialized agents.
   */
  app.post("/a2a", async (req, reply) => {
    const orchestrator = net.agents.orchestrator;
    const handlers = orchestrator.getHandlers();
    const result = await handleA2ARequest(req.body, handlers);

    if (result.stream) {
      // SSE streaming response
      reply.raw.writeHead(result.status, result.headers);
      const reader = result.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(value);
        }
      } finally {
        reply.raw.end();
      }
      return;
    }

    return reply
      .status(result.status)
      .headers(result.headers)
      .send(result.body);
  });

  // ─── Direct Agent Invocation ─────────────────────────

  /**
   * POST /a2a/:role — Direct invocation by agent role
   *
   * Bypasses the orchestrator and sends directly to a
   * specific agent. Useful for testing and direct integrations.
   */
  app.post<{ Params: { role: string } }>("/a2a/:role", async (req, reply) => {
    const { role } = req.params;
    const agentEntry = net.registry.findByRole(role as any);

    if (agentEntry.length === 0) {
      return reply.status(404).send({
        error: `No agent found for role: ${role}`,
        availableRoles: net.registry.all().map((a) => a.role),
      });
    }

    // Find the agent instance
    const agentMap = net.agents as Record<string, { getHandlers: () => any }>;
    const agent = agentMap[role];

    if (!agent) {
      return reply.status(404).send({
        error: `Agent role not directly accessible: ${role}`,
      });
    }

    const handlers = agent.getHandlers();
    const result = await handleA2ARequest(req.body, handlers);

    return reply
      .status(result.status)
      .headers(result.headers)
      .send(result.body);
  });

  // ─── Network Status ──────────────────────────────────

  /**
   * GET /a2a/status — A2A network status
   */
  app.get("/a2a/status", async (_req, reply) => {
    return reply.send({
      network: "fth-x402-a2a",
      status: "active",
      agents: net.registry.summary(),
      tasks: net.taskManager.stats(),
      events: net.eventBus.stats(),
      architecture: {
        pattern: "hub-and-spoke + control/execution split + async events + human escalation",
        layers: {
          L2_control: ["orchestrator", "guardian", "compliance", "budget"],
          L3_commerce: ["quote", "payment", "treasury", "receipt"],
          L4_work: ["delivery", "search", "settlement", "outreach"],
        },
      },
    });
  });

  // ─── Agent Listing ───────────────────────────────────

  /**
   * GET /a2a/agents — List all registered agents
   */
  app.get("/a2a/agents", async (_req, reply) => {
    const agents = net.registry.all();
    return reply.send({
      total: agents.length,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.card.name,
        role: a.role,
        layer: a.layer,
        status: a.status,
        endpoint: a.endpoint,
        skills: a.card.skills.map((s) => ({
          id: s.id,
          name: s.name,
          tags: s.tags,
        })),
        capabilities: a.card.capabilities,
      })),
    });
  });

  // ─── Agent Card By Role ──────────────────────────────

  /**
   * GET /a2a/agents/:role/card — Get agent card for a specific role
   */
  app.get<{ Params: { role: string } }>("/a2a/agents/:role/card", async (req, reply) => {
    const { role } = req.params;
    const agents = net.registry.findByRole(role as any);

    if (agents.length === 0) {
      return reply.status(404).send({ error: `No agent for role: ${role}` });
    }

    return reply
      .header("Content-Type", "application/json")
      .header("Cache-Control", "public, max-age=3600")
      .send(agents[0].card);
  });

  // ─── Routing Rules ───────────────────────────────────

  /**
   * GET /a2a/routes — Get all routing rules
   */
  app.get("/a2a/routes", async (_req, reply) => {
    return reply.send({
      rules: net.router.getRules(),
      total: net.router.getRules().length,
    });
  });
}
