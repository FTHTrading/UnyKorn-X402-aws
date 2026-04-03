import Fastify from "fastify";
import cors from "@fastify/cors";
import barterRoutes from "./routes/barter";
import { expireStaleOffers } from "./services/barter";

const PORT = Number(process.env.BARTER_PORT ?? 3270);
const HOST = process.env.BARTER_HOST ?? "0.0.0.0";

async function main() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  app.get("/", async () => ({
    service: "fth-x402-barter",
    version: "0.1.0",
    description: "Peer-to-peer asset barter engine with USDF settlement and value appreciation.",
    endpoints: [
      "GET  /health",
      "GET  /barter/market",
      "GET  /barter/offers",
      "GET  /barter/offers/:id",
      "POST /barter/offers",
      "POST /barter/offers/:id/accept",
      "DEL  /barter/offers/:id",
      "GET  /barter/trades",
      "POST /barter/admin/expire-stale  (admin)",
    ],
  }));

  app.setErrorHandler((error, req, reply) => {
    const err = error as { statusCode?: number; message?: string };
    const code = err.statusCode ?? 500;
    app.log.error({ method: req.method, url: req.url, error: err.message }, "Barter request failed");
    return reply.status(code).send({
      ok: false,
      error: code >= 500 ? "Internal server error" : (err.message ?? "Unknown error"),
    });
  });

  await app.register(barterRoutes);

  // Background: expire stale offers every 5 minutes
  const expiryInterval = setInterval(async () => {
    try {
      const expired = await expireStaleOffers();
      if (expired > 0) app.log.info(`[Barter] Expired ${expired} stale offer(s)`);
    } catch (e) {
      app.log.error(`[Barter] Expiry loop error: ${(e as Error).message}`);
    }
  }, 5 * 60 * 1000);

  const shutdown = async () => {
    clearInterval(expiryInterval);
    app.log.info("Shutting down barter engine");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ host: HOST, port: PORT });
  app.log.info(`FTH x402 Barter Engine listening on ${HOST}:${PORT}`);
}

main().catch((e) => {
  console.error("[FATAL] Barter Engine startup failed:", e);
  process.exit(1);
});
