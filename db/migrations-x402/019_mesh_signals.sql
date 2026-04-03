-- FTH x402 Migration 019: mesh_signals
-- Neural mesh event bus — every impulse that flows through the network is recorded here.
-- Used by the pulse controller for replay, state reconstruction, and cascade triggering.

CREATE TABLE IF NOT EXISTS mesh_signals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type   TEXT NOT NULL,        -- 'trade_settled', 'asset_appreciated', 'deposit_received',
                                      --   'offer_created', 'offer_expired', 'treasury_refill',
                                      --   'heartbeat', 'agent_activated', 'cascade_fired'
  source        TEXT NOT NULL,        -- service that emitted the signal
  subject_id    TEXT,                 -- asset_id / offer_id / agent_id / wallet — whatever the signal is about
  payload       JSONB NOT NULL DEFAULT '{}',
  propagated    BOOLEAN NOT NULL DEFAULT false,  -- has the pulse controller consumed + cascaded it?
  fired_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- asset_activity: rolling activity score per asset (demand = how many signals reference it)
CREATE TABLE IF NOT EXISTS asset_activity (
  asset_id          UUID PRIMARY KEY REFERENCES real_assets(id) ON DELETE CASCADE,
  trade_count       INTEGER NOT NULL DEFAULT 0,
  offer_count       INTEGER NOT NULL DEFAULT 0,
  demand_score      DECIMAL(10,4) NOT NULL DEFAULT 0.0000,  -- weighted composite
  last_signal_at    TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mesh_signals_type       ON mesh_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_mesh_signals_propagated ON mesh_signals(propagated) WHERE NOT propagated;
CREATE INDEX IF NOT EXISTS idx_mesh_signals_subject    ON mesh_signals(subject_id);
CREATE INDEX IF NOT EXISTS idx_mesh_signals_fired      ON mesh_signals(fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_activity_demand   ON asset_activity(demand_score DESC);
