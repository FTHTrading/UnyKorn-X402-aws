#!/usr/bin/env node
/**
 * x402 Namespace Seeder — Seed fth.* namespace records
 *
 * Seeds the namespace_records table with all FTH namespace entries.
 * Can be run standalone or as part of the deployment pipeline.
 *
 * Usage:
 *   node scripts/x402-seed-namespaces.mjs [--dry-run]
 *
 * Requires: DATABASE_URL or PGHOST environment variable
 */

import pg from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Namespace seed records ────────────────────────────────────────────

const SEED_RECORDS = [
  // ─── Core infrastructure ───────────────────────────────────────
  {
    fqn: "fth.x402.gateway",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://api.fth.trading",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.x402.facilitator",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://facilitator.l1.unykorn.org",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.x402.treasury",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://treasury.l1.unykorn.org",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.x402.guardian",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://guardian.l1.unykorn.org",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.x402.financial-core",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "http://localhost:4400",
    visibility: "private",
    payment_required: false,
    payment_config: null,
  },

  // ─── Paid routes (revenue) ─────────────────────────────────────
  {
    fqn: "fth.x402.route.agent-pay-api",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://api.fth.trading/api/v1/agent/pay-api",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.0001", rail: "unykorn-l1", memo_prefix: "fth:agent-pay-api" },
  },
  {
    fqn: "fth.x402.route.genesis-repro",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://api.fth.trading/api/v1/genesis/repro-pack",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.0005", rail: "unykorn-l1", memo_prefix: "fth:genesis" },
  },
  {
    fqn: "fth.x402.route.trade-verify",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://api.fth.trading/api/v1/trade/verify",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.00025", rail: "unykorn-l1", memo_prefix: "fth:trade" },
  },
  {
    fqn: "fth.x402.route.invoice-export",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://api.fth.trading/api/v1/invoices/export",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.001", rail: "unykorn-l1", memo_prefix: "fth:invoice-export", min_pass_level: "pro" },
  },

  // ─── A2A discovery ─────────────────────────────────────────────
  {
    fqn: "fth.a2a.gateway",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://api.fth.trading/.well-known/agent.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.a2a.facilitator",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://facilitator.l1.unykorn.org/.well-known/agent.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.a2a.treasury",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://treasury.l1.unykorn.org/.well-known/agent.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.a2a.guardian",
    owner: "fth-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://guardian.l1.unykorn.org/.well-known/agent.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.a2a.registry",
    owner: "fth-ops",
    resolve_type: "config",
    resolve_network: null,
    resolve_value: "https://github.com/FTHTrading/UnyKorn-X402-aws/blob/main/registry/a2a-agents.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },

  // ─── Assets ────────────────────────────────────────────────────
  {
    fqn: "fth.asset.uny",
    owner: "fth-ops",
    resolve_type: "asset",
    resolve_network: "unykorn-l1",
    resolve_value: "UNY",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.asset.usdf",
    owner: "fth-ops",
    resolve_type: "asset",
    resolve_network: "avalanche-c",
    resolve_value: "USDF",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.asset.susdf",
    owner: "fth-ops",
    resolve_type: "asset",
    resolve_network: "stellar-testnet",
    resolve_value: "sUSDF",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.asset.xusdf",
    owner: "fth-ops",
    resolve_type: "asset",
    resolve_network: "xrpl-testnet",
    resolve_value: "xUSDF",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.asset.wxau",
    owner: "fth-ops",
    resolve_type: "asset",
    resolve_network: "unykorn-l1",
    resolve_value: "wXAU",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.asset.wustb",
    owner: "fth-ops",
    resolve_type: "asset",
    resolve_network: "unykorn-l1",
    resolve_value: "wUSTB",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },

  // ─── Config ────────────────────────────────────────────────────
  {
    fqn: "fth.config.stellar-toml",
    owner: "fth-ops",
    resolve_type: "config",
    resolve_network: "stellar",
    resolve_value: "https://l1.unykorn.org/.well-known/stellar.toml",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.config.x402-protocol",
    owner: "fth-ops",
    resolve_type: "config",
    resolve_network: null,
    resolve_value: "https://facilitator.l1.unykorn.org/.well-known/x402-pay",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.config.openapi",
    owner: "fth-ops",
    resolve_type: "config",
    resolve_network: null,
    resolve_value: "https://facilitator.l1.unykorn.org/.well-known/openapi.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },

  // ─── PASS tiers ────────────────────────────────────────────────
  {
    fqn: "fth.pass.basic",
    owner: "fth-ops",
    resolve_type: "policy",
    resolve_network: null,
    resolve_value: '{"tier":"basic","rate_limit":"100/hour"}',
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.pass.pro",
    owner: "fth-ops",
    resolve_type: "policy",
    resolve_network: null,
    resolve_value: '{"tier":"pro","rate_limit":"1000/hour"}',
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.pass.institutional",
    owner: "fth-ops",
    resolve_type: "policy",
    resolve_network: null,
    resolve_value: '{"tier":"institutional","rate_limit":"10000/hour"}',
    visibility: "permissioned",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "fth.pass.kyc-enhanced",
    owner: "fth-ops",
    resolve_type: "policy",
    resolve_network: null,
    resolve_value: '{"tier":"kyc-enhanced","rate_limit":"unlimited"}',
    visibility: "permissioned",
    payment_required: false,
    payment_config: null,
  },
];

const UPSERT_SQL = `
INSERT INTO namespace_records
  (fqn, owner, resolve_type, resolve_network, resolve_value, visibility, payment_required, payment_config)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (fqn) DO UPDATE SET
  owner = EXCLUDED.owner,
  resolve_type = EXCLUDED.resolve_type,
  resolve_network = EXCLUDED.resolve_network,
  resolve_value = EXCLUDED.resolve_value,
  visibility = EXCLUDED.visibility,
  payment_required = EXCLUDED.payment_required,
  payment_config = EXCLUDED.payment_config,
  updated_at = now()
`;

async function main() {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   FTH x402 — Namespace Seeder                 ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  if (DRY_RUN) {
    console.log("  [DRY RUN] — No database changes will be made.\n");
    for (const r of SEED_RECORDS) {
      const paid = r.payment_required ? "💰 PAID" : "   free";
      console.log(`  ${paid}  ${r.fqn}`);
      console.log(`           → ${r.resolve_value}`);
    }
    console.log(`\n  Total: ${SEED_RECORDS.length} namespace records\n`);
    return;
  }

  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error("  [FATAL] DATABASE_URL is required. Set it in .env or environment.\n");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: connStr });

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const r of SEED_RECORDS) {
    try {
      const result = await pool.query(UPSERT_SQL, [
        r.fqn,
        r.owner,
        r.resolve_type,
        r.resolve_network,
        r.resolve_value,
        r.visibility,
        r.payment_required,
        r.payment_config ? JSON.stringify(r.payment_config) : null,
      ]);
      if (result.rowCount > 0) {
        // Check if it was insert or update
        const check = await pool.query(
          "SELECT created_at, updated_at FROM namespace_records WHERE fqn = $1",
          [r.fqn],
        );
        const row = check.rows[0];
        if (row && row.created_at.getTime() === row.updated_at.getTime()) {
          inserted++;
          console.log(`  ✓ INSERT  ${r.fqn}`);
        } else {
          updated++;
          console.log(`  ↻ UPDATE  ${r.fqn}`);
        }
      }
    } catch (err) {
      errors++;
      console.error(`  ✗ ERROR   ${r.fqn}: ${err.message}`);
    }
  }

  await pool.end();

  console.log("\n  ─────────────────────────────────────────────");
  console.log(`  Inserted: ${inserted}  Updated: ${updated}  Errors: ${errors}`);
  console.log(`  Total: ${SEED_RECORDS.length} namespace records\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
