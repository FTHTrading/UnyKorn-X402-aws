/**
 * FTH x402 Facilitator — Invoice Service
 *
 * Creates, looks up, and manages payment invoices.
 * Invoices are short-lived (default 5min TTL) and single-use (replay guard).
 */

import { nanoid } from "nanoid";
import pool from "../db";
import type { Invoice, InvoiceCreateBody } from "../types";

/**
 * Create a new invoice. Returns invoice_id + nonce + expiry.
 */
export async function createInvoice(body: InvoiceCreateBody) {
  const invoice_id = `inv_${nanoid(16)}`;
  const nonce = `n_${nanoid(12)}`;
  const ttl = body.ttl_seconds ?? 300;
  const expires_at = new Date(Date.now() + ttl * 1000);
  const namespace = body.namespace ?? "default";

  await pool.query(
    `INSERT INTO invoices
       (invoice_id, nonce, resource, namespace, asset, amount, receiver, rail, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
    [
      invoice_id,
      nonce,
      body.resource,
      namespace,
      body.asset,
      body.amount,
      body.receiver,
      body.rail ?? "unykorn-l1",
      expires_at,
    ],
  );

  return { invoice_id, nonce, expires_at: expires_at.toISOString() };
}

/**
 * Look up an invoice by invoice_id.
 */
export async function getInvoice(invoice_id: string): Promise<Invoice | null> {
  const { rows } = await pool.query(
    `SELECT * FROM invoices WHERE invoice_id = $1`,
    [invoice_id],
  );
  return (rows[0] as Invoice) ?? null;
}

/**
 * Atomically claim an invoice for processing to prevent settle-before-mark race conditions.
 * Returns true if the claim succeeded (row updated from pending -> processing).
 */
export async function claimInvoiceForProcessing(invoice_id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE invoices
     SET status = 'processing'
     WHERE invoice_id = $1 AND status = 'pending'`,
    [invoice_id],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Release an invoice back to 'pending' if settlement failed.
 */
export async function releaseInvoiceToPending(invoice_id: string): Promise<void> {
  await pool.query(
    `UPDATE invoices
     SET status = 'pending'
     WHERE invoice_id = $1 AND status = 'processing'`,
    [invoice_id],
  );
}

/**
 * Finalize an invoice as paid after successful settlement.
 * Only transitions from 'processing' (or 'pending') to 'paid'.
 */
export async function finalizeInvoicePaid(
  invoice_id: string,
  payer: string,
  proof_type: string,
  proof_data: Record<string, unknown>,
  client?: { query: (q: string, params: any[]) => Promise<any> },
): Promise<boolean> {
  const executor = client ?? pool;
  const { rowCount } = await executor.query(
    `UPDATE invoices
     SET status = 'paid', payer = $2, proof_type = $3, proof_data = $4, paid_at = now()
     WHERE invoice_id = $1 AND (status = 'processing' OR status = 'pending')`,
    [invoice_id, payer, proof_type, JSON.stringify(proof_data)],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Mark an invoice as paid with the given proof (legacy wrapper).
 */
export async function markInvoicePaid(
  invoice_id: string,
  payer: string,
  proof_type: string,
  proof_data: Record<string, unknown>,
): Promise<boolean> {
  return finalizeInvoicePaid(invoice_id, payer, proof_type, proof_data);
}

/**
 * Expire invoices past their TTL (called periodically).
 */
export async function expireInvoices(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE invoices SET status = 'expired' WHERE status = 'pending' AND expires_at < now()`,
  );
  return rowCount ?? 0;
}
