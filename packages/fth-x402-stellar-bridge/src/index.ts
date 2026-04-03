import Fastify from "fastify";
import cors from "@fastify/cors";
import bridgeRoutes from "./routes/bridge";
import { startMonitor } from "./services/bridge";

const PORT = Number(process.env.BRIDGE_PORT ?? 3250);
const HOST = process.env.BRIDGE_HOST ?? "0.0.0.0";

if (!process.env.STELLAR_TREASURY_PUBLIC || !process.env.STELLAR_USDF_ISSUER) {
  console.warn("[StellarBridge] WARNING: STELLAR_TREASURY_PUBLIC or STELLAR_USDF_ISSUER not set — monitor will be disabled");
}

async function main() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  app.get("/", async () => ({
    service: "fth-x402-stellar-bridge",
    version: "0.1.0",
    description: "Stellar USDF ↔ x402 credit bridge for the UnyKorn mesh.",
    endpoints: [
      "GET  /health",
      "GET  /bridge/treasury-balance",
      "POST /bridge/seed          (admin)",
      "POST /bridge/deposit       (admin)",
      "POST /bridge/withdraw      (admin)",
      "GET  /bridge/deposits      (admin)",
      "GET  /bridge/withdrawals   (admin)",
    ],
  }));

  app.setErrorHandler((error, req, reply) => {
    const err = error as { statusCode?: number; message?: string };
    const code = err.statusCode ?? 500;
    app.log.error({ method: req.method, url: req.url, error: err.message }, "Bridge request failed");
    return reply.status(code).send({
      ok: false,
      error: code >= 500 ? "Internal server error" : (err.message ?? "Unknown error"),
    });
  });

  await app.register(bridgeRoutes);

  const shutdown = async () => {
    app.log.info("Shutting down stellar-bridge");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ host: HOST, port: PORT });
  app.log.info(`FTH x402 Stellar Bridge listening on ${HOST}:${PORT}`);

  // Start Stellar payment stream monitor
  startMonitor(app.log as { info: (m: string) => void; error: (m: string) => void });
}

main().catch((e) => {
  console.error("[FATAL] Stellar Bridge startup failed:", e);
  process.exit(1);
});
