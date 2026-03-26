/**
 * Exchange Readiness OS — Standalone Server
 *
 * Runs the full Exchange Readiness API on port 3600.
 * In production the routes are mounted on the Facilitator.
 *
 * Usage:
 *   npx tsx src/server.ts
 *   npm run dev
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import { createReadinessRoutes } from "./routes.js";

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  createReadinessRoutes(app);

  const port = parseInt(process.env.READINESS_PORT || "3600");
  const host = process.env.READINESS_HOST || "0.0.0.0";

  await app.listen({ port, host });

  console.log(`\n  🛡️  Exchange Readiness OS  →  http://localhost:${port}/readiness/v1/health\n`);
  console.log("  Token Truth:");
  console.log(`    GET http://localhost:${port}/readiness/v1/token`);
  console.log(`    GET http://localhost:${port}/readiness/v1/supply`);
  console.log(`    GET http://localhost:${port}/readiness/v1/vesting`);
  console.log(`    GET http://localhost:${port}/readiness/v1/treasury`);
  console.log(`    GET http://localhost:${port}/readiness/v1/admin-powers`);
  console.log("");
  console.log("  Issuer & Security:");
  console.log(`    GET http://localhost:${port}/readiness/v1/issuer`);
  console.log(`    GET http://localhost:${port}/readiness/v1/security`);
  console.log("");
  console.log("  Risk & Readiness:");
  console.log(`    GET http://localhost:${port}/readiness/v1/risk-flags`);
  console.log(`    GET http://localhost:${port}/readiness/v1/risk-summary`);
  console.log(`    GET http://localhost:${port}/readiness/v1/score`);
  console.log("");
  console.log("  Exchange Packets:");
  console.log(`    GET http://localhost:${port}/readiness/v1/packets`);
  console.log(`    GET http://localhost:${port}/readiness/v1/packets/coinbase`);
  console.log(`    GET http://localhost:${port}/readiness/v1/packets/binance`);
  console.log("");
  console.log("  Full State:");
  console.log(`    GET http://localhost:${port}/readiness/v1/state`);
}

main().catch(console.error);
