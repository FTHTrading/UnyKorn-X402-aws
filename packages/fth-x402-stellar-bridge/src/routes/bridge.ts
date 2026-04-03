import type { FastifyInstance } from "fastify";
import pool from "../db";
import { getTreasuryBalance, seedCredits, processStellarDeposit, withdrawToStellar } from "../services/bridge";
import type { SeedRequest, WithdrawRequest } from "../types";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "";

function requireAdmin(req: { headers: Record<string, string | string[] | undefined> }): void {
  const auth = req.headers["x-admin-token"] ?? req.headers["authorization"];
  const token = Array.isArray(auth) ? auth[0] : auth;
  const cleaned = token?.replace(/^Bearer\s+/i, "");
  if (!ADMIN_TOKEN || cleaned !== ADMIN_TOKEN) {
    const err: Error & { statusCode?: number } = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

export default async function bridgeRoutes(app: FastifyInstance) {
  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/health", async () => ({
    status: "ok",
    service: "fth-x402-stellar-bridge",
    timestamp: new Date().toISOString(),
  }));

  // ── Treasury balance on Stellar ─────────────────────────────────────────────
  app.get("/bridge/treasury-balance", async (_req, reply) => {
    try {
      const balance = await getTreasuryBalance();
      return reply.send({ ok: true, usdf_balance: balance, treasury: process.env.STELLAR_TREASURY_PUBLIC });
    } catch (e) {
      reply.status(502).send({ ok: false, error: (e as Error).message });
    }
  });

  // ── Admin: seed credits from treasury reserve ──────────────────────────────
  app.post<{ Body: SeedRequest }>("/bridge/seed", async (req, reply) => {
    requireAdmin(req as Parameters<typeof requireAdmin>[0]);
    const { wallet_address, usdf_amount, namespace, reference } = req.body;

    if (!wallet_address) return reply.status(400).send({ ok: false, error: "wallet_address required" });
    if (!usdf_amount || usdf_amount <= 0) return reply.status(400).send({ ok: false, error: "usdf_amount must be > 0" });
    if (usdf_amount > 1_000_000) return reply.status(400).send({ ok: false, error: "max single seed is 1,000,000 USDF" });

    try {
      const result = await seedCredits(wallet_address, usdf_amount, namespace, reference);
      return reply.send({ ok: true, ...result });
    } catch (e) {
      reply.status(500).send({ ok: false, error: (e as Error).message });
    }
  });

  // ── Process a real Stellar USDF payment tx ─────────────────────────────────
  app.post<{ Body: { stellar_tx_hash: string; target_wallet: string; target_namespace?: string } }>(
    "/bridge/deposit",
    async (req, reply) => {
      requireAdmin(req as Parameters<typeof requireAdmin>[0]);
      const { stellar_tx_hash, target_wallet, target_namespace } = req.body;
      if (!stellar_tx_hash || !target_wallet)
        return reply.status(400).send({ ok: false, error: "stellar_tx_hash and target_wallet required" });

      try {
        const result = await processStellarDeposit(stellar_tx_hash, target_wallet, target_namespace);
        return reply.send({ ok: true, ...result });
      } catch (e) {
        reply.status(500).send({ ok: false, error: (e as Error).message });
      }
    }
  );

  // ── Withdraw x402 credits → Stellar USDF ──────────────────────────────────
  app.post<{ Body: WithdrawRequest }>("/bridge/withdraw", async (req, reply) => {
    requireAdmin(req as Parameters<typeof requireAdmin>[0]);
    const { x402_wallet, stellar_destination, usdf_amount } = req.body;

    if (!x402_wallet || !stellar_destination || !usdf_amount)
      return reply.status(400).send({ ok: false, error: "x402_wallet, stellar_destination, usdf_amount required" });
    if (usdf_amount <= 0)
      return reply.status(400).send({ ok: false, error: "usdf_amount must be > 0" });

    try {
      const result = await withdrawToStellar(x402_wallet, stellar_destination, usdf_amount);
      return reply.send({ ok: true, ...result });
    } catch (e) {
      reply.status(500).send({ ok: false, error: (e as Error).message });
    }
  });

  // ── List deposits ───────────────────────────────────────────────────────────
  app.get<{
    Querystring: { limit?: string; offset?: string; wallet?: string; status?: string };
  }>("/bridge/deposits", async (req, reply) => {
    requireAdmin(req as Parameters<typeof requireAdmin>[0]);
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const where: string[] = [];
    const params: unknown[] = [];

    if (req.query.wallet) { params.push(req.query.wallet); where.push(`target_wallet = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); where.push(`status = $${params.length}`); }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit, offset);

    const rows = await pool.query(
      `SELECT * FROM stellar_bridge_deposits ${whereClause}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return reply.send({ ok: true, deposits: rows.rows, count: rows.rowCount });
  });

  // ── List withdrawals ────────────────────────────────────────────────────────
  app.get<{ Querystring: { limit?: string; wallet?: string } }>("/bridge/withdrawals", async (req, reply) => {
    requireAdmin(req as Parameters<typeof requireAdmin>[0]);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const params: unknown[] = [limit];
    const where = req.query.wallet ? `WHERE x402_wallet = $2` : "";
    if (req.query.wallet) params.push(req.query.wallet);

    const rows = await pool.query(
      `SELECT * FROM stellar_bridge_withdrawals ${where} ORDER BY created_at DESC LIMIT $1`,
      params
    );
    return reply.send({ ok: true, withdrawals: rows.rows, count: rows.rowCount });
  });
}
