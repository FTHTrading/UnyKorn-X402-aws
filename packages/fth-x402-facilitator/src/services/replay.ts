/**
 * FTH x402 Facilitator — Replay Guard
 *
 * Prevents double-spend by tracking consumed (invoice_id, nonce) pairs.
 * Uses a PostgreSQL-backed set check. In production, consider a Redis
 * Bloom filter for hot-path speed.
 */

import pool from "../db";

/**
 * Check if this (invoice_id, nonce) pair was already consumed.
 */
export async function checkReplay(
  invoice_id: string,
  nonce: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM invoices
     WHERE invoice_id = $1 AND nonce = $2 AND status = 'paid'`,
    [invoice_id, nonce],
  );
  return rows.length > 0;
}

/**
 * Check if a transaction hash has already been consumed on a specific rail.
 * Prevents cross-invoice transaction replay.
 */
export async function checkTxHashConsumed(
  rail: string,
  tx_hash: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM consumed_tx_hashes
     WHERE rail = $1 AND tx_hash = $2`,
    [rail, tx_hash],
  );
  return rows.length > 0;
}

/**
 * Record a transaction hash as consumed.
 * Uses a unique constraint on (rail, tx_hash) to guarantee single-use.
 */
export async function recordConsumedTxHash(
  rail: string,
  tx_hash: string,
  invoice_id: string,
  payer: string,
  amount: string,
  client?: { query: (q: string, params: any[]) => Promise<any> },
): Promise<void> {
  const executor = client ?? pool;
  await executor.query(
    `INSERT INTO consumed_tx_hashes
       (rail, tx_hash, invoice_id, payer, amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (rail, tx_hash) DO NOTHING`,
    [rail, tx_hash, invoice_id, payer, amount],
  );
}

/**
 * Record that a nonce was consumed (the invoice update in markInvoicePaid
 * handles this implicitly, but we keep the explicit call for clarity).
 */
export async function recordNonce(
  _invoice_id: string,
  _nonce: string,
): Promise<void> {
  // Currently handled by markInvoicePaid setting status = 'paid'.
}
