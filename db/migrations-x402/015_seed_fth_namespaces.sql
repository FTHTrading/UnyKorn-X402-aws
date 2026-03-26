-- FTH x402 Migration 015: Seed fth.* namespace records
-- Seeds the initial set of FTH namespace records for the x402 payment protocol.
-- These are the canonical namespace entries that map FQNs to live services.

-- ─────────────────────────────────────────────────────────────────────
-- Core infrastructure namespaces
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  -- Gateway
  ('fth.x402.gateway', 'fth-ops', 'endpoint', 'cloudflare', 'https://api.fth.trading', 'public', false, null),

  -- Facilitator
  ('fth.x402.facilitator', 'fth-ops', 'endpoint', 'aws-ec2', 'https://facilitator.l1.unykorn.org', 'public', false, null),

  -- Treasury
  ('fth.x402.treasury', 'fth-ops', 'endpoint', 'aws-ec2', 'https://treasury.l1.unykorn.org', 'public', false, null),

  -- Guardian
  ('fth.x402.guardian', 'fth-ops', 'endpoint', 'aws-ec2', 'https://guardian.l1.unykorn.org', 'public', false, null),

  -- Financial Core (internal)
  ('fth.x402.financial-core', 'fth-ops', 'endpoint', 'aws-ec2', 'http://localhost:4400', 'private', false, null)

ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- Paid route namespaces (revenue-generating)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('fth.x402.route.agent-pay-api', 'fth-ops', 'endpoint', 'cloudflare', 'https://api.fth.trading/api/v1/agent/pay-api', 'public', true,
    '{"asset": "UNY", "amount": "0.0001", "rail": "unykorn-l1", "memo_prefix": "fth:agent-pay-api"}'::jsonb),

  ('fth.x402.route.genesis-repro', 'fth-ops', 'endpoint', 'cloudflare', 'https://api.fth.trading/api/v1/genesis/repro-pack', 'public', true,
    '{"asset": "UNY", "amount": "0.0005", "rail": "unykorn-l1", "memo_prefix": "fth:genesis"}'::jsonb),

  ('fth.x402.route.trade-verify', 'fth-ops', 'endpoint', 'cloudflare', 'https://api.fth.trading/api/v1/trade/verify', 'public', true,
    '{"asset": "UNY", "amount": "0.00025", "rail": "unykorn-l1", "memo_prefix": "fth:trade"}'::jsonb),

  ('fth.x402.route.invoice-export', 'fth-ops', 'endpoint', 'cloudflare', 'https://api.fth.trading/api/v1/invoices/export', 'public', true,
    '{"asset": "UNY", "amount": "0.001", "rail": "unykorn-l1", "memo_prefix": "fth:invoice-export", "min_pass_level": "pro"}'::jsonb)

ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- Asset namespaces
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('fth.asset.uny', 'fth-ops', 'asset', 'unykorn-l1', '0x0000000000000000000000000000000000000000', 'public', false, null),
  ('fth.asset.usdf', 'fth-ops', 'asset', 'avalanche-c', '0x0000000000000000000000000000000000000000', 'public', false, null),
  ('fth.asset.susdf', 'fth-ops', 'asset', 'stellar-testnet', 'sUSDF', 'public', false, null),
  ('fth.asset.xusdf', 'fth-ops', 'asset', 'xrpl-testnet', 'xUSDF', 'public', false, null),
  ('fth.asset.wxau', 'fth-ops', 'asset', 'unykorn-l1', 'wXAU', 'public', false, null),
  ('fth.asset.wustb', 'fth-ops', 'asset', 'unykorn-l1', 'wUSTB', 'public', false, null)

ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- A2A discovery namespaces
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('fth.a2a.gateway', 'fth-ops', 'endpoint', 'cloudflare', 'https://api.fth.trading/.well-known/agent.json', 'public', false, null),
  ('fth.a2a.facilitator', 'fth-ops', 'endpoint', 'aws-ec2', 'https://facilitator.l1.unykorn.org/.well-known/agent.json', 'public', false, null),
  ('fth.a2a.treasury', 'fth-ops', 'endpoint', 'aws-ec2', 'https://treasury.l1.unykorn.org/.well-known/agent.json', 'public', false, null),
  ('fth.a2a.guardian', 'fth-ops', 'endpoint', 'aws-ec2', 'https://guardian.l1.unykorn.org/.well-known/agent.json', 'public', false, null),
  ('fth.a2a.registry', 'fth-ops', 'config', null, 'https://github.com/FTHTrading/UnyKorn-X402-aws/blob/main/registry/a2a-agents.json', 'public', false, null)

ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- Protocol configuration
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('fth.config.stellar-toml', 'fth-ops', 'config', 'stellar', 'https://l1.unykorn.org/.well-known/stellar.toml', 'public', false, null),
  ('fth.config.x402-protocol', 'fth-ops', 'config', null, 'https://facilitator.l1.unykorn.org/.well-known/x402-pay', 'public', false, null),
  ('fth.config.openapi', 'fth-ops', 'config', null, 'https://facilitator.l1.unykorn.org/.well-known/openapi.json', 'public', false, null),
  ('fth.config.bridge', 'fth-ops', 'config', 'unykorn-l1', 'https://bridge.l1.unykorn.org', 'public', false, null)

ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- Policy namespaces (PASS tiers)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('fth.pass.basic', 'fth-ops', 'policy', null, '{"tier": "basic", "rate_limit": "100/hour", "routes": ["agent-pay-api", "genesis-repro", "trade-verify"]}', 'public', false, null),
  ('fth.pass.pro', 'fth-ops', 'policy', null, '{"tier": "pro", "rate_limit": "1000/hour", "routes": ["agent-pay-api", "genesis-repro", "trade-verify", "invoice-export"]}', 'public', false, null),
  ('fth.pass.institutional', 'fth-ops', 'policy', null, '{"tier": "institutional", "rate_limit": "10000/hour", "routes": "*", "features": ["bulk-export", "custom-pricing", "sla"]}', 'permissioned', false, null),
  ('fth.pass.kyc-enhanced', 'fth-ops', 'policy', null, '{"tier": "kyc-enhanced", "rate_limit": "unlimited", "routes": "*", "features": ["trade-finance", "institutional", "audit-export"]}', 'permissioned', false, null)

ON CONFLICT (fqn) DO NOTHING;
