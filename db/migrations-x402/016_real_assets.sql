-- FTH x402 Migration 016: real_assets + asset_valuations
-- Real-world asset registry backed by USDF valuations.

CREATE TABLE IF NOT EXISTS real_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'generic',
  description     TEXT,
  owner_wallet    TEXT NOT NULL,
  usdf_valuation  DECIMAL(20,7) NOT NULL DEFAULT 0.0000000,
  metadata        JSONB DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'pending', 'sold', 'archived')),
  ipfs_hash       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_valuations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    UUID NOT NULL REFERENCES real_assets(id) ON DELETE CASCADE,
  usdf_value  DECIMAL(20,7) NOT NULL,
  reason      TEXT,
  set_by      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_real_assets_owner    ON real_assets(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_real_assets_status   ON real_assets(status);
CREATE INDEX IF NOT EXISTS idx_real_assets_category ON real_assets(category);
CREATE INDEX IF NOT EXISTS idx_asset_val_asset       ON asset_valuations(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_val_created     ON asset_valuations(created_at);
