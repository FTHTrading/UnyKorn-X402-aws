/**
 * Load sovereign Genesis402 secrets once for all genesis402-hub Node entrypoints.
 * Canonical file: C:\Users\Kevan\sovereign-control-plane\secrets\genesis402-seeds.env
 * Override path: GENESIS402_SECRETS env var
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_SECRETS =
  'C:\\Users\\Kevan\\sovereign-control-plane\\secrets\\genesis402-seeds.env';

function applyAlias(fromKey, toKey) {
  const v = process.env[fromKey];
  if (v && !process.env[toKey]) process.env[toKey] = v;
}

/** Strip inline comments / polluted PM2 shell values from ripple seeds. */
function sanitizeXrplSeed(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim().split(/\s+#/)[0].trim();
  if (!/^s[0-9A-Za-z]{20,35}$/.test(trimmed)) return '';
  return trimmed;
}

function purgeCorruptedEnv(keys) {
  for (const key of keys) {
    const v = process.env[key];
    if (!v) continue;
    if (v.includes('#') || /recommended/i.test(v) || (key.includes('SEED') && v.length > 35)) {
      delete process.env[key];
    }
  }
}

function loadGenesis402Env() {
  purgeCorruptedEnv([
    'XRPL_PAYER_SEED',
    'XRPL_DISTRIBUTOR_SEED',
    'XRPL_TREASURY_SECRET',
    'XRPL_TREASURY_SEED',
  ]);
  const secretsPath = process.env.GENESIS402_SECRETS || DEFAULT_SECRETS;
  const satellitePath =
    process.env.TREASURY_SATELLITE_SECRETS ||
    'C:\\Users\\Kevan\\sovereign-control-plane\\secrets\\treasury-satellite-keys.env';
  if (fs.existsSync(secretsPath)) {
    require('dotenv').config({ path: secretsPath, override: false });
  }
  if (fs.existsSync(satellitePath)) {
    require('dotenv').config({ path: satellitePath, override: false });
  }
  require('dotenv').config({ path: path.join(__dirname, '.env'), override: false });

  // Base: prefer dedicated payer key; treasury only receives (do not collapse both roles)
  applyAlias('BASE_PAYER_PRIVATE_KEY', 'PAYER_PRIVATE_KEY');
  applyAlias('BASE_GAS_PRIVATE_KEY', 'PAYER_PRIVATE_KEY');
  applyAlias('BASE_GAS_ADDRESS', 'BASE_PAYER_ADDRESS');
  applyAlias('BASE_PAYER_2_PRIVATE_KEY', 'BASE_PAYER_2_PRIVATE_KEY');
  if (!process.env.PAYER_PRIVATE_KEY) {
    applyAlias('EVM_TREASURY_PRIVATE_KEY', 'PAYER_PRIVATE_KEY');
    applyAlias('POLYGON_TREASURY_PRIVATE_KEY', 'PAYER_PRIVATE_KEY');
    applyAlias('ETHEREUM_TREASURY_PRIVATE_KEY', 'PAYER_PRIVATE_KEY');
  }
  applyAlias('BASE_TREASURY_ADDRESS', 'PAY_TO_ADDRESS');
  // x402 gateway funded Base wallets (addresses in gateway .env)
  if (!process.env.X402_BASE_TREASURY) {
    process.env.X402_BASE_TREASURY = process.env.BASE_TREASURY_ADDRESS;
  }
  if (!process.env.X402_BASE_PAYER) {
    process.env.X402_BASE_PAYER = process.env.BASE_PAYER_ADDRESS;
  }
  applyAlias('EVM_TREASURY_ADDRESS', 'PAY_TO_ADDRESS');
  applyAlias('POLYGON_TREASURY_ADDRESS', 'PAY_TO_ADDRESS');
  applyAlias('ETHEREUM_TREASURY_ADDRESS', 'PAY_TO_ADDRESS');
  applyAlias('XRPL_DISTRIBUTOR_SEED', 'XRPL_PAYER_SEED');
  if (!process.env.XRPL_PAYER_SEED) {
    applyAlias('XRPL_TREASURY_SECRET', 'XRPL_PAYER_SEED');
  }
  applyAlias('XRPL_TREASURY_ADDRESS', 'XRP_PAY_TO');
  applyAlias('XRPL_TREASURY_ADDRESS', 'XRPL_TREASURY');
  applyAlias('XRPL_TREASURY_ADDRESS', 'X402_RLUSD_PAY_TO');
  applyAlias('STELLAR_TREASURY_SECRET', 'STELLAR_PAYER_SECRET');
  applyAlias('STELLAR_TREASURY_ADDRESS', 'STELLAR_TREASURY');
  applyAlias('TRON_TREASURY_PRIVATE_KEY', 'TRON_PAYER_PRIVATE_KEY');
  applyAlias('SOLANA_TREASURY_SECRET_KEY', 'SOLANA_PAYER_SECRET_KEY');
  applyAlias('SOLANA_TREASURY_ADDRESS', 'SOLANA_PAY_TO');
  applyAlias('BASE_RPC', 'BASE_RPC_URL');
  applyAlias('POLYGON_RPC_URL', 'POLYGON_RPC');
  applyAlias('XRPL_WSS_URL', 'XRPL_SERVER');
  applyAlias('X402_DEDICATED_GATEWAY', 'X402_GATEWAY_URL');
  applyAlias('X402_DEDICATED_GATEWAY', 'X402_GATEWAY');
  applyAlias('CF_POLYGON_GATEWAY', 'POLYGON_RPC');
  applyAlias('IPFS_GATEWAY', 'IPFS_GATEWAY_URL');
  applyAlias('ETH_LEGACY_RPC', 'LEGACYCHAIN_ETH_RPC');

  // ULTIMATE POWER: full set from seeds (genesis402 4 IPFS+3 EVM primary for max power + blockchainfraud 1 EVM lab)
  applyAlias('WEB3_GATEWAY', 'WEB3_GATEWAY_URL');
  applyAlias('X402_GATEWAY', 'X402_GATEWAY_URL');
  applyAlias('POLYGON_GATEWAY', 'POLYGON_GATEWAY_URL');
  applyAlias('XRPL_GATEWAY', 'XRPL_GATEWAY_URL');
  applyAlias('STELLAR_GATEWAY', 'STELLAR_GATEWAY_URL');
  applyAlias('TRON_GATEWAY', 'TRON_GATEWAY_URL');
  applyAlias('BLOCKCHAINFRAUD_EVM_GATEWAY', 'BLOCKCHAINFRAUD_WEB3_URL');
  applyAlias('BLOCKCHAINFRAUD_EVM_GATEWAY', 'EVM_GATEWAY_URL'); // blockchainfraud-platform uses this
  // IPFS: prefer genesis (ipfs.genesis402.com) for 5-Proof artifacts, manifests, sovereign assets across systems.
  if (!process.env.IPFS_GATEWAY_URL && process.env.IPFS_GATEWAY) {
    process.env.IPFS_GATEWAY_URL = process.env.IPFS_GATEWAY;
  }

  if (!process.env.BASE_RPC && process.env.BASE_RPC_URL) {
    process.env.BASE_RPC = process.env.BASE_RPC_URL;
  }
  // Prefer CF gateway for RPC when explicitly enabled (CF DNS must pass eth_chainId first)
  if (process.env.USE_CF_WEB3_RPC === 'true' && process.env.CF_WEB3_GATEWAY) {
    process.env.BASE_RPC = process.env.CF_WEB3_GATEWAY;
  }
  if (!process.env.BASE_RPC && process.env.BASE_RPC_CF_TARGET) {
    process.env.BASE_RPC = process.env.BASE_RPC_CF_TARGET;
  }
  if (!process.env.POLYGON_RPC && process.env.CF_POLYGON_GATEWAY) {
    process.env.POLYGON_RPC = process.env.CF_POLYGON_GATEWAY;
  }
  if (!process.env.X402_GATEWAY && process.env.X402_GATEWAY_URL) {
    process.env.X402_GATEWAY = process.env.X402_GATEWAY_URL;
  }
  if (!process.env.X402_GATEWAY && process.env.X402_DEDICATED_GATEWAY) {
    process.env.X402_GATEWAY = process.env.X402_DEDICATED_GATEWAY;
  }

  // XRPL: paying from the same address as payTo triggers temREDUNDANT. Spend from distributor when configured.
  const xrplPayTo =
    process.env.XRP_PAY_TO || process.env.XRPL_TREASURY_ADDRESS;
  const xrplSpendSeed =
    process.env.XRPL_PAYER_SEED || process.env.XRPL_TREASURY_SECRET;
  if (xrplPayTo && xrplSpendSeed && process.env.XRPL_DISTRIBUTOR_SEED) {
    try {
      const xrpl = require('xrpl');
      const spendAddr = xrpl.Wallet.fromSeed(xrplSpendSeed).address;
      if (spendAddr === xrplPayTo) {
        process.env.XRPL_PAYER_SEED = process.env.XRPL_DISTRIBUTOR_SEED;
        if (!process.env.XRPL_PAYER_NOTE) {
          process.env.XRPL_PAYER_NOTE =
            'spend=rNX4fa distributor; receive=rsJ3PG treasury';
        }
      }
    } catch (_) {
      /* invalid seed — leave env as-is */
    }
  }

  for (const key of ['XRPL_PAYER_SEED', 'XRPL_DISTRIBUTOR_SEED', 'XRPL_TREASURY_SECRET']) {
    const clean = sanitizeXrplSeed(process.env[key]);
    if (clean) process.env[key] = clean;
    else if (process.env[key]) delete process.env[key];
  }
  if (!process.env.XRPL_PAYER_SEED && process.env.XRPL_DISTRIBUTOR_SEED) {
    process.env.XRPL_PAYER_SEED = process.env.XRPL_DISTRIBUTOR_SEED;
  }
}

loadGenesis402Env();

try {
  const { loadEmpireConfig } = require('./empire-config');
  loadEmpireConfig();
} catch (e) {
  if (process.env.DEBUG_EMPIRE_CONFIG === '1') {
    console.warn('[empire-config]', e.message);
  }
}

module.exports = { loadGenesis402Env, DEFAULT_SECRETS };
