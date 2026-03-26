/**
 * Exchange Listing Standalone Server
 *
 * Runs the full exchange-listing API on port 3500.
 * In production the routes are mounted on the Facilitator instead.
 *
 * Usage:
 *   npx tsx src/server.ts
 *   npm run dev          → tsx watch src/server.ts
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import { createListingRoutes } from "./routes";

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  createListingRoutes(app);

  const port = parseInt(process.env.LISTING_PORT || "3500");
  const host = process.env.LISTING_HOST || "0.0.0.0";

  await app.listen({ port, host });
  console.log(`\n  🏛️  Exchange Listing API  →  http://localhost:${port}/listing/v1/overview\n`);
  console.log("  CoinGecko endpoints:");
  console.log(`    GET http://localhost:${port}/listing/v1/pairs`);
  console.log(`    GET http://localhost:${port}/listing/v1/tickers`);
  console.log(`    GET http://localhost:${port}/listing/v1/orderbook?ticker_id=UNY_USDT`);
  console.log(`    GET http://localhost:${port}/listing/v1/historical_trades?ticker_id=UNY_USDT`);
  console.log("");
  console.log("  CMC endpoints:");
  console.log(`    GET http://localhost:${port}/listing/v1/summary`);
  console.log(`    GET http://localhost:${port}/listing/v1/assets`);
  console.log("");
  console.log("  Metadata:");
  console.log(`    GET http://localhost:${port}/listing/v1/asset-info`);
  console.log(`    GET http://localhost:${port}/listing/v1/contracts`);
  console.log("");
  console.log("  Proof of Reserves:");
  console.log(`    GET http://localhost:${port}/listing/v1/proof-of-reserves`);
  console.log(`    GET http://localhost:${port}/listing/v1/proof-of-reserves/merkle/0`);
  console.log("");
  console.log("  Compliance:");
  console.log(`    GET http://localhost:${port}/listing/v1/readiness`);
  console.log(`    GET http://localhost:${port}/listing/v1/readiness/binance`);
  console.log("");
  console.log("  Applications:");
  console.log(`    GET http://localhost:${port}/listing/v1/application/binance`);
  console.log(`    GET http://localhost:${port}/listing/v1/applications`);
}

main().catch(console.error);
