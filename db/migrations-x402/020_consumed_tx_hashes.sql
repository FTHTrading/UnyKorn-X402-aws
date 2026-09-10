-- FTH x402 Migration 020: consumed_tx_hashes + invoice processing status
-- Prevents cross-invoice transaction replay on EVM (Base), Stellar, XRPL, and L1 rails.

CREATE TABLE IF NOT EXISTS consumed_tx_hashes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rail        TEXT NOT NULL,
  tx_hash     TEXT NOT NULL,
  invoice_id  TEXT NOT NULL,
  payer       TEXT NOT NULL,
  amount      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_consumed_tx_hashes_rail_hash UNIQUE (rail, tx_hash)
);

CREATE INDEX IF NOT EXISTS idx_consumed_tx_hashes_lookup ON consumed_tx_hashes(rail, tx_hash);
CREATE INDEX IF NOT EXISTS idx_consumed_tx_hashes_invoice ON consumed_tx_hashes(invoice_id);

-- Expand invoice status to include 'processing' for atomic lock claim during verification
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('pending', 'processing', 'paid', 'expired', 'cancelled'));
