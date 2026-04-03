-- FTH x402 Migration 017: barter_offers + barter_trades
-- Peer-to-peer asset barter with USDF differential settlement and value appreciation.

CREATE TABLE IF NOT EXISTS barter_offers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offerer_wallet      TEXT NOT NULL,
  offered_asset_id    UUID NOT NULL REFERENCES real_assets(id) ON DELETE RESTRICT,
  requested_asset_id  UUID REFERENCES real_assets(id) ON DELETE SET NULL,
  requested_category  TEXT,                         -- match ANY asset in this category when requested_asset_id is null
  usdf_add            DECIMAL(20,7) NOT NULL DEFAULT 0.0000000,  -- offerer adds USDF to sweeten deal
  usdf_expect         DECIMAL(20,7) NOT NULL DEFAULT 0.0000000,  -- offerer expects USDF from counterparty
  platform_fee_usdf   DECIMAL(20,7) NOT NULL DEFAULT 0.1000000,  -- collected on listing
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'accepted', 'cancelled', 'expired')),
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS barter_trades (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id            UUID NOT NULL REFERENCES barter_offers(id) ON DELETE RESTRICT,
  counterparty_wallet TEXT NOT NULL,
  counterparty_asset_id UUID REFERENCES real_assets(id),
  x402_receipt_ref    TEXT,                          -- credit transaction id for the settlement
  settlement_usdf     DECIMAL(20,7) NOT NULL DEFAULT 0.0000000,
  asset_a_old_value   DECIMAL(20,7),
  asset_b_old_value   DECIMAL(20,7),
  asset_a_new_value   DECIMAL(20,7),
  asset_b_new_value   DECIMAL(20,7),
  appreciation_pct    DECIMAL(5,2) NOT NULL DEFAULT 3.00,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'settled', 'failed')),
  error_msg           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_barter_offers_offerer  ON barter_offers(offerer_wallet);
CREATE INDEX IF NOT EXISTS idx_barter_offers_status   ON barter_offers(status);
CREATE INDEX IF NOT EXISTS idx_barter_offers_asset    ON barter_offers(offered_asset_id);
CREATE INDEX IF NOT EXISTS idx_barter_trades_offer    ON barter_trades(offer_id);
CREATE INDEX IF NOT EXISTS idx_barter_trades_party    ON barter_trades(counterparty_wallet);
CREATE INDEX IF NOT EXISTS idx_barter_trades_status   ON barter_trades(status);
