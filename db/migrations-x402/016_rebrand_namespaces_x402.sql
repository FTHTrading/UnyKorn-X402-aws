-- x402 Migration 016: Rebrand namespaces — fth.* → x402.*
-- Replaces all fth-branded namespaces with neutral x402.* hierarchy.
-- 36 canonical namespaces covering: core, routes, assets, a2a, config, pass, apostle, commerce.

BEGIN;

-- Remove legacy fth.* entries (replaced below)
DELETE FROM namespace_records WHERE fqn LIKE 'fth.%';

-- ─────────────────────────────────────────────────────────────────────
-- 1. Core infrastructure (6)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('x402.core.gateway',        'x402-ops', 'endpoint', 'cloudflare',  'https://gateway.l1.unykorn.org',     'public',  false, null),
  ('x402.core.facilitator',    'x402-ops', 'endpoint', 'aws-ec2',     'https://facilitator.l1.unykorn.org', 'public',  false, null),
  ('x402.core.treasury',       'x402-ops', 'endpoint', 'aws-ec2',     'https://treasury.l1.unykorn.org',    'public',  false, null),
  ('x402.core.guardian',       'x402-ops', 'endpoint', 'aws-ec2',     'https://guardian.l1.unykorn.org',     'public',  false, null),
  ('x402.core.financial',      'x402-ops', 'endpoint', 'aws-ec2',     'http://localhost:4400',               'private', false, null),
  ('x402.core.settlement',     'x402-ops', 'endpoint', 'aws-ec2',     'https://settlement.l1.unykorn.org',  'public',  false, null)
ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Paid routes — revenue-generating endpoints (6)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('x402.route.agent-pay',     'x402-ops', 'endpoint', 'cloudflare', 'https://gateway.l1.unykorn.org/api/v1/agent/pay-api',     'public', true,
    '{"asset": "UNY", "amount": "0.0001", "rail": "unykorn-l1", "memo_prefix": "x402:agent-pay"}'::jsonb),

  ('x402.route.genesis-repro', 'x402-ops', 'endpoint', 'cloudflare', 'https://gateway.l1.unykorn.org/api/v1/genesis/repro-pack', 'public', true,
    '{"asset": "UNY", "amount": "0.0005", "rail": "unykorn-l1", "memo_prefix": "x402:genesis"}'::jsonb),

  ('x402.route.trade-verify',  'x402-ops', 'endpoint', 'cloudflare', 'https://gateway.l1.unykorn.org/api/v1/trade/verify',      'public', true,
    '{"asset": "UNY", "amount": "0.00025", "rail": "unykorn-l1", "memo_prefix": "x402:trade"}'::jsonb),

  ('x402.route.invoice-export','x402-ops', 'endpoint', 'cloudflare', 'https://gateway.l1.unykorn.org/api/v1/invoices/export',   'public', true,
    '{"asset": "UNY", "amount": "0.001", "rail": "unykorn-l1", "memo_prefix": "x402:invoice-export", "min_pass_level": "pro"}'::jsonb),

  ('x402.route.receipt-lookup','x402-ops', 'endpoint', 'cloudflare', 'https://gateway.l1.unykorn.org/api/v1/receipts/lookup',   'public', true,
    '{"asset": "UNY", "amount": "0.0001", "rail": "unykorn-l1", "memo_prefix": "x402:receipt"}'::jsonb),

  ('x402.route.analytics',    'x402-ops', 'endpoint', 'cloudflare', 'https://gateway.l1.unykorn.org/api/v1/analytics',          'public', true,
    '{"asset": "UNY", "amount": "0.002", "rail": "unykorn-l1", "memo_prefix": "x402:analytics", "min_pass_level": "pro"}'::jsonb)

ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Asset namespaces (6)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('x402.asset.uny',   'x402-ops', 'asset', 'unykorn-l1',      '0x0000000000000000000000000000000000000000', 'public', false, null),
  ('x402.asset.usdf',  'x402-ops', 'asset', 'avalanche-c',     '0x0000000000000000000000000000000000000000', 'public', false, null),
  ('x402.asset.susdf', 'x402-ops', 'asset', 'stellar-testnet', 'sUSDF',                                     'public', false, null),
  ('x402.asset.xusdf', 'x402-ops', 'asset', 'xrpl-testnet',    'xUSDF',                                     'public', false, null),
  ('x402.asset.wxau',  'x402-ops', 'asset', 'unykorn-l1',      'wXAU',                                      'public', false, null),
  ('x402.asset.wustb', 'x402-ops', 'asset', 'unykorn-l1',      'wUSTB',                                     'public', false, null)
ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 4. A2A agent discovery (5)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('x402.a2a.gateway',     'x402-ops', 'endpoint', 'cloudflare', 'https://gateway.l1.unykorn.org/.well-known/agent.json',     'public', false, null),
  ('x402.a2a.facilitator', 'x402-ops', 'endpoint', 'aws-ec2',    'https://facilitator.l1.unykorn.org/.well-known/agent.json', 'public', false, null),
  ('x402.a2a.treasury',    'x402-ops', 'endpoint', 'aws-ec2',    'https://treasury.l1.unykorn.org/.well-known/agent.json',    'public', false, null),
  ('x402.a2a.guardian',    'x402-ops', 'endpoint', 'aws-ec2',    'https://guardian.l1.unykorn.org/.well-known/agent.json',     'public', false, null),
  ('x402.a2a.registry',   'x402-ops', 'config',   null,          'https://registry.l1.unykorn.org/a2a-agents.json',           'public', false, null)
ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Protocol configuration (4)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('x402.config.stellar-toml', 'x402-ops', 'config', 'stellar',    'https://l1.unykorn.org/.well-known/stellar.toml',     'public', false, null),
  ('x402.config.protocol',     'x402-ops', 'config', null,         'https://facilitator.l1.unykorn.org/.well-known/x402-pay', 'public', false, null),
  ('x402.config.openapi',      'x402-ops', 'config', null,         'https://facilitator.l1.unykorn.org/.well-known/openapi.json', 'public', false, null),
  ('x402.config.bridge',       'x402-ops', 'config', 'unykorn-l1', 'https://bridge.l1.unykorn.org',                       'public', false, null)
ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 6. PASS access tiers (4)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('x402.pass.basic',          'x402-ops', 'policy', null, '{"tier": "basic", "rate_limit": "100/hour", "routes": ["agent-pay", "genesis-repro", "trade-verify"]}',                                          'public',       false, null),
  ('x402.pass.pro',            'x402-ops', 'policy', null, '{"tier": "pro", "rate_limit": "1000/hour", "routes": ["agent-pay", "genesis-repro", "trade-verify", "invoice-export", "receipt-lookup"]}',        'public',       false, null),
  ('x402.pass.institutional',  'x402-ops', 'policy', null, '{"tier": "institutional", "rate_limit": "10000/hour", "routes": "*", "features": ["bulk-export", "custom-pricing", "sla"]}',                     'permissioned', false, null),
  ('x402.pass.kyc-enhanced',   'x402-ops', 'policy', null, '{"tier": "kyc-enhanced", "rate_limit": "unlimited", "routes": "*", "features": ["trade-finance", "institutional", "audit-export"]}',              'permissioned', false, null)
ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Apostle Chain namespaces (3)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('x402.apostle.mesh',       'x402-ops', 'endpoint', 'unykorn-l1', 'https://apostle.l1.unykorn.org/v1/agents',     'public', false, null),
  ('x402.apostle.ledger',     'x402-ops', 'endpoint', 'unykorn-l1', 'https://apostle.l1.unykorn.org/v1/tx',         'public', false, null),
  ('x402.apostle.settlement', 'x402-ops', 'endpoint', 'unykorn-l1', 'https://apostle.l1.unykorn.org/v1/settlement', 'public', false, null)
ON CONFLICT (fqn) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 8. Commerce namespaces (2)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO namespace_records (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ('x402.commerce.invoices', 'x402-ops', 'endpoint', 'aws-ec2', 'https://facilitator.l1.unykorn.org/invoices',  'public', false, null),
  ('x402.commerce.channels', 'x402-ops', 'endpoint', 'aws-ec2', 'https://facilitator.l1.unykorn.org/channels', 'public', false, null)
ON CONFLICT (fqn) DO NOTHING;

COMMIT;

-- Total: 36 namespaces
-- Core (6) + Routes (6) + Assets (6) + A2A (5) + Config (4) + PASS (4) + Apostle (3) + Commerce (2) = 36
