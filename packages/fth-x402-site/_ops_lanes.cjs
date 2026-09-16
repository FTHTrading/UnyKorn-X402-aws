'use strict';
// Multi-rail lane table for the Genesis402 task rail (2026-09-16).
//
// Two families of lane:
//   exact  — x402 v2 `exact` scheme settled by the Coinbase CDP facilitator: base, polygon (EVM, EIP-3009
//            USDC authorizations) and solana (SVM, payer-signed transaction with the facilitator as fee payer).
//            Nothing moves unless CDP settles; the rail never quotes a lane CDP does not list in /supported.
//   pay-first — the payer pays on-chain first and presents the tx hash: xrpl (in _ops_rails.cjs) and stellar (here).
//
// Every amount, asset and destination below is SERVER-side. Nothing a payer sends can change them.

const https = require('https');

const USD_PRICE = 0.25;
const USDC_ATOMIC = '250000'; // 6 decimals

// Verified 2026-09-16 against the chains themselves (see .forge notes): Polygon native USDC name "USD Coin"
// version "2" (EIP-3009 capable); Solana USDC mint decimals 6; Stellar USDC issuer is Circle's.
const EXACT_LANES = Object.freeze({
  'base:usdc': Object.freeze({ kind: 'evm', network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, atomic: USDC_ATOMIC, usd: USD_PRICE, extra: { name: 'USD Coin', version: '2' }, payToEnv: ['PAY_TO_ADDRESS', 'EVM_TREASURY_ADDRESS'] }),
  'polygon:usdc': Object.freeze({ kind: 'evm', network: 'eip155:137', asset: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, atomic: USDC_ATOMIC, usd: USD_PRICE, extra: { name: 'USD Coin', version: '2' }, payToEnv: ['POLYGON_PAY_TO_ADDRESS', 'PAY_TO_ADDRESS', 'EVM_TREASURY_ADDRESS'] }),
  'solana:usdc': Object.freeze({ kind: 'svm', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', asset: 'EPjFWdd5AuFqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, atomic: USDC_ATOMIC, usd: USD_PRICE, extra: {}, payToEnv: ['SOLANA_TREASURY_ADDRESS', 'SOLANA_PAY_TO_ADDRESS'] })
});

const STELLAR_USDC_ISSUER = process.env.STELLAR_USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const STELLAR_PRICE = '0.25';

function payToFor(laneKey) {
  const lane = EXACT_LANES[laneKey];
  if (!lane) return '';
  for (const k of lane.payToEnv) if (process.env[k]) return process.env[k];
  return '';
}

function isEvmAddress(a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || '')); }
function isSolanaAddress(a) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a || '')); }

/**
 * Pick the lane for an incoming payment. The payer names a network (x402 v2 puts it in `accepted.network`,
 * v1 clients in `network`); we map it to our lane key. Unknown network -> null (the caller refuses).
 */
function selectLane(payment) {
  const p = payment || {};
  const net = String((p.accepted && p.accepted.network) || p.network || '').toLowerCase();
  const asset = String(p.asset || (p.accepted && p.accepted.asset) || '').toUpperCase();
  if (net.includes('xrpl')) return asset === 'RLUSD' ? 'xrpl:rlusd' : 'xrpl:xrp';
  if (net.includes('stellar')) return 'stellar:usdc';
  if (net === 'eip155:137' || net === 'polygon' || net === 'polygon:mainnet') return 'polygon:usdc';
  if (net.startsWith('solana')) return 'solana:usdc';
  if (net === '' || net === 'eip155:8453' || net === 'base' || net === 'base:mainnet') return 'base:usdc';
  return null;
}

/** CDP /supported, parsed: which networks the facilitator will settle, and the Solana fee payer. Cached 5 min. */
let supportedCache = { at: 0, value: null };
async function cdpSupported(cdpCall) {
  if (supportedCache.value && Date.now() - supportedCache.at < 300000) return supportedCache.value;
  let value;
  try {
    const r = await cdpCall('/platform/v2/x402/supported', undefined, 'GET');
    const kinds = (r.json && (r.json.kinds || r.json.supported || r.json)) || [];
    const list = Array.isArray(kinds) ? kinds : [];
    const networks = new Set(list.map((k) => String(k.network || '').toLowerCase()).filter(Boolean));
    const sol = list.find((k) => String(k.network || '').toLowerCase().startsWith('solana:5eykt4usfv8p8njdtrepy1vzqkqzkvdp') && k.extra && k.extra.feePayer);
    value = { ok: r.status >= 200 && r.status < 300, status: r.status, networks: [...networks], solanaFeePayer: sol ? sol.extra.feePayer : null, raw_count: list.length };
  } catch (e) {
    value = { ok: false, networks: [], solanaFeePayer: null, detail: (e.message || '').slice(0, 120) };
  }
  supportedCache = { at: Date.now(), value };
  return value;
}

/** Readiness of the CDP-settled lanes other than base (base keeps its own path with the self-settle fallback). */
function exactLaneStatus(laneKey, cdpOk, supported) {
  const lane = EXACT_LANES[laneKey];
  const payTo = payToFor(laneKey);
  if (!cdpOk) return { payable: false, reason: 'cdp_not_ready' };
  if (!supported || !supported.ok) return { payable: false, reason: 'cdp_supported_unreadable' };
  if (!supported.networks.includes(lane.network.toLowerCase())) return { payable: false, reason: 'cdp_does_not_list_' + lane.network };
  if (lane.kind === 'evm' && !isEvmAddress(payTo)) return { payable: false, reason: laneKey.split(':')[0] + '_pay_to_unset' };
  if (lane.kind === 'svm') {
    if (!isSolanaAddress(payTo)) return { payable: false, reason: 'solana_treasury_unset' };
    if (!supported.solanaFeePayer) return { payable: false, reason: 'cdp_solana_fee_payer_missing' };
  }
  return { payable: true, settle_via: 'cdp', payTo, price_usd: lane.usd, network: lane.network, asset: lane.asset, ...(lane.kind === 'svm' ? { fee_payer: supported.solanaFeePayer } : {}) };
}

/** The `accepts[]` entry (and paymentRequirements) for a CDP-settled lane. */
function exactRequirements(laneKey, status, resourceUrl, atomicOverride) {
  const lane = EXACT_LANES[laneKey];
  const atomic = atomicOverride && /^\d+$/.test(String(atomicOverride)) ? String(atomicOverride) : lane.atomic;
  const extra = lane.kind === 'svm' ? { feePayer: status.fee_payer } : { ...lane.extra };
  return {
    scheme: 'exact', network: lane.network, asset: lane.asset,
    maxAmountRequired: atomic, amount: atomic,
    payTo: status.payTo, maxTimeoutSeconds: 300,
    resource: resourceUrl || 'https://twin.unykorn.org/task',
    extra
  };
}

/**
 * Canonical x402 v2 PaymentPayload for a CDP-settled lane. `accepted` is rebuilt from OUR table.
 * EVM: EIP-3009 authorization (+ split-signature repair). SVM: the payer's base64 signed transaction.
 */
function toCanonicalExact(laneKey, status, payment, ctx) {
  ctx = ctx || {};
  const lane = EXACT_LANES[laneKey];
  const req = exactRequirements(laneKey, status, ctx.resourceUrl, ctx.priceAtomic);
  const p = (payment && (payment.payload || payment)) || {};
  const base = {
    x402Version: 2, scheme: 'exact', network: lane.network,
    resource: { url: ctx.resourceUrl || 'https://twin.unykorn.org/task', mimeType: 'application/json' },
    ...(ctx.extensions ? { extensions: ctx.extensions } : {}),
    accepted: { scheme: 'exact', network: lane.network, amount: req.amount, asset: lane.asset, payTo: status.payTo, maxTimeoutSeconds: 300, extra: req.extra }
  };
  if (lane.kind === 'svm') {
    const tx = p.transaction || payment.transaction || null;
    return { requirements: req, canonical: { ...base, payload: { transaction: tx } }, complete: !!tx, missing: tx ? [] : ['transaction'] };
  }
  const a = (p.authorization || p.auth || p) || {};
  let signature = p.signature || payment.signature || a.signature || null;
  if (!signature && a.r && a.s && (a.v !== undefined || a.yParity !== undefined)) {
    const v = a.v !== undefined ? Number(a.v) : (Number(a.yParity) + 27);
    const hex = (x) => String(x).replace(/^0x/, '').padStart(64, '0');
    signature = '0x' + hex(a.r) + hex(a.s) + v.toString(16).padStart(2, '0');
  }
  const str = (x, d) => (x === undefined || x === null || x === '' ? d : String(x));
  const canonical = {
    ...base,
    payload: {
      signature,
      authorization: { from: a.from, to: a.to || status.payTo, value: str(a.value, req.amount), validAfter: str(a.validAfter, '0'), validBefore: str(a.validBefore, String(Math.floor(Date.now() / 1000) + 600)), nonce: a.nonce }
    }
  };
  const missing = [!signature && 'signature', !a.from && 'from', !a.nonce && 'nonce'].filter(Boolean);
  return { requirements: req, canonical, complete: missing.length === 0, missing };
}

/** Settle a CDP-only lane (polygon, solana). Verify, then settle. No self-settle fallback exists for these. */
async function settleExactCdp(cdpCall, laneKey, status, payment, ctx) {
  const lane = EXACT_LANES[laneKey];
  const built = toCanonicalExact(laneKey, status, payment, ctx);
  if (!built.complete) return { ok: false, reason: laneKey.split(':')[0] + '_payload_incomplete', missing: built.missing };
  try {
    const v = await cdpCall('/platform/v2/x402/verify', { x402Version: 2, paymentPayload: built.canonical, paymentRequirements: built.requirements });
    const valid = v.json && (v.json.isValid === true || v.json.valid === true);
    if (!valid) return { ok: false, reason: 'cdp_verify_rejected', status: v.status, detail: (v.json && (v.json.invalidReason || v.json.error)) || v.raw };
    const s = await cdpCall('/platform/v2/x402/settle', { x402Version: 2, paymentPayload: built.canonical, paymentRequirements: built.requirements });
    const txHash = s.json && (s.json.transaction || s.json.txHash || s.json.transactionHash || s.json.signature);
    const payer = (s.json && s.json.payer) || (v.json && v.json.payer) || (built.canonical.payload && built.canonical.payload.authorization && built.canonical.payload.authorization.from) || null;
    if (s.status >= 200 && s.status < 300 && txHash) return { ok: true, via: 'cdp', txHash: String(txHash), amount_usd: Number(built.requirements.amount) / 1e6, lane: laneKey, payer };
    return { ok: false, reason: 'cdp_settle_failed', status: s.status, detail: (s.json && s.json.error) || s.raw };
  } catch (e) {
    return { ok: false, reason: 'cdp_error', detail: (e.message || '').slice(0, 160) };
  }
}

// ---------------- Stellar: pay-first verification over Horizon ----------------
function httpsGetJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs || 10000, headers: { accept: 'application/json', 'user-agent': 'genesis402-rail/1.0' } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) { /* raw */ } resolve({ status: res.statusCode, json: j, raw: d.slice(0, 300) }); });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('horizon timeout')); });
  });
}

/**
 * Verify a settled Stellar payment: tx hash -> Horizon payments for that tx -> a `payment` op to OUR account of
 * Circle-issued USDC >= price. Fails closed; distinguishes "no such tx" (final) from "Horizon unreachable" (retryable).
 */
async function verifyStellar(payment, opts) {
  opts = opts || {};
  const horizon = (opts.horizon || process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org').replace(/\/$/, '');
  const treasury = opts.treasury || process.env.STELLAR_TREASURY_ADDRESS || '';
  const txHash = payment && payment.txHash;
  if (!txHash || !/^[0-9a-f]{64}$/i.test(txHash)) return { valid: false, reason: 'stellar_txhash_missing_or_malformed' };
  if (!treasury) return { valid: false, reason: 'stellar_treasury_unset' };
  let r;
  try { r = await httpsGetJson(horizon + '/transactions/' + txHash.toLowerCase() + '/payments?limit=50', 10000); }
  catch (e) { return { valid: false, reason: 'stellar_verifier_unavailable', detail: (e.message || '').slice(0, 120), retryable: true }; }
  if (r.status === 404) return { valid: false, reason: 'stellar_tx_not_found', retryable: false };
  if (r.status !== 200 || !r.json) return { valid: false, reason: 'stellar_horizon_status_' + r.status, retryable: r.status >= 500 };
  const ops = (r.json._embedded && r.json._embedded.records) || [];
  const hit = ops.find((o) => (o.type === 'payment' || o.type === 'path_payment_strict_send' || o.type === 'path_payment_strict_receive') && o.to === treasury && o.transaction_successful !== false && o.asset_type !== 'native' && o.asset_code === 'USDC' && o.asset_issuer === STELLAR_USDC_ISSUER);
  if (!hit) return { valid: false, reason: 'stellar_no_matching_usdc_payment_to_treasury' };
  if (Number(hit.amount) < Number(STELLAR_PRICE)) return { valid: false, reason: 'stellar_underpaid', delivered: hit.amount, required: STELLAR_PRICE };
  return { valid: true, rail: 'stellar:usdc', txHash: txHash.toLowerCase(), amount_usd: Number(hit.amount), paid: hit.amount + ' USDC (Stellar)', payer: hit.from || hit.source_account || null };
}

function stellarAccept(status) {
  return { scheme: 'exact', network: 'stellar:pubnet', asset: 'USDC', issuer: STELLAR_USDC_ISSUER, price: STELLAR_PRICE, payTo: status.payTo, pay_first: true, proof: 'present the transaction hash as X-PAYMENT {"network":"stellar:pubnet","txHash":"<hex>"}' };
}

module.exports = { EXACT_LANES, STELLAR_USDC_ISSUER, STELLAR_PRICE, payToFor, selectLane, cdpSupported, exactLaneStatus, exactRequirements, toCanonicalExact, settleExactCdp, verifyStellar, stellarAccept, isEvmAddress, isSolanaAddress };
