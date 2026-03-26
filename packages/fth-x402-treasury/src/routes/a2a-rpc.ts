/**
 * FTH x402 Treasury — A2A JSON-RPC Endpoint
 *
 * Lightweight A2A endpoint for the Treasury service.
 * Exposes TreasuryAgent operations via JSON-RPC 2.0.
 */

import type { FastifyInstance } from "fastify";
import {
  createA2ANetwork,
  handleA2ARequest,
  type A2ANetwork,
} from "fth-x402-a2a";

let network: A2ANetwork | null = null;

function getNetwork(): A2ANetwork {
  if (!network) {
    const baseUrl =
      process.env.A2A_BASE_URL ??
      `http://localhost:${process.env.TREASURY_PORT ?? 3200}`;
    network = createA2ANetwork({ baseUrl });
  }
  return network;
}

export default async function treasuryA2aRpcRoutes(
  app: FastifyInstance,
): Promise<void> {
  const net = getNetwork();
  await net.start();

  app.addHook("onClose", async () => {
    await net.stop();
    network = null;
  });

  /** POST /a2a — JSON-RPC 2.0 routed to TreasuryAgent */
  app.post("/a2a", async (req, reply) => {
    const handlers = net.agents.treasury.getHandlers();
    const result = await handleA2ARequest(req.body, handlers);

    if (result.stream) {
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

  /** GET /a2a/status — Treasury agent status */
  app.get("/a2a/status", async (_req, reply) => {
    return reply.send({
      service: "fth-x402-treasury",
      a2a: "active",
      tasks: net.taskManager.stats(),
    });
  });
}
