import Fastify from "fastify";
import cors from "@fastify/cors";
import assetRoutes from "./routes/assets";

const PORT = Number(process.env.REGISTRY_PORT ?? 3260);
const HOST = process.env.REGISTRY_HOST ?? "0.0.0.0";

async function main() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  app.get("/", async () => ({
    service: "fth-x402-asset-registry",
    version: "0.1.0",
    description: "Real-world asset registry with USDF valuations. Registration and transfers are x402-gated.",
    endpoints: [
      "GET  /health",
      "GET  /assets/stats",
      "GET  /assets",
      "GET  /assets/:id",
      "POST /assets/register",
      "PUT  /assets/:id/valuation",
      "POST /assets/:id/transfer",
      "DEL  /assets/:id",
    ],
  }));

  app.setErrorHandler((error, req, reply) => {
    const err = error as { statusCode?: number; message?: string };
    const code = err.statusCode ?? 500;
    app.log.error({ method: req.method, url: req.url, error: err.message }, "Asset registry request failed");
    return reply.status(code).send({
      ok: false,
      error: code >= 500 ? "Internal server error" : (err.message ?? "Unknown error"),
    });
  });

  await app.register(assetRoutes);

  const shutdown = async () => {
    app.log.info("Shutting down asset-registry");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ host: HOST, port: PORT });
  app.log.info(`FTH x402 Asset Registry listening on ${HOST}:${PORT}`);
}

main().catch((e) => {
  console.error("[FATAL] Asset Registry startup failed:", e);
  process.exit(1);
});
