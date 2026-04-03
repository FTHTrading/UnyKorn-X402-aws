import type { FastifyInstance } from "fastify";
import pool from "../db";
import { createOffer, acceptOffer, cancelOffer, expireStaleOffers } from "../services/barter";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "";

function isAdmin(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const auth = req.headers["x-admin-token"] ?? req.headers["authorization"];
  const token = (Array.isArray(auth) ? auth[0] : auth)?.replace(/^Bearer\s+/i, "");
  return Boolean(ADMIN_TOKEN && token === ADMIN_TOKEN);
}

export default async function barterRoutes(app: FastifyInstance) {
  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/health", async () => ({
    status: "ok",
    service: "fth-x402-barter",
    timestamp: new Date().toISOString(),
  }));

  // ── Create offer ────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      offerer_wallet: string;
      offered_asset_id: string;
      requested_asset_id?: string;
      requested_category?: string;
      usdf_add?: number;
      usdf_expect?: number;
      expires_hours?: number;
    };
  }>("/barter/offers", async (req, reply) => {
    const { offerer_wallet, offered_asset_id } = req.body;
    if (!offerer_wallet || !offered_asset_id)
      return reply.status(400).send({ ok: false, error: "offerer_wallet and offered_asset_id required" });

    try {
      const offer = await createOffer(req.body);
      return reply.status(201).send({ ok: true, offer });
    } catch (e) {
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message });
    }
  });

  // ── List open offers ────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      status?: string;
      category?: string;
      offerer?: string;
      limit?: string;
      offset?: string;
    };
  }>("/barter/offers", async (req, reply) => {
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const where: string[] = [];
    const params: unknown[] = [];

    const status = req.query.status ?? "open";
    params.push(status);
    where.push(`o.status = $${params.length}`);

    if (req.query.category) {
      params.push(req.query.category);
      where.push(`a.category = $${params.length}`);
    }
    if (req.query.offerer) {
      params.push(req.query.offerer);
      where.push(`o.offerer_wallet = $${params.length}`);
    }

    params.push(limit, offset);
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await pool.query(
      `SELECT o.*,
              a.name AS offered_asset_name, a.category AS offered_asset_category,
              a.usdf_valuation AS offered_asset_value, a.description AS offered_asset_description,
              ra.name AS requested_asset_name
       FROM barter_offers o
       JOIN real_assets a ON a.id = o.offered_asset_id
       LEFT JOIN real_assets ra ON ra.id = o.requested_asset_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return reply.send({ ok: true, offers: rows.rows, count: rows.rowCount });
  });

  // ── Get single offer ────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/barter/offers/:id", async (req, reply) => {
    const rows = await pool.query(
      `SELECT o.*,
              a.name AS offered_asset_name, a.category AS offered_asset_category,
              a.usdf_valuation AS offered_asset_value
       FROM barter_offers o
       JOIN real_assets a ON a.id = o.offered_asset_id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (!rows.rows.length) return reply.status(404).send({ ok: false, error: "Offer not found" });
    return reply.send({ ok: true, offer: rows.rows[0] });
  });

  // ── Accept offer ────────────────────────────────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { counterparty_wallet: string; counterparty_asset_id?: string };
  }>("/barter/offers/:id/accept", async (req, reply) => {
    const { counterparty_wallet, counterparty_asset_id } = req.body;
    if (!counterparty_wallet)
      return reply.status(400).send({ ok: false, error: "counterparty_wallet required" });

    try {
      const result = await acceptOffer({
        offer_id: req.params.id,
        counterparty_wallet,
        counterparty_asset_id,
      });
      return reply.send(result);
    } catch (e) {
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message });
    }
  });

  // ── Cancel offer ────────────────────────────────────────────────────────────
  app.delete<{
    Params: { id: string };
    Body: { wallet?: string };
  }>("/barter/offers/:id", async (req, reply) => {
    const wallet = req.body?.wallet ?? "";
    try {
      await cancelOffer(req.params.id, wallet, isAdmin(req));
      return reply.send({ ok: true, message: "Offer cancelled" });
    } catch (e) {
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message });
    }
  });

  // ── Trade history ───────────────────────────────────────────────────────────
  app.get<{
    Querystring: { wallet?: string; limit?: string; offset?: string };
  }>("/barter/trades", async (req, reply) => {
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const where: string[] = ["t.status = 'settled'"];
    const params: unknown[] = [];

    if (req.query.wallet) {
      params.push(req.query.wallet);
      where.push(`(o.offerer_wallet = $${params.length} OR t.counterparty_wallet = $${params.length})`);
    }

    params.push(limit, offset);
    const whereClause = `WHERE ${where.join(" AND ")}`;

    const rows = await pool.query(
      `SELECT t.*,
              o.offerer_wallet, o.usdf_add, o.usdf_expect,
              a.name AS offered_asset_name, a.category AS offered_asset_category
       FROM barter_trades t
       JOIN barter_offers o ON o.id = t.offer_id
       JOIN real_assets a ON a.id = o.offered_asset_id
       ${whereClause}
       ORDER BY t.settled_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return reply.send({ ok: true, trades: rows.rows, count: rows.rowCount });
  });

  // ── Market overview ─────────────────────────────────────────────────────────
  app.get("/barter/market", async (_req, reply) => {
    const [active, recentTrades, topAppreciated] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS open_offers,
               COALESCE(SUM(a.usdf_valuation), 0) AS total_value_in_market_usdf
        FROM barter_offers o
        JOIN real_assets a ON a.id = o.offered_asset_id
        WHERE o.status = 'open'
      `),
      pool.query(`
        SELECT t.id, t.settled_at, t.appreciation_pct, t.settlement_usdf,
               a.name AS asset_name, a.category,
               t.asset_a_new_value AS new_value_usdf
        FROM barter_trades t
        JOIN barter_offers o ON o.id = t.offer_id
        JOIN real_assets a ON a.id = o.offered_asset_id
        WHERE t.status = 'settled'
        ORDER BY t.settled_at DESC LIMIT 10
      `),
      pool.query(`
        SELECT r.id, r.name, r.category, r.usdf_valuation,
               COALESCE(
                 (SELECT COUNT(*) FROM barter_offers bo
                  WHERE bo.requested_asset_id = r.id AND bo.status = 'open'), 0
               ) AS demand_count
        FROM real_assets r
        WHERE r.status = 'active'
        ORDER BY r.usdf_valuation DESC LIMIT 10
      `),
    ]);

    return reply.send({
      ok: true,
      market: {
        open_offers: Number(active.rows[0].open_offers),
        total_value_in_market_usdf: Number(active.rows[0].total_value_in_market_usdf),
      },
      recent_trades: recentTrades.rows,
      top_assets_by_value: topAppreciated.rows,
    });
  });

  // ── Admin: expire stale offers ──────────────────────────────────────────────
  app.post("/barter/admin/expire-stale", async (req, reply) => {
    if (!isAdmin(req)) return reply.status(401).send({ ok: false, error: "Unauthorized" });
    try {
      const count = await expireStaleOffers();
      return reply.send({ ok: true, expired: count });
    } catch (e) {
      return reply.status(500).send({ ok: false, error: (e as Error).message });
    }
  });
}
