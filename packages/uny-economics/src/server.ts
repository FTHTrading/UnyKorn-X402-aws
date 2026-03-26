/**
 * UNY Economics Engine — Standalone Server
 *
 * Runs the economics engine as a standalone Fastify server on port 3400.
 * This can be used for development, testing, or as a separate microservice.
 *
 * In production the routes are also mounted on the Facilitator at /economics/*.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import { createEconomicsRoutes } from "./routes";

const PORT = Number(process.env.ECONOMICS_PORT ?? 3400);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "OPTIONS"],
  });

  // Root
  app.get("/", async () => ({
    service: "uny-economics-engine",
    version: "1.0.0",
    status: "ok",
    description: "AMM, genesis provenance, revenue flywheel, and credibility layer for UNY",
    endpoints: [
      "/economics/overview",
      "/economics/amm",
      "/economics/amm/quote?amount=1000000000000000000&direction=UNY_TO_USDF",
      "/economics/flywheel",
      "/economics/genesis",
      "/economics/credibility",
      "/economics/fundamentals",
      "/economics/reserves",
      "/economics/infrastructure",
    ],
  }));

  // Health
  app.get("/health", async () => ({
    status: "ok",
    service: "uny-economics-engine",
    uptimeMs: Math.round(process.uptime() * 1000),
  }));

  // Mount all economics routes
  createEconomicsRoutes(app);

  // Start
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`UNY Economics Engine listening on ${HOST}:${PORT}`);
    app.log.info("Endpoints: /economics/overview | /economics/amm | /economics/flywheel | /economics/genesis | /economics/credibility");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
