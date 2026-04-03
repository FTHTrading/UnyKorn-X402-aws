-- FTH x402 Migration 018: stellar_bridge_deposits + stellar_bridge_withdrawals
-- Tracks Stellar USDF <-> x402 credit account conversions.

CREATE TABLE IF NOT EXISTS stellar_bridge_deposits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_tx_hash     TEXT NOT NULL UNIQUE,
  stellar_payer       TEXT NOT NULL,
  stellar_ledger_seq  BIGINT NOT NULL DEFAULT 0,
  usdf_amount         DECIMAL(20,7) NOT NULL,
  target_wallet       TEXT NOT NULL,
  target_namespace    TEXT,
  credit_tx_id        UUID REFERENCES credit_transactions(id),
  deposit_source      TEXT NOT NULL DEFAULT 'stellar_payment'
                        CHECK (deposit_source IN ('stellar_payment', 'admin_seed', 'treasury_reserve')),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'settled', 'failed')),
  error_msg           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stellar_bridge_withdrawals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  x402_wallet          TEXT NOT NULL,
  stellar_destination  TEXT NOT NULL,
  usdf_amount          DECIMAL(20,7) NOT NULL,
  stellar_tx_hash      TEXT UNIQUE,
  credit_tx_id         UUID REFERENCES credit_transactions(id),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'settled', 'failed')),
  error_msg            TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at           TIMESTAMPTZ
);

-- Cursor table: tracks Stellar ledger sequence so the monitor can resume on restart
CREATE TABLE IF NOT EXISTS stellar_bridge_cursor (
  id         TEXT PRIMARY KEY DEFAULT 'singleton',
  paging_token TEXT NOT NULL DEFAULT 'now',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO stellar_bridge_cursor (id, paging_token) VALUES ('singleton', 'now') ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_sb_deposits_status  ON stellar_bridge_deposits(status);
CREATE INDEX IF NOT EXISTS idx_sb_deposits_payer   ON stellar_bridge_deposits(stellar_payer);
CREATE INDEX IF NOT EXISTS idx_sb_deposits_wallet  ON stellar_bridge_deposits(target_wallet);
CREATE INDEX IF NOT EXISTS idx_sb_withdrawals_wallet ON stellar_bridge_withdrawals(x402_wallet);
CREATE INDEX IF NOT EXISTS idx_sb_withdrawals_status ON stellar_bridge_withdrawals(status);
