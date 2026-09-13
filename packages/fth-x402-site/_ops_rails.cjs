// Lane readiness, verification and settlement for the Genesis402 x402 rail.
//
// DESIGN RULE: the gate may only advertise a lane it can actually honour right now.
// buildAccepts() is computed from live readiness probes, never from a hardcoded list.
// That makes "quoted a price we cannot collect or cannot receive" structurally
// impossible rather than a thing we promise not to do.
//
// SECOND RULE: price is ALWAYS server-side. Nothing in the payer's payload sets it.
const https = require('https');
const xrpl = require('xrpl');
const crypto = require('crypto');

// ---- server-side price table. The payer does not get a vote. ----
const PRICES = {
  base_usdc_atomic: '250000',          // $0.25, USDC has 6 decimals
  base_usdc_usd: 0.25,
  xrpl_xrp: '0.05',
  xrpl_xrp_usd: 0.05
};

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RLUSD_ISSUER = process.env.RLUSD_ISSUER || 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const XRPL_WSS = process.env.XRPL_WSS_URL || process.env.XRPL_SERVER || 'wss://xrplcluster.com';
const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';

function payToEvm() {
  return process.env.PAY_TO_ADDRESS || process.env.EVM_TREASURY_ADDRESS || '';
}
function payToXrpl() {
  return process.env.XRPL_TREASURY_ADDRESS || '';
}

// ---------------- small helpers ----------------

function rpc(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      port: u.port || 443,
      method: 'POST',
      timeout: timeoutMs || 12000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json from ' + u.hostname + ': ' + d.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout ' + u.hostname)); });
    req.write(payload);
    req.end();
  });
}

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + (u.search || ''), port: u.port || 443,
      method: 'GET', timeout: timeoutMs || 12000
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout ' + u.hostname)); });
    req.end();
  });
}

// ---------------- CDP credential health ----------------
// The old code read CDP_PRIVATE_KEY, which holds a 26-byte placeholder. The real
// credential pair is COINBASE_CDP_API_KEY / COINBASE_CDP_API_SECRET. We check that a
// usable signing key can actually be constructed before claiming the lane is live.
const fsmod = require('fs');
const pathmod = require('path');

// The CDP secret stored in .env is a SEC1 EC key whose trailing public-key section was
// truncated (base64 body 165 chars, not a multiple of 4). The 32-byte private scalar
// survived, so _ops_cdprecover.cjs rebuilt a valid prime256v1 key from it and PROVED it
// against the live API: /platform/v2/x402/supported returns 401 with no auth and 401
// with a garbage bearer, but 200 with this key. Prefer that recovered PEM.
const RECOVERED_PEM = pathmod.join(__dirname, '.cdp-recovered.pem');

function cdpSecret() {
  if (fsmod.existsSync(RECOVERED_PEM)) {
    try { return fsmod.readFileSync(RECOVERED_PEM, 'utf8'); } catch (e) { /* fall through */ }
  }
  return (process.env.COINBASE_CDP_API_SECRET || process.env.CDP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

// CDP accepts a wildcard organization segment, so the lost org id is not a blocker.
function cdpKid() {
  if (process.env.CDP_KEY_NAME) return process.env.CDP_KEY_NAME;
  const id = process.env.COINBASE_CDP_API_KEY || process.env.CDP_KEY_ID || '';
  if (!id) return '';
  return /^organizations\//.test(id) ? id : 'organizations/*/apiKeys/' + id;
}

function cdpStatus() {
  const kid = cdpKid();
  const secret = cdpSecret();
  if (!kid || !secret) return { ok: false, reason: 'cdp_credentials_absent' };
  if (/BEGIN [A-Z ]*PRIVATE KEY/.test(secret)) {
    try { crypto.createPrivateKey(secret); return { ok: true, mode: 'pem-es256', keyId: kid }; }
    catch (e) { return { ok: false, reason: 'cdp_secret_unparseable_pem', detail: e.message }; }
  }
  try {
    const raw = Buffer.from(secret, 'base64');
    if (raw.length === 64 || raw.length === 32) return { ok: true, mode: 'ed25519', keyId: kid };
    return { ok: false, reason: 'cdp_secret_wrong_length', detail: raw.length + ' bytes' };
  } catch (e) { return { ok: false, reason: 'cdp_secret_not_base64' }; }
}

// ---------------- relayer (self-settle) health ----------------
// Self-settle submits transferWithAuthorization ourselves from a relayer EOA.
// It needs Base ETH for gas. No gas => the lane cannot settle => do not advertise it.
const MIN_RELAYER_WEI = BigInt(process.env.MIN_RELAYER_WEI || '1500000000000000'); // 0.0015 ETH

async function relayerStatus() {
  const pk = process.env.BASE_GAS_PRIVATE_KEY || process.env.RELAYER_PRIVATE_KEY;
  const addr = process.env.BASE_GAS_ADDRESS || '';
  if (!pk || !addr) return { ok: false, reason: 'relayer_key_absent' };
  try {
    const r = await rpc(BASE_RPC, { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] }, 10000);
    const wei = BigInt(r.result || '0x0');
    const eth = Number(wei) / 1e18;
    if (wei < MIN_RELAYER_WEI) {
      return { ok: false, reason: 'relayer_out_of_gas', address: addr, eth: eth.toFixed(8), need_eth: (Number(MIN_RELAYER_WEI) / 1e18).toFixed(4) };
    }
    return { ok: true, address: addr, eth: eth.toFixed(8) };
  } catch (e) {
    return { ok: false, reason: 'base_rpc_unreachable', detail: e.message };
  }
}

// ---------------- XRPL receive readiness ----------------
// An XRPL payment can only land if the destination account EXISTS and, for an issued
// currency, holds a trustline to that issuer. Advertising RLUSD without a trustline
// means the payer's payment fails and they get nothing — so we probe for it.
async function xrplStatus() {
  const account = payToXrpl();
  if (!account) return { xrp: { ok: false, reason: 'xrpl_treasury_unset' }, rlusd: { ok: false, reason: 'xrpl_treasury_unset' } };
  let client;
  try {
    client = new xrpl.Client(XRPL_WSS, { connectionTimeout: 8000 });
    await client.connect();
    const info = await client.request({ command: 'account_info', account, ledger_index: 'validated' });
    const bal = Number(info.result.account_data.Balance) / 1e6;
    let rlusd = { ok: false, reason: 'rlusd_no_trustline' };
    try {
      const lines = await client.request({ command: 'account_lines', account, ledger_index: 'validated' });
      const hit = (lines.result.lines || []).find((l) => l.account === RLUSD_ISSUER && /^(RLUSD|524C555344)/i.test(l.currency));
      if (hit) rlusd = { ok: true, limit: hit.limit };
    } catch (e) { rlusd = { ok: false, reason: 'rlusd_trustline_probe_failed' }; }
    await client.disconnect();
    return { xrp: { ok: true, account, balance_xrp: bal.toFixed(6) }, rlusd };
  } catch (e) {
    try { if (client) await client.disconnect(); } catch (e2) { /* ignore */ }
    const reason = /Account not found|actNotFound/i.test(e.message || '') ? 'xrpl_account_not_funded' : 'xrpl_unreachable';
    return { xrp: { ok: false, reason, detail: (e.message || '').slice(0, 120) }, rlusd: { ok: false, reason } };
  }
}

// ---------------- Stellar receive readiness ----------------
async function stellarStatus() {
  const account = process.env.STELLAR_TREASURY_ADDRESS;
  if (!account) return { ok: false, reason: 'stellar_treasury_unset' };
  const horizon = process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org';
  try {
    const r = await httpsGet(horizon.replace(/\/$/, '') + '/accounts/' + account, 10000);
    if (r.status === 404) return { ok: false, reason: 'stellar_account_does_not_exist', account };
    if (r.status !== 200) return { ok: false, reason: 'stellar_horizon_status_' + r.status };
    const d = JSON.parse(r.body);
    const usdc = (d.balances || []).find((b) => b.asset_code === 'USDC');
    if (!usdc) return { ok: false, reason: 'stellar_no_usdc_trustline', account };
    return { ok: true, account, usdc_balance: usdc.balance };
  } catch (e) {
    return { ok: false, reason: 'stellar_horizon_unreachable', detail: (e.message || '').slice(0, 120) };
  }
}

// ---------------- live CDP auth probe, cached ----------------
// /platform/v2/x402/supported returns 401 unauthenticated and 401 with a garbage bearer,
// so a 200 here is genuine proof the facilitator accepts our key.
let cdpLiveCache = { at: 0, value: null };
const CDP_LIVE_TTL_MS = 120000;

async function cdpLive() {
  if (cdpLiveCache.value && Date.now() - cdpLiveCache.at < CDP_LIVE_TTL_MS) return cdpLiveCache.value;
  let value;
  try {
    const r = await cdpCall('/platform/v2/x402/supported', undefined, 'GET');
    value = (r.status >= 200 && r.status < 300)
      ? { ok: true, status: r.status }
      : { ok: false, status: r.status, detail: (r.raw || '').slice(0, 120) };
  } catch (e) {
    value = { ok: false, detail: (e.message || '').slice(0, 120) };
  }
  cdpLiveCache = { at: Date.now(), value };
  return value;
}

// ---------------- combined readiness, cached ----------------
let cache = { at: 0, value: null };
const READINESS_TTL_MS = Number(process.env.READINESS_TTL_MS || 60000);

async function readiness(force) {
  if (!force && cache.value && Date.now() - cache.at < READINESS_TTL_MS) return cache.value;
  const [xrplR, stellarR, relayerR] = await Promise.all([
    xrplStatus(), stellarStatus(), relayerStatus()
  ]);
  // A parseable key is not the same as a key the facilitator accepts, so probe CDP for
  // real before calling the Base lane payable.
  let cdp = cdpStatus();
  if (cdp.ok) {
    const live = await cdpLive();
    cdp = live.ok
      ? { ok: true, mode: cdp.mode, keyId: cdp.keyId, facilitator: 'authenticated' }
      : { ok: false, reason: 'cdp_auth_rejected', detail: live.detail, mode: cdp.mode };
  }
  // Base is payable only if we can RECEIVE (always true for an EOA) AND SETTLE.
  const baseSettle = cdp.ok ? { ok: true, via: 'cdp' } : (relayerR.ok ? { ok: true, via: 'self-settle' } : { ok: false, reason: 'no_settlement_path', cdp: cdp.reason, relayer: relayerR.reason });
  const value = {
    checked_at: new Date().toISOString(),
    lanes: {
      'base:usdc': baseSettle.ok
        ? { payable: true, settle_via: baseSettle.via, payTo: payToEvm(), price_usd: PRICES.base_usdc_usd }
        : { payable: false, reason: baseSettle.reason, cdp: cdp.reason, relayer: relayerR.reason, relayer_address: relayerR.address, relayer_eth: relayerR.eth },
      'xrpl:xrp': xrplR.xrp.ok
        ? { payable: true, payTo: payToXrpl(), price_xrp: PRICES.xrpl_xrp }
        : { payable: false, reason: xrplR.xrp.reason },
      'xrpl:rlusd': xrplR.rlusd.ok
        ? { payable: true, payTo: payToXrpl(), issuer: RLUSD_ISSUER }
        : { payable: false, reason: xrplR.rlusd.reason },
      'stellar:usdc': stellarR.ok
        ? { payable: true, payTo: stellarR.account }
        : { payable: false, reason: stellarR.reason }
    },
    cdp, relayer: relayerR
  };
  value.payable_lanes = Object.entries(value.lanes).filter(([, v]) => v.payable).map(([k]) => k);
  value.any_payable = value.payable_lanes.length > 0;
  cache = { at: Date.now(), value };
  return value;
}

/** accepts[] built ONLY from lanes we can honour right now. Empty => fail closed. */
function buildAccepts(r) {
  const out = [];
  if (r.lanes['base:usdc'].payable) {
    out.push({
      scheme: 'exact', network: 'eip155:8453', asset: BASE_USDC,
      amount: PRICES.base_usdc_atomic, payTo: payToEvm(), maxTimeoutSeconds: 300,
      extra: { name: 'USD Coin', version: '2' }
    });
  }
  if (r.lanes['xrpl:xrp'].payable) {
    out.push({ scheme: 'exact', network: 'xrpl:mainnet', asset: 'XRP', price: PRICES.xrpl_xrp, payTo: payToXrpl() });
  }
  if (r.lanes['xrpl:rlusd'].payable) {
    out.push({ scheme: 'exact', network: 'xrpl:mainnet', asset: 'RLUSD', price: PRICES.xrpl_xrp, payTo: payToXrpl(), issuer: RLUSD_ISSUER });
  }
  return out;
}

// ---------------- XRPL verification ----------------
// Verifies a SETTLED on-chain payment. The payer supplies only a tx hash; the amount,
// destination and asset are all checked against SERVER-side values. The old code read
// `price` out of the payer's payload, which let one drop of XRP buy anything.
async function verifyXrpl(payment) {
  const txHash = payment && payment.txHash;
  if (!txHash || !/^[0-9A-Fa-f]{64}$/.test(txHash)) {
    return { valid: false, reason: 'xrpl_txhash_missing_or_malformed' };
  }
  const expectedDest = payToXrpl();
  const asset = payment.asset === 'RLUSD' ? 'RLUSD' : 'XRP';
  let client;
  try {
    client = new xrpl.Client(XRPL_WSS, { connectionTimeout: 8000 });
    await client.connect();
    const resp = await client.request({ command: 'tx', transaction: txHash });
    await client.disconnect();
    const tx = resp.result;
    const body = tx.tx_json || tx;
    if (tx.validated !== true) return { valid: false, reason: 'xrpl_tx_not_validated' };
    if ((body.TransactionType || tx.TransactionType) !== 'Payment') return { valid: false, reason: 'xrpl_not_a_payment' };
    if (!tx.meta || tx.meta.TransactionResult !== 'tesSUCCESS') return { valid: false, reason: 'xrpl_tx_failed' };
    if (body.Destination !== expectedDest) return { valid: false, reason: 'xrpl_wrong_destination' };
    const delivered = tx.meta.delivered_amount;
    if (asset === 'XRP') {
      const needDrops = BigInt(xrpl.xrpToDrops(PRICES.xrpl_xrp));
      if (typeof delivered !== 'string') return { valid: false, reason: 'xrpl_not_native_xrp' };
      if (BigInt(delivered) < needDrops) {
        return { valid: false, reason: 'xrpl_underpaid', delivered_drops: delivered, required_drops: needDrops.toString() };
      }
      return { valid: true, rail: 'xrpl:xrp', txHash, amount_usd: PRICES.xrpl_xrp_usd, paid: (Number(delivered) / 1e6) + ' XRP' };
    }
    if (!delivered || typeof delivered !== 'object') return { valid: false, reason: 'xrpl_not_issued_currency' };
    if (delivered.issuer !== RLUSD_ISSUER) return { valid: false, reason: 'xrpl_wrong_issuer' };
    if (Number(delivered.value) < Number(PRICES.xrpl_xrp)) {
      return { valid: false, reason: 'xrpl_underpaid', delivered: delivered.value, required: PRICES.xrpl_xrp };
    }
    return { valid: true, rail: 'xrpl:rlusd', txHash, amount_usd: Number(delivered.value), paid: delivered.value + ' RLUSD' };
  } catch (e) {
    try { if (client) await client.disconnect(); } catch (e2) { /* ignore */ }
    // FAIL CLOSED. Never fall through to a different verifier — that is how the old
    // code turned an XRPL lookup blip into an unrelated OpenSSL error for the payer.
    //
    // Distinguish "this proof does not exist" (a definitive refusal — do not invite a
    // retry, and never imply we believe a payment happened) from "we could not reach
    // the ledger" (genuinely retryable, and the honest payer's funds are safe).
    const msg = String(e.message || e.data && e.data.error || '');
    const notFound = /txnNotFound|Transaction not found/i.test(msg);
    if (notFound) {
      return { valid: false, reason: 'xrpl_tx_not_found', detail: 'no such transaction on XRPL mainnet', retryable: false };
    }
    return { valid: false, reason: 'xrpl_verifier_unavailable', detail: msg.slice(0, 160), retryable: true };
  }
}

// ---------------- Base / EIP-3009 verification + SETTLEMENT ----------------
// On the EVM `exact` scheme the payer signs a transferWithAuthorization authorization.
// Nothing moves until someone SUBMITS it. The old code called /verify and never
// /settle, so even a good payment collected nothing. Both steps live here.

function decodePaymentHeader(h) {
  if (!h) return null;
  if (typeof h === 'object') return h;
  const s = String(h).trim();
  if (s.startsWith('{')) { try { return JSON.parse(s); } catch (e) { return null; } }
  try {
    const j = Buffer.from(s, 'base64').toString('utf8');
    return JSON.parse(j);
  } catch (e) { return null; }
}

const EIP3009_ABI = [{
  type: 'function', name: 'transferWithAuthorization', stateMutability: 'nonpayable',
  inputs: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' }
  ], outputs: []
}];

function authFrom(payment) {
  const p = payment && (payment.payload || payment);
  const a = p && (p.authorization || p.auth || p);
  if (!a) return null;
  const sig = p.signature || a.signature;
  return {
    from: a.from, to: a.to, value: a.value,
    validAfter: a.validAfter, validBefore: a.validBefore,
    nonce: a.nonce, signature: sig
  };
}

/**
 * Self-settle: submit the payer's signed authorization ourselves from the relayer.
 * Checks the authorization against SERVER-side amount and destination BEFORE
 * spending gas, so a malformed or underpaid authorization costs us nothing.
 */
async function settleBaseSelf(payment) {
  const a = authFrom(payment);
  if (!a || !a.from || !a.signature || !a.nonce) return { ok: false, reason: 'base_authorization_incomplete' };
  const want = payToEvm().toLowerCase();
  if (String(a.to || '').toLowerCase() !== want) return { ok: false, reason: 'base_wrong_destination', expected: payToEvm() };
  let value;
  try { value = BigInt(a.value); } catch (e) { return { ok: false, reason: 'base_value_unparseable' }; }
  if (value < BigInt(PRICES.base_usdc_atomic)) {
    return { ok: false, reason: 'base_underpaid', got: value.toString(), required: PRICES.base_usdc_atomic };
  }
  const now = Math.floor(Date.now() / 1000);
  if (a.validBefore && Number(a.validBefore) < now) return { ok: false, reason: 'base_authorization_expired' };
  try {
    const viem = require('viem');
    const { createWalletClient, createPublicClient, http: vhttp } = viem;
    const { base } = require('viem/chains');
    const { privateKeyToAccount } = require('viem/accounts');
    const pk = process.env.BASE_GAS_PRIVATE_KEY;
    const account = privateKeyToAccount(pk.startsWith('0x') ? pk : '0x' + pk);
    const wallet = createWalletClient({ account, chain: base, transport: vhttp(BASE_RPC) });
    const pub = createPublicClient({ chain: base, transport: vhttp(BASE_RPC) });
    // viem renamed hexToSignature -> parseSignature; support whichever this version has,
    // and derive v from yParity when the newer shape omits it.
    const parse = viem.parseSignature || viem.hexToSignature;
    const sig = parse(a.signature);
    const vByte = sig.v !== undefined && sig.v !== null ? Number(sig.v) : 27 + Number(sig.yParity || 0);
    const hash = await wallet.writeContract({
      address: BASE_USDC, abi: EIP3009_ABI, functionName: 'transferWithAuthorization',
      args: [a.from, a.to, value, BigInt(a.validAfter || 0), BigInt(a.validBefore || (now + 600)), a.nonce, vByte, sig.r, sig.s]
    });
    const rcpt = await pub.waitForTransactionReceipt({ hash, timeout: 90000 });
    if (rcpt.status !== 'success') return { ok: false, reason: 'base_settlement_reverted', txHash: hash };
    return { ok: true, via: 'self-settle', txHash: hash, amount_usd: PRICES.base_usdc_usd };
  } catch (e) {
    return { ok: false, reason: 'base_settlement_error', detail: (e.shortMessage || e.message || '').slice(0, 200) };
  }
}

// ---- CDP facilitator: verify then settle, over HTTPS (the old code used port 80) ----
// JWT shape proven against the live API by _ops_cdprecover.cjs. CDP binds the token to
// the exact request via the `uris` claim, so it must be built per method+path — a token
// minted for one endpoint is rejected on another.
function cdpJwt(method, path) {
  const st = cdpStatus();
  if (!st.ok) throw new Error(st.reason);
  const secret = cdpSecret();
  const kid = st.keyId;
  const now = Math.floor(Date.now() / 1000);
  const header = st.mode === 'ed25519'
    ? { alg: 'EdDSA', kid, typ: 'JWT', nonce: crypto.randomBytes(16).toString('hex') }
    : { alg: 'ES256', kid, typ: 'JWT', nonce: crypto.randomBytes(16).toString('hex') };
  const payload = {
    sub: kid, iss: 'cdp', aud: ['cdp_service'], nbf: now, exp: now + 120,
    uris: [method.toUpperCase() + ' api.cdp.coinbase.com' + path]
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = b64(header) + '.' + b64(payload);
  let sig;
  if (st.mode === 'ed25519') {
    const raw = Buffer.from(secret, 'base64');
    const keyObj = crypto.createPrivateKey({
      key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), raw.subarray(0, 32)]),
      format: 'der', type: 'pkcs8'
    });
    sig = crypto.sign(null, Buffer.from(signingInput), keyObj);
  } else {
    sig = crypto.sign('sha256', Buffer.from(signingInput), { key: crypto.createPrivateKey(secret), dsaEncoding: 'ieee-p1363' });
  }
  return signingInput + '.' + sig.toString('base64url');
}

async function cdpCall(path, body, method) {
  const verb = method || 'POST';
  const jwt = cdpJwt(verb, path);
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cdp.coinbase.com', port: 443, path, method: verb, timeout: 20000,
      headers: Object.assign(
        { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt },
        payload === null ? {} : { 'Content-Length': Buffer.byteLength(payload) }
      )
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(d); } catch (e) { /* keep raw */ }
        resolve({ status: res.statusCode, json: parsed, raw: d.slice(0, 300) });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('cdp timeout')); });
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function baseRequirements() {
  return {
    scheme: 'exact', network: 'eip155:8453', asset: BASE_USDC,
    maxAmountRequired: PRICES.base_usdc_atomic, amount: PRICES.base_usdc_atomic,
    payTo: payToEvm(), maxTimeoutSeconds: 300, resource: 'https://twin.unykorn.org/task',
    extra: { name: 'USD Coin', version: '2' }
  };
}

/**
 * Normalise whatever the payer sent into the canonical x402 v2 PaymentPayload.
 *
 * This is why settlement was returning
 *   "'paymentPayload' is invalid: schema requires 'validAfter', 'permit2Authorization', 'transaction'"
 * The old code forwarded the payer's raw blob straight to CDP. That error is a
 * DISCRIMINATED UNION failing to match ANY variant — CDP accepts an EIP-3009
 * `authorization`, a `permit2Authorization`, or a raw `transaction`, and when none
 * matches it lists the discriminant of all three. It is NOT "you forgot validAfter";
 * adding that one field to a wrong-shaped object would still have been rejected.
 *
 * Per the x402 v2 spec every numeric field is a STRING, and the signature is the
 * single 65-byte hex blob — not split v/r/s. Both are common payer mistakes, so we
 * repair rather than reject: a well-formed payment should never fail on formatting.
 *
 * SECURITY: `accepted` is rebuilt from OUR price table. Nothing the payer sends can
 * set the amount, the asset or the destination — same rule as everywhere else here.
 */
function toCanonicalPayload(payment, ctx) {
  ctx = ctx || {};
  const p = (payment && (payment.payload || payment)) || {};
  const a = (p.authorization || p.auth || p) || {};

  // Reassemble a split signature if that is what arrived.
  let signature = p.signature || payment.signature || a.signature || null;
  if (!signature && a.r && a.s && (a.v !== undefined || a.yParity !== undefined)) {
    const v = a.v !== undefined ? Number(a.v) : (Number(a.yParity) + 27);
    const hex = (x) => String(x).replace(/^0x/, '').padStart(64, '0');
    signature = '0x' + hex(a.r) + hex(a.s) + v.toString(16).padStart(2, '0');
  }

  const str = (x, d) => (x === undefined || x === null || x === '' ? d : String(x));

  // `accepted` is REQUIRED on x402V2PaymentPayload and is what the payload is checked
  // against. It is built here from OUR price table, never from the payer's envelope —
  // a payer who could set `accepted` could quote themselves a one-cent price.
  return {
    x402Version: 2,
    scheme: 'exact',
    network: 'eip155:8453',
    // resource + extensions are what the CDP facilitator indexes for the Bazaar (v2: discovery info rides in
    // PaymentPayload.extensions.bazaar, copied from our 402). The task server passes both per task.
    resource: { url: ctx.resourceUrl || 'https://twin.unykorn.org/task', mimeType: 'application/json' },
    ...(ctx.extensions ? { extensions: ctx.extensions } : {}),
    accepted: {
      scheme: 'exact',
      network: 'eip155:8453',
      amount: PRICES.base_usdc_atomic,
      asset: BASE_USDC,
      payTo: payToEvm(),
      maxTimeoutSeconds: 300,
      extra: { name: 'USD Coin', version: '2' }
    },
    payload: {
      signature: signature,
      authorization: {
        from: a.from,
        to: a.to || payToEvm(),
        value: str(a.value, PRICES.base_usdc_atomic),
        validAfter: str(a.validAfter, '0'),
        validBefore: str(a.validBefore, String(Math.floor(Date.now() / 1000) + 600)),
        nonce: a.nonce
      }
    }
  };
}

/**
 * Settle the Base lane. CDP first when its credentials are genuinely usable,
 * self-settle second. Returns ok:false with a reason if neither can run — the caller
 * must then NOT deliver the resource, and the payer's funds have not moved.
 */
async function settleBase(payment, ctx) {
  ctx = ctx || {};
  const st = cdpStatus();
  if (st.ok) {
    try {
      const reqs = baseRequirements();
      if (ctx.resourceUrl) reqs.resource = ctx.resourceUrl;
      const canonical = toCanonicalPayload(payment, ctx);
      const auth = canonical.payload.authorization;
      if (!canonical.payload.signature || !auth.from || !auth.nonce) {
        return { ok: false, reason: 'base_authorization_incomplete',
                 missing: [!canonical.payload.signature && 'signature', !auth.from && 'from', !auth.nonce && 'nonce'].filter(Boolean) };
      }
      // x402Version belongs at the TOP LEVEL of the request body as well as inside the
      // payload — CDP validates the envelope and the payload against separate schemas.
      const v = await cdpCall('/platform/v2/x402/verify', { x402Version: 2, paymentPayload: canonical, paymentRequirements: reqs });
      const valid = v.json && (v.json.isValid === true || v.json.valid === true);
      if (!valid) {
        return { ok: false, reason: 'cdp_verify_rejected', status: v.status, detail: (v.json && (v.json.invalidReason || v.json.error)) || v.raw };
      }
      const s = await cdpCall('/platform/v2/x402/settle', { x402Version: 2, paymentPayload: canonical, paymentRequirements: reqs });
      const txHash = s.json && (s.json.transaction || s.json.txHash || s.json.transactionHash);
      if (s.status >= 200 && s.status < 300 && txHash) {
        return { ok: true, via: 'cdp', txHash, amount_usd: PRICES.base_usdc_usd };
      }
      // CDP could not settle — fall through to our own relayer rather than serving free.
      const fb = await settleBaseSelf(payment);
      if (fb.ok) return fb;
      return { ok: false, reason: 'cdp_settle_failed_and_selfsettle_failed', cdp: (s.json && s.json.error) || s.raw, self: fb.reason };
    } catch (e) {
      const fb = await settleBaseSelf(payment);
      if (fb.ok) return fb;
      return { ok: false, reason: 'cdp_error_and_selfsettle_failed', detail: (e.message || '').slice(0, 160), self: fb.reason };
    }
  }
  return settleBaseSelf(payment);
}

module.exports = {
  PRICES, BASE_USDC, RLUSD_ISSUER, readiness, buildAccepts,
  verifyXrpl, settleBase, settleBaseSelf, cdpStatus, relayerStatus,
  xrplStatus, stellarStatus, decodePaymentHeader, payToEvm, payToXrpl
};
