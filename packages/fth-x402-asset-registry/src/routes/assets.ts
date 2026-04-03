import type { FastifyInstance } from "fastify";
import pool from "../db";
import { chargeAccount, REGISTRATION_FEE_USDF, TRANSFER_FEE_PCT } from "../services/fees";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "";

function isAdmin(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const auth = req.headers["x-admin-token"] ?? req.headers["authorization"];
  const token = (Array.isArray(auth) ? auth[0] : auth)?.replace(/^Bearer\s+/i, "");
  return Boolean(ADMIN_TOKEN && token === ADMIN_TOKEN);
}

export default async function assetRoutes(app: FastifyInstance) {
  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/health", async () => ({
    status: "ok",
    service: "fth-x402-asset-registry",
    timestamp: new Date().toISOString(),
  }));

  // ── Register a new asset ────────────────────────────────────────────────────
  app.post<{
    Body: {
      name: string;
      category?: string;
      description?: string;
      owner_wallet: string;
      usdf_valuation: number;
      metadata?: Record<string, unknown>;
      ipfs_hash?: string;
    };
  }>("/assets/register", async (req, reply) => {
    const { name, category, description, owner_wallet, usdf_valuation, metadata, ipfs_hash } = req.body;

    if (!name || !owner_wallet)
      return reply.status(400).send({ ok: false, error: "name and owner_wallet required" });
    if (usdf_valuation === undefined || usdf_valuation < 0)
      return reply.status(400).send({ ok: false, error: "usdf_valuation must be >= 0" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Charge registration fee if account has credits (waived for admin)
      if (!isAdmin(req)) {
        await chargeAccount(client, owner_wallet, REGISTRATION_FEE_USDF, `asset-registration:${name}`);
      }

      const assetResult = await client.query<{ id: string }>(
        `INSERT INTO real_assets (name, category, description, owner_wallet, usdf_valuation, metadata, ipfs_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          name,
          category ?? "generic",
          description ?? null,
          owner_wallet,
          usdf_valuation.toFixed(7),
          JSON.stringify(metadata ?? {}),
          ipfs_hash ?? null,
        ]
      );
      const assetId = assetResult.rows[0].id;

      // Record initial valuation
      await client.query(
        `INSERT INTO asset_valuations (asset_id, usdf_value, reason, set_by)
         VALUES ($1, $2, 'initial_registration', $3)`,
        [assetId, usdf_valuation.toFixed(7), owner_wallet]
      );

      await client.query("COMMIT");

      const asset = await pool.query("SELECT * FROM real_assets WHERE id = $1", [assetId]);
      return reply.status(201).send({ ok: true, asset: asset.rows[0] });
    } catch (e) {
      await client.query("ROLLBACK");
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ── List / search assets ────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      category?: string;
      status?: string;
      owner?: string;
      min_value?: string;
      max_value?: string;
      limit?: string;
      offset?: string;
    };
  }>("/assets", async (req, reply) => {
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const where: string[] = [];
    const params: unknown[] = [];

    if (req.query.category) { params.push(req.query.category); where.push(`category = $${params.length}`); }
    if (req.query.status)   { params.push(req.query.status);   where.push(`status = $${params.length}`); }
    if (req.query.owner)    { params.push(req.query.owner);     where.push(`owner_wallet = $${params.length}`); }
    if (req.query.min_value) { params.push(Number(req.query.min_value)); where.push(`usdf_valuation >= $${params.length}`); }
    if (req.query.max_value) { params.push(Number(req.query.max_value)); where.push(`usdf_valuation <= $${params.length}`); }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit, offset);

    const rows = await pool.query(
      `SELECT * FROM real_assets ${whereClause}
       ORDER BY usdf_valuation DESC, created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = await pool.query(`SELECT COUNT(*) FROM real_assets ${whereClause}`, params.slice(0, -2));
    return reply.send({ ok: true, assets: rows.rows, total: Number(total.rows[0].count), limit, offset });
  });

  // ── Get single asset with valuation history ─────────────────────────────────
  app.get<{ Params: { id: string } }>("/assets/:id", async (req, reply) => {
    const asset = await pool.query("SELECT * FROM real_assets WHERE id = $1", [req.params.id]);
    if (!asset.rows.length) return reply.status(404).send({ ok: false, error: "Asset not found" });

    const valuations = await pool.query(
      "SELECT * FROM asset_valuations WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.params.id]
    );

    return reply.send({ ok: true, asset: asset.rows[0], valuation_history: valuations.rows });
  });

  // ── Update valuation ────────────────────────────────────────────────────────
  app.put<{
    Params: { id: string };
    Body: { usdf_valuation: number; reason?: string; set_by?: string };
  }>("/assets/:id/valuation", async (req, reply) => {
    const { usdf_valuation, reason, set_by } = req.body;
    if (usdf_valuation === undefined || usdf_valuation < 0)
      return reply.status(400).send({ ok: false, error: "usdf_valuation must be >= 0" });

    const asset = await pool.query<{ id: string; owner_wallet: string }>(
      "SELECT id, owner_wallet FROM real_assets WHERE id = $1",
      [req.params.id]
    );
    if (!asset.rows.length) return reply.status(404).send({ ok: false, error: "Asset not found" });

    // Only admin or owner can update valuation
    if (!isAdmin(req)) {
      const auth = req.headers["x-wallet-address"];
      const wallet = Array.isArray(auth) ? auth[0] : auth;
      if (wallet !== asset.rows[0].owner_wallet)
        return reply.status(403).send({ ok: false, error: "Only asset owner or admin can update valuation" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE real_assets SET usdf_valuation = $1, updated_at = now() WHERE id = $2",
        [usdf_valuation.toFixed(7), req.params.id]
      );
      await client.query(
        "INSERT INTO asset_valuations (asset_id, usdf_value, reason, set_by) VALUES ($1, $2, $3, $4)",
        [req.params.id, usdf_valuation.toFixed(7), reason ?? "manual_update", set_by ?? null]
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const updated = await pool.query("SELECT * FROM real_assets WHERE id = $1", [req.params.id]);
    return reply.send({ ok: true, asset: updated.rows[0] });
  });

  // ── Transfer ownership ──────────────────────────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { from_wallet: string; to_wallet: string; note?: string };
  }>("/assets/:id/transfer", async (req, reply) => {
    const { from_wallet, to_wallet } = req.body;
    if (!from_wallet || !to_wallet)
      return reply.status(400).send({ ok: false, error: "from_wallet and to_wallet required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const asset = await client.query<{ id: string; owner_wallet: string; usdf_valuation: string; name: string }>(
        "SELECT id, owner_wallet, usdf_valuation, name FROM real_assets WHERE id = $1 FOR UPDATE",
        [req.params.id]
      );
      if (!asset.rows.length) return reply.status(404).send({ ok: false, error: "Asset not found" });
      if (asset.rows[0].owner_wallet !== from_wallet)
        return reply.status(403).send({ ok: false, error: "from_wallet does not own this asset" });

      // Charge transfer fee from sender's credits
      const feeAmount = Math.max(0.01, Number(asset.rows[0].usdf_valuation) * TRANSFER_FEE_PCT);
      if (!isAdmin(req)) {
        await chargeAccount(client, from_wallet, feeAmount, `asset-transfer:${req.params.id}`);
      }

      // Transfer ownership
      await client.query(
        "UPDATE real_assets SET owner_wallet = $1, updated_at = now() WHERE id = $2",
        [to_wallet, req.params.id]
      );

      // Record valuation event
      await client.query(
        `INSERT INTO asset_valuations (asset_id, usdf_value, reason, set_by)
         VALUES ($1, $2, 'ownership_transfer', $3)`,
        [req.params.id, asset.rows[0].usdf_valuation, `transfer:${from_wallet}→${to_wallet}`]
      );

      await client.query("COMMIT");

      const updated = await pool.query("SELECT * FROM real_assets WHERE id = $1", [req.params.id]);
      return reply.send({
        ok: true,
        asset: updated.rows[0],
        transfer_fee_paid: isAdmin(req) ? 0 : feeAmount,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ── Archive asset (owner or admin) ──────────────────────────────────────────
  app.delete<{ Params: { id: string }; Body: { wallet?: string } }>(
    "/assets/:id",
    async (req, reply) => {
      const asset = await pool.query<{ id: string; owner_wallet: string }>(
        "SELECT id, owner_wallet FROM real_assets WHERE id = $1",
        [req.params.id]
      );
      if (!asset.rows.length) return reply.status(404).send({ ok: false, error: "Asset not found" });

      if (!isAdmin(req) && req.body?.wallet !== asset.rows[0].owner_wallet)
        return reply.status(403).send({ ok: false, error: "Not authorized to archive this asset" });

      await pool.query(
        "UPDATE real_assets SET status = 'archived', updated_at = now() WHERE id = $1",
        [req.params.id]
      );
      return reply.send({ ok: true, message: "Asset archived" });
    }
  );

  // ── Stats ────────────────────────────────────────────────────────────────────
  app.get("/assets/stats", async (_req, reply) => {
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')  AS active_count,
        COUNT(*) FILTER (WHERE status = 'sold')    AS sold_count,
        COUNT(*) FILTER (WHERE status = 'archived') AS archived_count,
        COUNT(DISTINCT owner_wallet)               AS unique_owners,
        COALESCE(SUM(usdf_valuation) FILTER (WHERE status = 'active'), 0) AS total_active_value_usdf,
        COALESCE(MAX(usdf_valuation), 0)           AS highest_value_usdf,
        COALESCE(AVG(usdf_valuation) FILTER (WHERE status = 'active'), 0) AS avg_value_usdf
      FROM real_assets
    `);

    const byCategory = await pool.query(`
      SELECT category,
             COUNT(*) AS count,
             COALESCE(SUM(usdf_valuation), 0) AS total_value_usdf
      FROM real_assets
      WHERE status = 'active'
      GROUP BY category
      ORDER BY total_value_usdf DESC
    `);

    return reply.send({ ok: true, summary: stats.rows[0], by_category: byCategory.rows });
  });
}
