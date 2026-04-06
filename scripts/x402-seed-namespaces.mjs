#!/usr/bin/env node
/**
 * x402 Namespace Seeder — Seed x402.* namespace records
 *
 * Seeds the namespace_records table with all x402 namespace entries.
 * Can be run standalone or as part of the deployment pipeline.
 *
 * Usage:
 *   node scripts/x402-seed-namespaces.mjs [--dry-run]
 *
 * Requires: DATABASE_URL or PGHOST environment variable
 */

import pg from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Namespace seed records (36 total) ─────────────────────────────────

const SEED_RECORDS = [
  // ─── 1. Core infrastructure (6) ────────────────────────────────
  {
    fqn: "x402.core.gateway",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://gateway.l1.unykorn.org",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.core.facilitator",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://facilitator.l1.unykorn.org",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.core.treasury",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://treasury.l1.unykorn.org",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.core.guardian",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://guardian.l1.unykorn.org",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.core.financial",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "http://localhost:4400",
    visibility: "private",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.core.settlement",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://settlement.l1.unykorn.org",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },

  // ─── 2. Paid routes — revenue-generating (6) ──────────────────
  {
    fqn: "x402.route.agent-pay",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://gateway.l1.unykorn.org/api/v1/agent/pay-api",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.0001", rail: "unykorn-l1", memo_prefix: "x402:agent-pay" },
  },
  {
    fqn: "x402.route.genesis-repro",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://gateway.l1.unykorn.org/api/v1/genesis/repro-pack",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.0005", rail: "unykorn-l1", memo_prefix: "x402:genesis" },
  },
  {
    fqn: "x402.route.trade-verify",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://gateway.l1.unykorn.org/api/v1/trade/verify",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.00025", rail: "unykorn-l1", memo_prefix: "x402:trade" },
  },
  {
    fqn: "x402.route.invoice-export",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://gateway.l1.unykorn.org/api/v1/invoices/export",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.001", rail: "unykorn-l1", memo_prefix: "x402:invoice-export", min_pass_level: "pro" },
  },
  {
    fqn: "x402.route.receipt-lookup",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://gateway.l1.unykorn.org/api/v1/receipts/lookup",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.0001", rail: "unykorn-l1", memo_prefix: "x402:receipt" },
  },
  {
    fqn: "x402.route.analytics",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://gateway.l1.unykorn.org/api/v1/analytics",
    visibility: "public",
    payment_required: true,
    payment_config: { asset: "UNY", amount: "0.002", rail: "unykorn-l1", memo_prefix: "x402:analytics", min_pass_level: "pro" },
  },

  // ─── 3. Assets (6) ────────────────────────────────────────────
  {
    fqn: "x402.asset.uny",
    owner: "x402-ops",
    resolve_type: "asset",
    resolve_network: "unykorn-l1",
    resolve_value: "0x0000000000000000000000000000000000000000",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.asset.usdf",
    owner: "x402-ops",
    resolve_type: "asset",
    resolve_network: "avalanche-c",
    resolve_value: "0x0000000000000000000000000000000000000000",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.asset.susdf",
    owner: "x402-ops",
    resolve_type: "asset",
    resolve_network: "stellar-testnet",
    resolve_value: "sUSDF",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.asset.xusdf",
    owner: "x402-ops",
    resolve_type: "asset",
    resolve_network: "xrpl-testnet",
    resolve_value: "xUSDF",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.asset.wxau",
    owner: "x402-ops",
    resolve_type: "asset",
    resolve_network: "unykorn-l1",
    resolve_value: "wXAU",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.asset.wustb",
    owner: "x402-ops",
    resolve_type: "asset",
    resolve_network: "unykorn-l1",
    resolve_value: "wUSTB",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },

  // ─── 4. A2A agent discovery (5) ───────────────────────────────
  {
    fqn: "x402.a2a.gateway",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "cloudflare",
    resolve_value: "https://gateway.l1.unykorn.org/.well-known/agent.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.a2a.facilitator",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://facilitator.l1.unykorn.org/.well-known/agent.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.a2a.treasury",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://treasury.l1.unykorn.org/.well-known/agent.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.a2a.guardian",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://guardian.l1.unykorn.org/.well-known/agent.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.a2a.registry",
    owner: "x402-ops",
    resolve_type: "config",
    resolve_network: null,
    resolve_value: "https://registry.l1.unykorn.org/a2a-agents.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },

  // ─── 5. Protocol configuration (4) ────────────────────────────
  {
    fqn: "x402.config.stellar-toml",
    owner: "x402-ops",
    resolve_type: "config",
    resolve_network: "stellar",
    resolve_value: "https://l1.unykorn.org/.well-known/stellar.toml",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.config.protocol",
    owner: "x402-ops",
    resolve_type: "config",
    resolve_network: null,
    resolve_value: "https://facilitator.l1.unykorn.org/.well-known/x402-pay",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.config.openapi",
    owner: "x402-ops",
    resolve_type: "config",
    resolve_network: null,
    resolve_value: "https://facilitator.l1.unykorn.org/.well-known/openapi.json",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.config.bridge",
    owner: "x402-ops",
    resolve_type: "config",
    resolve_network: "unykorn-l1",
    resolve_value: "https://bridge.l1.unykorn.org",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },

  // ─── 6. PASS access tiers (4) ─────────────────────────────────
  {
    fqn: "x402.pass.basic",
    owner: "x402-ops",
    resolve_type: "policy",
    resolve_network: null,
    resolve_value: '{"tier":"basic","rate_limit":"100/hour","routes":["agent-pay","genesis-repro","trade-verify"]}',
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.pass.pro",
    owner: "x402-ops",
    resolve_type: "policy",
    resolve_network: null,
    resolve_value: '{"tier":"pro","rate_limit":"1000/hour","routes":["agent-pay","genesis-repro","trade-verify","invoice-export","receipt-lookup"]}',
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.pass.institutional",
    owner: "x402-ops",
    resolve_type: "policy",
    resolve_network: null,
    resolve_value: '{"tier":"institutional","rate_limit":"10000/hour","routes":"*","features":["bulk-export","custom-pricing","sla"]}',
    visibility: "permissioned",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.pass.kyc-enhanced",
    owner: "x402-ops",
    resolve_type: "policy",
    resolve_network: null,
    resolve_value: '{"tier":"kyc-enhanced","rate_limit":"unlimited","routes":"*","features":["trade-finance","institutional","audit-export"]}',
    visibility: "permissioned",
    payment_required: false,
    payment_config: null,
  },

  // ─── 7. Apostle Chain (3) ─────────────────────────────────────
  {
    fqn: "x402.apostle.mesh",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "unykorn-l1",
    resolve_value: "https://apostle.l1.unykorn.org/v1/agents",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.apostle.ledger",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "unykorn-l1",
    resolve_value: "https://apostle.l1.unykorn.org/v1/tx",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.apostle.settlement",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "unykorn-l1",
    resolve_value: "https://apostle.l1.unykorn.org/v1/settlement",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },

  // ─── 8. Commerce (2) ──────────────────────────────────────────
  {
    fqn: "x402.commerce.invoices",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://facilitator.l1.unykorn.org/invoices",
    visibility: "public",
    payment_required: false,
    payment_config: null,
  },
  {
    fqn: "x402.commerce.channels",
    owner: "x402-ops",
    resolve_type: "endpoint",
    resolve_network: "aws-ec2",
    resolve_value: "https://facilitator.l1.unykorn.org/channels",
    visibility: "public",
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
  console.log("║   x402 — Namespace Seeder (36 records)        ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  if (DRY_RUN) {
    console.log("  [DRY RUN] — No database changes will be made.\n");
    for (const r of SEED_RECORDS) {
      const paid = r.payment_required ? "  PAID" : "  free";
      console.log(`  ${paid}  ${r.fqn}`);
      console.log(`           -> ${r.resolve_value}`);
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

  // Remove legacy fth.* namespaces first
  try {
    const del = await pool.query("DELETE FROM namespace_records WHERE fqn LIKE 'fth.%'");
    if (del.rowCount > 0) {
      console.log(`  Removed ${del.rowCount} legacy fth.* namespaces\n`);
    }
  } catch (err) {
    console.error(`  Warning: could not remove legacy namespaces: ${err.message}`);
  }

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
        const check = await pool.query(
          "SELECT created_at, updated_at FROM namespace_records WHERE fqn = $1",
          [r.fqn],
        );
        const row = check.rows[0];
        if (row && row.created_at.getTime() === row.updated_at.getTime()) {
          inserted++;
          console.log(`  + INSERT  ${r.fqn}`);
        } else {
          updated++;
          console.log(`  ~ UPDATE  ${r.fqn}`);
        }
      }
    } catch (err) {
      errors++;
      console.error(`  ! ERROR   ${r.fqn}: ${err.message}`);
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
