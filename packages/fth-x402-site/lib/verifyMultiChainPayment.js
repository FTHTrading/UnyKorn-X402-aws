/**
 * verifyMultiChainPayment — x-402-payment header rail (parallel to task-server X-PAYMENT).
 * XRPL WSS: wss://s1.ripple.com or XRPL_WSS_URL (not xrpl.genesis402.com IPFS gateway).
 * Stellar: horizon.stellar.org. EVM: BASE_RPC / POLYGON_RPC from genesis402-env.
 */

const fs = require('fs');
const xrpl = require('xrpl');

const REVENUE_FILE =
  process.env.REVENUE_DATA
    ? pathJoin(process.env.REVENUE_DATA, 'revenue_events.jsonl')
    : 'C:\\Users\\Kevan\\aws-revenue-stack\\data\\revenue_events.jsonl';

function pathJoin(a, b) {
  const path = require('path');
  return path.join(a, b);
}

let PRICING;
try {
  PRICING = require('C:\\Users\\Kevan\\sovereign-control-plane\\registry\\x402-pricing.json');
} catch (_) {
  PRICING = {};
}

const FALLBACK_PRICING = {
  legacy_vault_basic: {
    amount: 29.95,
    currency: 'USDC',
    resource: 'vault-creation',
    description: 'Basic Legacy Vault + 5-Proof Setup',
  },
  legacy_vault_premium: {
    amount: 99,
    currency: 'USDC',
    resource: 'vault-premium',
  },
  agentmail_credits: {
    amount: 9.95,
    currency: 'USDC',
    resource: 'agentmail-credits',
    description: '10 AgentMail credits',
  },
  agentmail_credits_bulk: {
    amount: 49,
    currency: 'USDC',
    resource: 'agentmail-credits-bulk',
  },
  forensics_report: {
    amount: 79,
    currency: 'USDC',
    resource: 'forensics-report',
  },
  genesis_vault_pass: {
    amount: 99,
    currency: 'USDC',
    resource: 'genesis-vault-pass',
  },
};

const RESOURCE_TO_KEY = {
  'vault-creation': 'legacy_vault_basic',
  'vault-premium': 'legacy_vault_premium',
  'agentmail-credits': 'agentmail_credits',
  'agentmail-credits-bulk': 'agentmail_credits_bulk',
  'forensics-report': 'forensics_report',
  'genesis-vault-pass': 'genesis_vault_pass',
  legacy_vault_basic: 'legacy_vault_basic',
  legacy_vault_premium: 'legacy_vault_premium',
  agentmail_credits: 'agentmail_credits',
  forensics_report: 'forensics_report',
};

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_CHAIN_ID = 8453;

// EIP-3009 for gasless USDC payments (x402 client signs, server submits with its gas)
const EIP3009_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: BASE_CHAIN_ID,
  verifyingContract: USDC_BASE,
};
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

function getPricingEntry(pricingKeyOrResource) {
  const key =
    RESOURCE_TO_KEY[pricingKeyOrResource] ||
    (PRICING[pricingKeyOrResource] ? pricingKeyOrResource : null) ||
    pricingKeyOrResource;
  return PRICING[key] || FALLBACK_PRICING[key] || FALLBACK_PRICING.legacy_vault_basic;
}

function parsePaymentHeader(header) {
  if (!header || typeof header !== 'string') return null;
  const parts = header.trim().split(/\s+/);
  if (parts.length < 3) return null;
  return {
    amount: parseFloat(parts[0]),
    currency: (parts[1] || '').toUpperCase(),
    resource: parts[2],
    domain: parts[3] || '',
  };
}

// Header-only acceptance (no on-chain check) is a LOCAL TEST MODE. It must be switched on explicitly and can never
// be on in production, whatever else the environment says. Default is: verify on-chain or refuse.
function allowHeaderOnlyFallback() {
  return process.env.ALLOW_HEADER_ONLY_PAYMENTS === 'true' && process.env.NODE_ENV !== 'production';
}

function xrpEquivalentForUsdc(usdcAmount) {
  const rate = parseFloat(process.env.X402_XRP_PER_USDC || '0.42');
  return usdcAmount * rate;
}

function amountMeetsRequirement(amount, currency, expected) {
  const cur = currency.toUpperCase();
  const expCur = (expected.currency || 'USDC').toUpperCase();
  if (cur === expCur) {
    return amount >= expected.amount;
  }
  if (cur === 'XRP' && expCur === 'USDC') {
    return amount >= xrpEquivalentForUsdc(expected.amount);
  }
  if (cur === 'RLUSD' && expCur === 'USDC') {
    return amount >= expected.amount;
  }
  return false;
}

function selectChain(currency, resource) {
  const cur = currency.toUpperCase();
  const res = (resource || '').toLowerCase();
  if (cur === 'XRP' || cur === 'RLUSD') return 'xrpl';
  if (cur === 'XLM') return 'stellar';
  if (/vault|legacy/.test(res) && cur === 'USDC' && process.env.X402_VAULT_PREFER_XRPL === 'true') {
    return 'xrpl';
  }
  if (cur === 'USDC' && /polygon/.test(res)) return 'polygon';
  return 'evm';
}

function getTreasuryForChain(chain, domain) {
  if (chain === 'xrpl') {
    return (
      process.env.XRP_PAY_TO ||
      process.env.XRPL_TREASURY_ADDRESS ||
      'rsJ3PGGDH4vPpedjfVRe9YKTCf9BWu6TDC'
    );
  }
  if (chain === 'stellar') {
    return (
      process.env.STELLAR_TREASURY ||
      process.env.STELLAR_TREASURY_ADDRESS ||
      'GBJF54FBYPBVHR6Z3OKWWEMPF6QYPNH3RZZYX3E4V7AUMUWIEV7Z3DPX'
    );
  }
  if (chain === 'polygon') {
    return process.env.POLYGON_TREASURY_ADDRESS || process.env.PAY_TO_ADDRESS;
  }
  return process.env.PAY_TO_ADDRESS || process.env.BASE_TREASURY_ADDRESS;
}

function getRpcUrl(chain, domain) {
  if (chain === 'polygon') {
    if (process.env.USE_CF_WEB3_RPC === 'true' && process.env.CF_POLYGON_GATEWAY) {
      return process.env.CF_POLYGON_GATEWAY;
    }
    return process.env.POLYGON_RPC || 'https://polygon-rpc.com';
  }
  let rpc =
    process.env.BASE_RPC ||
    process.env.BASE_RPC_URL ||
    'https://mainnet.base.org';
  if (process.env.USE_CF_WEB3_RPC === 'true' && process.env.CF_WEB3_GATEWAY) {
    rpc = process.env.CF_WEB3_GATEWAY;
  }
  if (domain && domain.includes('blockchainfraud') && process.env.BLOCKCHAINFRAUD_WEB3_URL) {
    rpc = process.env.BLOCKCHAINFRAUD_WEB3_URL;
  }
  return rpc;
}

function getXrplWss() {
  const url = process.env.XRPL_WSS_URL || process.env.XRPL_SERVER || 'wss://s1.ripple.com';
  if (url.includes('xrpl.genesis402.com')) {
    return process.env.XRPL_WSS_URL || 'wss://s1.ripple.com';
  }
  return url;
}

async function verifyXrplPayment(proof, expectedAmount, currency, payTo) {
  if (!proof || typeof proof !== 'string') {
    return { ok: false, reason: 'missing xrpl tx hash in x-402-proof' };
  }
  const txHash = proof.startsWith('{') ? JSON.parse(proof).txHash || JSON.parse(proof).tx : proof;
  const client = new xrpl.Client(getXrplWss());
  await client.connect();
  try {
    const txResponse = await client.request({ command: 'tx', transaction: txHash });
    const tx = txResponse.result;
    const txBody = tx.tx_json || tx;
    const dest = txBody.Destination;
    const txType = txBody.TransactionType || tx.TransactionType;
    const cur = currency.toUpperCase();
    let paid = false;

    if (cur === 'XRP' || cur === 'RLUSD') {
      const price = String(expectedAmount);
      if (cur === 'XRP') {
        const expectedDrops = xrpl.xrpToDrops(price);
        const amtField = txBody.Amount || txBody.DeliverMax || tx.Amount;
        if (txType === 'Payment' && dest === payTo && amtField === expectedDrops) paid = true;
        if (!paid && tx.meta && tx.meta.delivered_amount === expectedDrops && dest === payTo) {
          paid = true;
        }
      } else {
        const issuer = process.env.RLUSD_ISSUER || 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
        const amt = txBody.Amount || tx.Amount;
        if (
          txType === 'Payment' &&
          dest === payTo &&
          amt &&
          typeof amt === 'object' &&
          amt.currency === 'RLUSD' &&
          amt.issuer === issuer &&
          parseFloat(amt.value) >= expectedAmount
        ) {
          paid = true;
        }
      }
    }

    if (paid && tx.meta && tx.meta.TransactionResult === 'tesSUCCESS') {
      return { ok: true, txHash, chain: 'xrpl' };
    }
    return { ok: false, reason: 'xrpl payment amount/destination mismatch' };
  } finally {
    await client.disconnect();
  }
}

async function verifyStellarPayment(proof, expectedAmount, payTo) {
  if (!proof) return { ok: false, reason: 'missing stellar tx hash in x-402-proof' };
  const txId = proof.startsWith('{') ? JSON.parse(proof).txHash || JSON.parse(proof).tx : proof;
  const horizon =
    process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org';
  const res = await fetch(`${horizon}/transactions/${txId}`);
  if (!res.ok) return { ok: false, reason: 'stellar tx not found' };
  const tx = await res.json();
  const opsRes = await fetch(`${horizon}/transactions/${txId}/operations`);
  const opsBody = await opsRes.json();
  const records = opsBody._embedded?.records || [];
  const usdcIssuer =
    process.env.STELLAR_USDC_ISSUER ||
    'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
  for (const op of records) {
    if (op.type !== 'payment') continue;
    if (op.to !== payTo) continue;
    if (op.asset_type === 'native') continue;
    if (
      op.asset_code === 'USDC' &&
      op.asset_issuer === usdcIssuer &&
      parseFloat(op.amount) >= expectedAmount
    ) {
      return { ok: true, txHash: txId, chain: 'stellar' };
    }
  }
  return { ok: false, reason: 'stellar USDC payment not matched' };
}

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'rpc error');
  return json.result;
}

async function verifyEvmUsdcPayment(proof, expectedAmount, payTo, rpcUrl) {
  if (!proof || !proof.startsWith('0x')) {
    return { ok: false, reason: 'missing EVM tx hash in x-402-proof' };
  }
  const receipt = await rpcCall(rpcUrl, 'eth_getTransactionReceipt', [proof]);
  if (!receipt || receipt.status !== '0x1') {
    return { ok: false, reason: 'evm tx failed or pending' };
  }
  const transferTopic =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const expectedMin = BigInt(Math.floor(expectedAmount * 1e6));
  const payToTopic = '0x' + payTo.slice(2).toLowerCase().padStart(64, '0');
  for (const log of receipt.logs || []) {
    if (log.address?.toLowerCase() !== USDC_BASE.toLowerCase()) continue;
    if (log.topics?.[0] !== transferTopic) continue;
    if (log.topics?.[2]?.toLowerCase() !== payToTopic) continue;
    const value = BigInt(log.data || '0x0');
    if (value >= expectedMin) {
      return { ok: true, txHash: proof, chain: 'base' };
    }
  }
  return { ok: false, reason: 'USDC transfer to treasury not found in receipt' };
}

async function verifyEip3009Payment(proof, expectedAmount, payTo) {
  // proof is JSON string or object: { from, to, value, validAfter, validBefore, nonce, v, r, s }
  let auth;
  try {
    auth = typeof proof === 'string' ? JSON.parse(proof) : proof;
  } catch (e) {
    return { ok: false, reason: 'invalid eip3009 proof json' };
  }
  if (!auth.from || !auth.to || !auth.value || !auth.nonce || !auth.v || !auth.r || !auth.s) {
    return { ok: false, reason: 'missing eip3009 auth fields' };
  }
  if (auth.to.toLowerCase() !== payTo.toLowerCase()) {
    return { ok: false, reason: 'eip3009 to mismatch treasury' };
  }
  const value = BigInt(auth.value);
  const expected = BigInt(Math.floor(expectedAmount * 1e6));
  if (value < expected) {
    return { ok: false, reason: 'eip3009 value too low' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (auth.validAfter && now < Number(auth.validAfter)) return { ok: false, reason: 'eip3009 not yet valid' };
  if (auth.validBefore && now > Number(auth.validBefore)) return { ok: false, reason: 'eip3009 expired' };

  // Verify signature using viem (lazy path for compatibility)
  let viem;
  try {
    const path = require('path');
    const viemDir = path.resolve(__dirname, '..', '..', 'node_modules', 'viem');
    viem = require(viemDir);
  } catch (e) {
    viem = require('viem');
  }
  const { recoverTypedDataAddress } = viem;
  try {
    const recovered = await recoverTypedDataAddress({
      domain: EIP3009_DOMAIN,
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: auth.from,
        to: auth.to,
        value: BigInt(auth.value),
        validAfter: BigInt(auth.validAfter || 0),
        validBefore: BigInt(auth.validBefore || '0xffffffffffffffff'),
        nonce: auth.nonce,
      },
      signature: { v: Number(auth.v), r: auth.r, s: auth.s },
    });
    if (recovered.toLowerCase() !== auth.from.toLowerCase()) {
      return { ok: false, reason: 'eip3009 signature from mismatch' };
    }
  } catch (e) {
    return { ok: false, reason: 'eip3009 signature recovery failed: ' + e.message };
  }

  return { ok: true, chain: 'base-eip3009', from: auth.from, to: auth.to, value: auth.value, nonce: auth.nonce };
}

function logRevenueEvent(event) {
  try {
    fs.appendFileSync(REVENUE_FILE, JSON.stringify(event) + '\n');
  } catch (_) {
    /* non-fatal */
  }
}

/**
 * @param {object} opts
 * @param {number} opts.amount
 * @param {string} opts.currency
 * @param {string} opts.resource — header resource slug or pricing key
 * @param {string} [opts.domain]
 * @param {string} [opts.proof] — x-402-proof (tx hash)
 * @param {string} [opts.pricingKey] — override lookup key
 */
async function verifyMultiChainPayment(opts) {
  const { amount, currency, resource, domain, proof, pricingKey } = opts;
  const expected = getPricingEntry(pricingKey || resource);

  if (!amountMeetsRequirement(amount, currency, expected)) {
    return {
      valid: false,
      reason: 'amount or currency mismatch',
      required: expected,
      xrpEquivalent: xrpEquivalentForUsdc(expected.amount),
    };
  }

  const chain = selectChain(currency, resource || expected.resource);
  const payTo = getTreasuryForChain(chain, domain);
  const rpcUrl = getRpcUrl(chain, domain);
  const forceReal = process.env.FORCE_REAL_PAYMENTS === 'true';

  if (!proof) {
    if (allowHeaderOnlyFallback()) {
      const result = {
        valid: true,
        mode: 'header-only',
        chain,
        gatewayUsed: rpcUrl,
        txHash: 'header-only',
        amount,
        currency,
        resource: expected.resource,
        payTo,
      };
      logRevenueEvent({
        ts: new Date().toISOString(),
        domain: domain || 'unknown',
        resource: expected.resource,
        amount,
        currency,
        tx: 'header-only',
        gateway: rpcUrl,
        chain,
        verified: true,
        mode: 'header-only',
      });
      return result;
    }
    return {
      valid: false,
      reason: 'x-402-proof required when FORCE_REAL_PAYMENTS=true',
      required: expected,
      exampleProof: 'tx hash or {"txHash":"..."}',
    };
  }

  let verifyResult;
  const verifyAmount =
    currency.toUpperCase() === 'XRP'
      ? amount
      : currency.toUpperCase() === 'USDC' && chain === 'xrpl'
        ? xrpEquivalentForUsdc(amount)
        : expected.amount;

  try {
    // EIP-3009 gasless path for USDC on Base (client signs, server submits with payer gas)
    if (currency.toUpperCase() === 'USDC' && typeof proof === 'string' && proof.includes('"from"')) {
      verifyResult = await verifyEip3009Payment(proof, expected.amount, payTo);
    } else if (chain === 'xrpl') {
      verifyResult = await verifyXrplPayment(proof, verifyAmount, currency, payTo);
    } else if (chain === 'stellar') {
      verifyResult = await verifyStellarPayment(proof, expected.amount, payTo);
    } else {
      verifyResult = await verifyEvmUsdcPayment(proof, expected.amount, payTo, rpcUrl);
    }
  } catch (e) {
    if (!forceReal && allowHeaderOnlyFallback()) {
      verifyResult = { ok: true, txHash: proof, chain, fallback: e.message };
    } else {
      return { valid: false, reason: e.message, chain, gatewayUsed: rpcUrl };
    }
  }

  if (!verifyResult.ok) {
    return {
      valid: false,
      reason: verifyResult.reason,
      chain,
      gatewayUsed: rpcUrl,
      payTo,
    };
  }

  const result = {
    valid: true,
    mode: 'on-chain',
    chain: verifyResult.chain || chain,
    gatewayUsed: rpcUrl,
    txHash: verifyResult.txHash,
    amount,
    currency,
    resource: expected.resource,
    payTo,
  };

  logRevenueEvent({
    ts: new Date().toISOString(),
    domain: domain || 'unknown',
    resource: expected.resource,
    amount,
    currency,
    tx: verifyResult.txHash,
    gateway: rpcUrl,
    chain: result.chain,
    verified: true,
    mode: 'on-chain',
  });

  return result;
}

module.exports = {
  verifyMultiChainPayment,
  parsePaymentHeader,
  getPricingEntry,
  PRICING: { ...FALLBACK_PRICING, ...PRICING },
  RESOURCE_TO_KEY,
  xrpEquivalentForUsdc,
  selectChain,
};
