/**
 * FTH x402 Facilitator — Explorer Data Routes
 *
 * Public read-only endpoints for the UnyKorn L1 Explorer.
 * These power the explorer dashboard and live data views.
 * No auth required — read-only aggregate data.
 */

import type { FastifyInstance } from "fastify";
import pool from "../db";

export default async function explorerRoutes(app: FastifyInstance): Promise<void> {
  // ── Public Stats (free) ─────────────────────────────────
  app.get("/explorer/stats", async (_req, reply) => {
    const [invoiceStats, receiptStats, namespaceStats] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_invoices,
          COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount::numeric ELSE 0 END), 0)::text AS total_revenue
        FROM invoices
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_receipts,
          COUNT(DISTINCT payer)::int AS unique_payers,
          COUNT(DISTINCT batch_id) FILTER (WHERE batch_id IS NOT NULL)::int AS total_batches
        FROM receipts
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_namespaces,
          COUNT(*) FILTER (WHERE payment_required = true)::int AS paid_namespaces
        FROM namespace_records
      `),
    ]);

    return reply.send({
      invoices: invoiceStats.rows[0],
      receipts: receiptStats.rows[0],
      namespaces: namespaceStats.rows[0],
      services: { facilitator: "up", treasury: "up", guardian: "up", gateway: "up" },
      chain: { id: 7331, name: "UnyKorn L1", symbol: "UNY" },
      timestamp: new Date().toISOString(),
    });
  });

  // ── Public Invoice List (free, limited) ─────────────────
  app.get<{
    Querystring: { limit?: string; status?: string };
  }>("/explorer/invoices", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 50);
    const statusFilter = req.query.status;

    let query = `
      SELECT invoice_id, resource, namespace, amount, asset, status,
             receiver, created_at, expires_at, proof_type
      FROM invoices
    `;
    const params: any[] = [];
    if (statusFilter && ["pending", "paid", "expired"].includes(statusFilter)) {
      query += ` WHERE status = $1`;
      params.push(statusFilter);
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    return reply.send({ invoices: rows, count: rows.length });
  });

  // ── Public Receipts (free, limited) ─────────────────────
  app.get<{
    Querystring: { limit?: string };
  }>("/explorer/receipts", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 50);

    const { rows } = await pool.query(
      `SELECT receipt_id, invoice_id, payer, amount, asset, rail,
              batch_id, merkle_index, created_at
       FROM receipts
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return reply.send({ receipts: rows, count: rows.length });
  });

  // ── Public Receipt Roots (free) ─────────────────────────
  app.get<{
    Querystring: { limit?: string };
  }>("/explorer/roots", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 50);

    const { rows } = await pool.query(
      `SELECT batch_id, merkle_root, item_count, rail,
              anchor_tx_hash, anchored_at, created_at
       FROM receipt_roots
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return reply.send({ roots: rows, count: rows.length });
  });

  // ── Public Namespaces (free) ────────────────────────────
  app.get("/explorer/namespaces", async (_req, reply) => {
    const { rows } = await pool.query(
      `SELECT fqn, owner, resolve_type, resolve_value, visibility,
              payment_required, created_at
       FROM namespace_records
       ORDER BY fqn ASC`,
    );
    return reply.send({ namespaces: rows, count: rows.length });
  });

  // ── Revenue feed (free — recent revenue events) ────────
  app.get<{
    Querystring: { limit?: string };
  }>("/explorer/revenue", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);

    const { rows } = await pool.query(
      `SELECT i.invoice_id, i.resource, i.namespace, i.amount, i.asset,
              i.status, r.receipt_id, r.payer, r.rail, r.proof_type,
              r.created_at AS paid_at
       FROM receipts r
       JOIN invoices i ON i.invoice_id = r.invoice_id
       ORDER BY r.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return reply.send({ revenue: rows, count: rows.length });
  });
}
