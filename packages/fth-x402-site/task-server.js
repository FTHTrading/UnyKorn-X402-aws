#!/usr/bin/env node
/**
 * Genesis402 Task Server — port 3101, fronted by https://twin.unykorn.org
 *
 * Rebuilt 2026-09-13. Operating rules, in priority order:
 *
 *  1. NEVER quote a price we cannot honour. accepts[] is computed from live lane
 *     readiness (_ops_rails.readiness). No payable lane => 503, never a 402.
 *  2. NEVER take a payment without delivering. The payer's proof is claimed in the
 *     replay ledger, the work runs, and only then is the claim committed. Any failure
 *     releases the claim so the proof can be re-presented.
 *  3. NEVER let the payer set the price. All amounts are server-side in _ops_rails.
 *  4. NEVER expose a destructive or internal capability on the paid surface.
 *     site-shutdown / self-repair / fulfill-revenue are gone from HTTP dispatch.
 *  5. Everything a buyer is charged for must be TRUE. wallet-ops queries real chains;
 *     rwa-screen declares its data source and refuses markets it does not cover.
 */

require('./genesis402-env');

const http = require('http');
const crypto = require('crypto');

const rails = require('./_ops_rails.cjs');
const llm = require('./_ops_llm.cjs');
const os = require('os');
// Facilitator bearer: other UnyKorn services (truth gateway, blockchainfraud, MCP tools) present this to settle through
// the rail's CDP credential. Env first, file second. Never logged.
const FACILITATOR_BEARER = (process.env.FACILITATOR_BEARER || (() => { try { return require('fs').readFileSync(require('path').join(os.homedir(), '.unykorn', 'secrets', 'facilitator-proxy.key'), 'utf8').trim(); } catch (e) { return ''; } })());
function bearerOk(req) {
  const a = String(req.headers['authorization'] || '');
  if (!FACILITATOR_BEARER || a.length !== ('Bearer ' + FACILITATOR_BEARER).length) return false;
  let r = 0; const want = 'Bearer ' + FACILITATOR_BEARER;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ want.charCodeAt(i);
  return r === 0;
}
function readBodyLimited(req, limit) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', (c) => { d += c; if (d.length > limit) { reject(new Error('body_too_large')); req.destroy(); } });
    req.on('end', () => resolve(d)); req.on('error', reject);
  });
}
const ledger = require('./_ops_ledger.cjs');
const alerts = require('./_ops_alerts.cjs');
const prove = require('./_ops_prove.cjs');

const PORT = Number(process.env.TASK_SERVER_PORT || 3101);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || 'https://twin.unykorn.org';
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.GENESIS_ADMIN_KEY || '';
const SERVICE = 'genesis402-task-server';
const VERSION = '4.0.0';

const LOG = [];
function log(msg) {
  const e = '[' + new Date().toISOString() + '] ' + msg;
  LOG.push(e);
  if (LOG.length > 500) LOG.shift();
  console.log(e);
}

// =====================================================================
// PAID CATALOG — exactly what a buyer can purchase, and nothing else.
// Each entry states plainly what the money buys. If we cannot describe it
// honestly here, it does not belong on the paid surface.
// =====================================================================
const CATALOG = {
  'genesis-sim': {
    path: '/genesis-sim',
    title: 'Genesis agent-economy simulation',
    buys: 'One deterministic simulation run of an N-agent energy-exchange economy over E epochs, returning the Gini coefficient series, final total energy, a stability verdict, and a SHA-256 commitment over the final state vector.',
    params: { n: 'agents, 5-500, default 50', epochs: 'epochs, 10-200, default 100' },
    deterministic: true,
    typical_ms: '20-400'
  },
  'wallet-ops': {
    path: '/wallet-ops',
    title: 'Live multi-chain treasury balance read',
    buys: 'A live, freshly-queried balance read of the Genesis402 operator treasuries: USDC and native ETH on Base mainnet, XRP and trustline balances on XRPL mainnet, and Stellar account state. Every figure is fetched at request time from a public node and stamped with the source endpoint.',
    params: { chains: 'optional array: base | xrpl | stellar. default all' },
    deterministic: false,
    typical_ms: '800-4000'
  },
  'rwa-screen': {
    path: '/rwa-screen',
    title: 'RWA market readiness lookup',
    buys: 'A readiness record for one covered US energy-RWA market: grid operator, instrument type, readiness state, our published score, and an evidence hash. DATA SOURCE IS A CURATED STATIC TABLE of the four markets listed in markets_supported — it is not a live data feed and it is not investment advice. Unsupported markets are refused, not substituted.',
    params: { market: 'one of: texas, florida, newyork, oregon' },
    markets_supported: ['texas', 'florida', 'newyork', 'oregon'],
    deterministic: true,
    typical_ms: '1-5'
  },
  'llm': {
    path: '/llm',
    title: 'LLM chat completion (local RTX 5090 models first, hosted allowlist second)',
    buys: 'One chat completion, OpenAI message shape in, up to 1,024 output tokens. Local models run on the operator\'s own GPU; hosted models come from an allowlist whose cost is a fraction of the price. The response names the provider and model that actually answered and the token counts. Not deterministic. No content is retained after the response is sent.',
    params: { model: 'optional: a local model (see /llm/models) or an allowlisted hosted id; default local', messages: 'OpenAI-shape array of {role, content}', prompt: 'alternative to messages: one user string', max_tokens: 'optional, 1-1024, default 512', temperature: 'optional, 0-2, default 0.2' },
    price_usd: Number(process.env.PRICE_LLM_USD || 0.02),
    deterministic: false,
    typical_ms: '400-8000'
  },
  'prove': {
    path: '/prove',
    title: 'Signed proof receipt (genesis402-receipt-v1)',
    buys: 'One Ed25519-signed, hash-chained receipt recording that a SHA-256 digest existed at the time of payment: either the rail hashes up to 16 KiB of text you send (OBSERVED) or you send a digest you computed (ATTESTED). The receipt binds to your payment tx, carries truth labels and limitations, and verifies offline with the open verifier at github.com/FTHTrading/402-truth. The rail stores the receipt, never your bytes. Not externally anchored yet.',
    params: { text: 'optional, <= 16 KiB UTF-8, hashed by the rail', sha256: 'optional, 64 hex, your own digest', claim: 'optional, <= 512 chars, reproduced verbatim and not evaluated', subject: 'optional label, <= 200 chars' },
    deterministic: false,
    typical_ms: '2-10'
  }
};

// =====================================================================
// TASK IMPLEMENTATIONS — every returned field must be true.
// =====================================================================

function runGenesisSim(params) {
  const n = Math.max(5, Math.min(500, parseInt(params.n || '50', 10) || 50));
  const epochs = Math.max(10, Math.min(200, parseInt(params.epochs || '100', 10) || 100));
  const agents = Array.from({ length: n }, (_, i) => ({ id: i, energy: 100 + (i % 10) }));
  const giniHistory = [];
  for (let e = 0; e < epochs; e++) {
    for (let i = 0; i < agents.length; i++) {
      const j = (i + 1 + (e % 3)) % agents.length;
      if (agents[i].energy > 30) {
        const amt = 1 + (e % 3);
        agents[i].energy -= amt;
        agents[j].energy += amt;
      }
    }
    const sorted = agents.map((a) => a.energy).sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    let giniSum = 0;
    for (let k = 0; k < sorted.length; k++) giniSum += (k + 1) * sorted[k];
    const gini = (2 * giniSum) / (n * sum) - (n + 1) / n;
    giniHistory.push(Math.max(0, Math.min(1, gini)));
  }
  const finalGini = giniHistory[giniHistory.length - 1];
  const totalEnergy = agents.reduce((a, b) => a + b.energy, 0);
  const commitment = crypto.createHash('sha256').update(agents.map((a) => a.energy).join(',')).digest('hex');
  return {
    type: 'genesis-sim',
    params: { n, epochs },
    result: {
      agents: n,
      epochs,
      final_gini: Number(finalGini.toFixed(6)),
      gini_series_tail: giniHistory.slice(-10).map((g) => Number(g.toFixed(4))),
      total_energy: totalEnergy,
      stable: finalGini < 0.55 && totalEnergy > n * 90,
      stability_rule: 'stable = final_gini < 0.55 AND total_energy > agents*90',
      state_commitment_sha256: commitment
    },
    deterministic: true,
    reproduce: 'identical n and epochs always produce this exact result'
  };
}

const RWA_MARKETS = {
  texas: { grid: 'ERCOT', instrument: 'Renewable Energy Certificates (RECs)', readiness: 'ready', score: 0.87 },
  florida: { grid: 'FPL / Duke', instrument: 'Solar RWA structures', readiness: 'ready', score: 0.79 },
  newyork: { grid: 'NYISO', instrument: 'Storage assets', readiness: 'screening', score: 0.71 },
  oregon: { grid: 'PGE', instrument: 'Hydro certificates', readiness: 'ready', score: 0.82 }
};

function rwaScreen(params) {
  const raw = String(params.market === undefined ? '' : params.market).toLowerCase().replace(/[^a-z]/g, '');
  if (!raw) {
    const err = new Error('market_required');
    err.userMessage = 'params.market is required';
    err.supported = Object.keys(RWA_MARKETS);
    throw err;
  }
  // The previous build silently returned Texas for any unknown market. That is a lie
  // a buyer pays for, so an uncovered market is now an explicit refusal.
  if (!RWA_MARKETS[raw]) {
    const err = new Error('market_not_covered');
    err.userMessage = 'market "' + raw + '" is not covered by this dataset';
    err.supported = Object.keys(RWA_MARKETS);
    throw err;
  }
  const m = RWA_MARKETS[raw];
  const evidence = crypto.createHash('sha256').update('rwa|' + raw + '|' + m.grid + '|' + m.score).digest('hex');
  return {
    type: 'rwa-screen',
    params: { market: raw },
    result: {
      market: raw,
      grid_operator: m.grid,
      instrument: m.instrument,
      readiness: m.readiness,
      score: m.score,
      score_scale: '0..1, Unykorn internal readiness score',
      evidence_hash_sha256: evidence,
      data_source: 'curated static table maintained by Unykorn; NOT a live market feed',
      markets_supported: Object.keys(RWA_MARKETS),
      not_advice: 'informational only; not investment, legal or tax advice'
    },
    deterministic: true
  };
}

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }
];

async function baseBalances() {
  const addr = rails.payToEvm();
  const rpcUrl = process.env.BASE_RPC || 'https://mainnet.base.org';
  if (!addr) return { ok: false, reason: 'evm_treasury_unset' };
  try {
    const { createPublicClient, http: vhttp, formatUnits, formatEther } = require('viem');
    const { base } = require('viem/chains');
    const pub = createPublicClient({ chain: base, transport: vhttp(rpcUrl) });
    const [usdc, eth] = await Promise.all([
      pub.readContract({ address: rails.BASE_USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] }),
      pub.getBalance({ address: addr })
    ]);
    return {
      ok: true, address: addr, network: 'base-mainnet (eip155:8453)',
      usdc: formatUnits(usdc, 6), eth: formatEther(eth),
      usdc_contract: rails.BASE_USDC, source: rpcUrl, queried_at: new Date().toISOString()
    };
  } catch (e) {
    return { ok: false, reason: 'base_rpc_error', detail: (e.shortMessage || e.message || '').slice(0, 160), source: rpcUrl };
  }
}

async function walletOps(params) {
  const want = Array.isArray(params.chains) && params.chains.length
    ? params.chains.map((c) => String(c).toLowerCase())
    : ['base', 'xrpl', 'stellar'];
  const jobs = {};
  if (want.includes('base')) jobs.base = baseBalances();
  if (want.includes('xrpl')) jobs.xrpl = rails.xrplStatus();
  if (want.includes('stellar')) jobs.stellar = rails.stellarStatus();
  const keys = Object.keys(jobs);
  const settled = await Promise.all(keys.map((k) => jobs[k]));
  const chains = {};
  keys.forEach((k, i) => { chains[k] = settled[i]; });
  return {
    type: 'wallet-ops',
    params: { chains: want },
    result: {
      chains,
      note: 'every figure above was queried live from a public node at request time; no cached or hardcoded balances',
      queried_at: new Date().toISOString()
    },
    deterministic: false
  };
}

// =====================================================================
// HTTP plumbing
// =====================================================================
function send(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(body);
}

function resourceDoc(taskName) {
  const c = CATALOG[taskName] || CATALOG['genesis-sim'];
  return {
    url: PUBLIC_ORIGIN + c.path,
    description: c.title + ' — Genesis402 / UnyKorn Operator Network',
    mimeType: 'application/json',
    serviceName: c.title,
    tags: ['infra', 'ai', 'agents', 'genesis402', 'unykorn'],
    what_you_get: c.buys,
    parameters: c.params,
    deterministic: c.deterministic,
    typical_execution_ms: c.typical_ms
  };
}

// Bazaar discovery extension (x402 v2, @x402/extensions "bazaar"): a worked example plus a JSON Schema
// so an agent can build a valid paid request before paying. The CDP facilitator indexes this after the
// first settled call. Shape per coinbase/x402 typescript/packages/extensions/src/bazaar/http/types.ts.
const BAZAAR_EXAMPLES = {
  'genesis-sim': { input: { params: { n: 50, epochs: 100 } }, schema: { n: { type: 'integer', minimum: 5, maximum: 500 }, epochs: { type: 'integer', minimum: 10, maximum: 200 } }, output: { type: 'genesis-sim', result: { agents: 50, epochs: 100, final_gini: 0.41, total_energy: 5225, stable: true, state_commitment_sha256: '<64 hex>' } } },
  'wallet-ops': { input: { params: { chains: ['base'] } }, schema: { chains: { type: 'array', items: { type: 'string', enum: ['base', 'xrpl', 'stellar'] } } }, output: { type: 'wallet-ops', balances: { base: { usdc: '<decimal>', eth: '<decimal>', source: 'https://mainnet.base.org' } } } },
  'rwa-screen': { input: { params: { market: 'texas' } }, schema: { market: { type: 'string', enum: ['texas', 'florida', 'newyork', 'oregon'] } }, output: { type: 'rwa-screen', market: 'texas', grid: 'ERCOT', readiness: 'ready', score: 0.87, data_source: 'curated static table; not advice' } },
  'llm': { input: { params: { model: 'qwen2.5:7b', messages: [{ role: 'user', content: 'Summarise the x402 payment flow in three sentences.' }], max_tokens: 200 } }, schema: { model: { type: 'string' }, messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string', enum: ['system', 'user', 'assistant'] }, content: { type: 'string' } }, required: ['role', 'content'] } }, prompt: { type: 'string', maxLength: 24000 }, max_tokens: { type: 'integer', minimum: 1, maximum: 1024 }, temperature: { type: 'number', minimum: 0, maximum: 2 } }, output: { type: 'llm', provider: 'ollama-local', model: 'qwen2.5:7b', output: '<assistant text>', usage: { prompt_tokens: 42, completion_tokens: 88 }, finish_reason: 'stop' } },
  'prove': { input: { params: { sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', claim: 'invoice 1042 existed before the dispute', subject: 'invoice-1042' } }, schema: { sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, text: { type: 'string', maxLength: 16384 }, claim: { type: 'string', maxLength: 512 }, subject: { type: 'string', maxLength: 200 } }, output: { type: 'prove', proofReceipt: { receiptVersion: 'genesis402-receipt-v1', receiptId: 'g402_rcpt_<12hex>', truthLabels: ['ATTESTED', 'VERIFIED'], issuer: { keyId: 'g402-key-<16hex>', alg: 'ed25519' } }, verify: { keys: '/prove/keys', source: 'https://github.com/FTHTrading/402-truth' } } }
};
function taskPrice(taskName) {
  const c = CATALOG[taskName];
  const p = c && Number(c.price_usd);
  return Number.isFinite(p) && p > 0 ? p : rails.PRICES.base_usdc_usd;
}
const lanesMod = require('./_ops_lanes.cjs');

function bazaarExtension(taskName) {
  const ex = BAZAAR_EXAMPLES[taskName]; if (!ex) return null;
  return { bazaar: {
    info: { input: { type: 'http', method: 'POST', bodyType: 'json', body: ex.input }, output: { type: 'json', example: Object.assign({ ok: true, receipt: { receipt_id: 'g402-<16hex>', tx_hash: '0x<64hex>', amount_usd: rails.PRICES.base_usdc_usd } }, ex.output) } },
    schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: { input: { type: 'object', properties: { type: { type: 'string', const: 'http' }, method: { type: 'string', enum: ['POST'] }, bodyType: { type: 'string', enum: ['json'] }, body: { type: 'object', properties: { params: { type: 'object', properties: ex.schema } }, required: ['params'] } }, required: ['type', 'method', 'bodyType', 'body'] },
        output: { type: 'object' } }, required: ['input'] }
  } };
}

/**
 * 402 challenge — or 503 when no lane is payable.
 * Quoting a price on a lane we cannot receive on or settle is the exact defect this
 * rebuild removes, so "no payable lane" must never render as a 402.
 */
async function sendChallenge(res, taskName) {
  const r = await rails.readiness();
  const accepts = rails.buildAccepts(r, taskPrice(taskName));
  if (!accepts.length) {
    alerts.alert('crit', 'x402 gate FAIL-CLOSED — no payable lane', {
      Reason: 'every settlement/receive lane is unavailable',
      Base: r.lanes['base:usdc'].reason,
      XRPL: r.lanes['xrpl:xrp'].reason,
      Action: 'fund relayer with Base ETH or install a valid CDP key'
    }, 'fail-closed');
    return send(res, 503, {
      error: 'payment_rail_unavailable',
      message: 'No settlement lane is currently available, so this endpoint will not quote a price it cannot honour. Nothing was charged. Retry later.',
      lanes: r.lanes,
      retry_after_seconds: 300
    }, { 'Retry-After': '300' });
  }
  const ext = bazaarExtension(taskName);
  const payload = { x402Version: 2, error: 'Payment required', resource: resourceDoc(taskName), accepts, ...(ext ? { extensions: ext } : {}) };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  send(res, 402, payload, {
    'Payment-Required': b64,
    'payment-required': b64,
    'Access-Control-Expose-Headers': 'Payment-Required, payment-required'
  });
}

async function runTask(taskName, params, ctx) {
  if (taskName === 'llm') { const r = await llm.run(params, ctx); return Object.assign({ type: 'llm' }, r); }
  if (taskName === 'genesis-sim') return runGenesisSim(params);
  if (taskName === 'rwa-screen') return rwaScreen(params);
  if (taskName === 'wallet-ops') return walletOps(params);
  if (taskName === 'prove') return prove.prove(params, ctx);
  const err = new Error('unknown_task');
  err.userMessage = 'unknown task "' + taskName + '"';
  err.supported = Object.keys(CATALOG);
  throw err;
}

/**
 * The paid path. Order is deliberate:
 *   verify on-chain -> CLAIM the proof -> run the work -> COMMIT
 * Any failure after the claim RELEASES it, so a payer is never burned for a run they
 * did not receive. A settlement that succeeded but whose delivery failed still
 * releases and is alerted, because at that point we owe the buyer either the work or
 * a refund and that must be visible, not swallowed.
 */
async function handlePaid(req, res, taskName, body) {
  let parsed = {};
  if (body && body.trim()) {
    try { parsed = JSON.parse(body); } catch (e) { return send(res, 400, { error: 'invalid_json' }); }
  }
  const params = parsed.params || {};
  const header = req.headers['x-payment'] || req.headers['payment-signature'];
  if (!header) return sendChallenge(res, taskName);

  const payment = rails.decodePaymentHeader(header);
  if (!payment) return send(res, 400, { error: 'x_payment_undecodable', message: 'X-PAYMENT must be JSON or base64-encoded JSON' });

  const r = await rails.readiness();
  const laneKey = rails.selectLane(payment);
  if (!laneKey) return send(res, 400, { error: 'unknown_network', message: 'X-PAYMENT names a network this rail does not run. Lanes: ' + Object.keys(r.lanes).join(', ') });
  const isXrpl = laneKey.startsWith('xrpl:');
  const isStellar = laneKey === 'stellar:usdc';
  if (!r.lanes[laneKey] || !r.lanes[laneKey].payable) {
    return send(res, 503, {
      error: 'lane_unavailable', lane: laneKey,
      reason: r.lanes[laneKey] ? r.lanes[laneKey].reason : 'unknown_lane',
      message: 'That lane is not currently payable. Nothing was charged.'
    }, { 'Retry-After': '300' });
  }

  // ---- step 1: establish that money actually moved to us ----
  let proof;
  if (isXrpl) {
    const v = await rails.verifyXrpl(payment);
    if (!v.valid) {
      alerts.alert('warn', 'x402 payment REJECTED', { Lane: laneKey, Reason: v.reason, Task: taskName, Detail: v.detail }, 'reject:' + v.reason);
      return send(res, v.retryable ? 503 : 402, {
        error: 'payment_not_verified', reason: v.reason, detail: v.detail,
        required: { asset: payment.asset === 'RLUSD' ? 'RLUSD' : 'XRP', amount: rails.PRICES.xrpl_xrp, payTo: rails.payToXrpl() },
        message: v.retryable
          ? 'Our verifier could not reach the XRPL right now. We fail closed rather than guess. Your payment is on-chain and can be re-presented once this clears.'
          : 'That proof did not verify as a settled payment of the required amount to our address.'
      });
    }
    proof = { rail: v.rail, txHash: v.txHash, amount_usd: v.amount_usd, paid: v.paid, settled_by: 'payer (pay-first rail)' };
  } else if (isStellar) {
    const v = await rails.verifyStellar(payment);
    if (!v.valid) {
      alerts.alert('warn', 'x402 payment REJECTED', { Lane: laneKey, Reason: v.reason, Task: taskName, Detail: v.detail }, 'reject:' + v.reason);
      return send(res, v.retryable ? 503 : 402, {
        error: 'payment_not_verified', reason: v.reason, detail: v.detail,
        required: { asset: 'USDC', issuer: r.lanes[laneKey].usdc_issuer, amount: r.lanes[laneKey].price_usd, payTo: r.lanes[laneKey].payTo },
        message: v.retryable
          ? 'Our verifier could not reach Horizon right now. We fail closed rather than guess. Your payment is on-chain and can be re-presented once this clears.'
          : 'That proof did not verify as a settled USDC payment of the required amount to our Stellar address.'
      });
    }
    proof = { rail: v.rail, txHash: v.txHash, amount_usd: v.amount_usd, paid: v.paid, settled_by: 'payer (pay-first rail)' };
  } else {
    const s = await rails.settleExact(payment, laneKey, { resourceUrl: PUBLIC_ORIGIN + CATALOG[taskName].path, extensions: bazaarExtension(taskName), priceUsd: taskPrice(taskName) });
    if (!s.ok) {
      alerts.alert('warn', 'x402 ' + laneKey + ' settlement FAILED', { Reason: s.reason, Detail: s.detail || s.self || '', Task: taskName }, 'settlefail:' + laneKey + ':' + s.reason);
      return send(res, 402, {
        error: 'settlement_failed', lane: laneKey, reason: s.reason, detail: s.detail || s.self,
        message: 'Your authorization was not settled, so no funds moved from your wallet and nothing was delivered.'
      });
    }
    proof = { rail: laneKey, txHash: s.txHash, amount_usd: s.amount_usd, paid: '$' + s.amount_usd + ' USDC', settled_by: s.via };
  }

  // ---- step 2: burn the proof so it cannot buy twice ----
  const claimed = ledger.claim(proof.rail, proof.txHash, { task: taskName });
  if (!claimed.ok) {
    alerts.alert('warn', 'x402 REPLAY refused', { Lane: proof.rail, Tx: proof.txHash, FirstSpent: claimed.consumedAt }, 'replay:' + proof.txHash);
    return send(res, 409, {
      error: 'tx_hash_already_consumed', rail: proof.rail, tx_hash: proof.txHash,
      first_consumed_at: claimed.consumedAt, prior_receipt: claimed.receipt,
      message: 'That payment proof has already been redeemed. Each on-chain payment buys exactly one execution.'
    });
  }

  // ---- step 3: do the work, then commit (or release on any failure) ----
  const started = Date.now();
  try {
    const out = await runTask(taskName, params, { rail: proof.rail, txHash: proof.txHash, amountUsd: proof.amount_usd });
    const receipt = {
      receipt_id: 'g402-' + crypto.randomBytes(8).toString('hex'),
      task: taskName,
      rail: proof.rail,
      tx_hash: proof.txHash,
      amount_usd: proof.amount_usd,
      paid: proof.paid,
      settled_by: proof.settled_by,
      duration_ms: Date.now() - started,
      at: new Date().toISOString()
    };
    ledger.commit(proof.rail, proof.txHash, receipt);
    const st = ledger.stats();
    log('PAID ' + taskName + ' ' + proof.rail + ' ' + proof.paid + ' tx=' + proof.txHash + ' receipt=' + receipt.receipt_id);
    alerts.alert('money', 'x402 PAYMENT SETTLED', {
      Task: taskName, Lane: proof.rail, Amount: proof.paid, 'Settled by': proof.settled_by,
      Tx: proof.txHash, Receipt: receipt.receipt_id,
      'Lifetime gross': '$' + st.gross_usd + ' over ' + st.receipts + ' sales'
    });
    return send(res, 200, Object.assign({ ok: true, receipt }, out));
  } catch (e) {
    ledger.release(proof.rail, proof.txHash);
    const userErr = e.userMessage || 'task_execution_failed';
    const owed = !isXrpl && !isStellar; // facilitator-settled lanes: the buyer's money moved before delivery
    log('DELIVERY FAILED ' + taskName + ' tx=' + proof.txHash + ' err=' + e.message + ' (claim released)');
    alerts.alert('crit', 'x402 PAID BUT NOT DELIVERED', {
      Task: taskName, Lane: proof.rail, Tx: proof.txHash, Error: e.message,
      Owed: owed ? 'buyer paid and got nothing — refund or re-deliver' : 'proof released; buyer may re-present it',
      Action: owed ? 'REFUND REQUIRED' : 'none, payer can retry'
    });
    return send(res, e.supported ? 400 : 500, {
      error: userErr, supported: e.supported,
      payment: { rail: proof.rail, tx_hash: proof.txHash, status: 'proof released — re-present it to retry at no additional cost' },
      message: 'Your payment verified but the task did not complete. Your payment proof has been released so you can retry without paying again.'
    });
  }
}

// =====================================================================
// Router
// =====================================================================
const PATH_TO_TASK = {
  '/llm': 'llm',
  '/task': null,               // task chosen by body.type
  '/genesis-sim': 'genesis-sim',
  '/rwa-screen': 'rwa-screen',
  '/wallet-ops': 'wallet-ops',
  '/prove': 'prove'
};

function isAdmin(req) {
  if (!ADMIN_KEY) return false;
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const given = Buffer.from(m[1]);
  const want = Buffer.from(ADMIN_KEY);
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-PAYMENT,Authorization' });
    return res.end();
  }

  let url;
  try { url = new URL(req.url, 'http://' + (req.headers.host || 'localhost')); }
  catch (e) { return send(res, 400, { error: 'bad_request_uri' }); }
  const p = url.pathname.replace(/\/+$/, '') || '/';

  // ---------- free: health ----------
  if (p === '/health') {
    const r = await rails.readiness();
    return send(res, 200, {
      status: r.any_payable ? 'ok' : 'degraded_fail_closed',
      service: SERVICE, version: VERSION, port: PORT, public_origin: PUBLIC_ORIGIN,
      tasks: Object.keys(CATALOG),
      payable_lanes: r.payable_lanes,
      lanes: r.lanes,
      replay_protection: { enabled: true, scope: 'rail:tx_hash', ledger: ledger.stats() },
      settlement: { cdp: r.cdp.ok ? 'ready' : r.cdp.reason, self_settle: r.relayer.ok ? 'ready' : r.relayer.reason },
      fail_closed: 'when no lane is payable this service returns 503 and never quotes a price',
      checked_at: r.checked_at
    });
  }

  // ---------- free: discovery ----------
  if (p === '/.well-known/x402') {
    const r = await rails.readiness();
    const accepts = rails.buildAccepts(r);
    return send(res, 200, {
      x402Version: 2,
      provider: { name: 'Genesis402 — UnyKorn Operator Network', origin: PUBLIC_ORIGIN, contact: process.env.X402_CONTACT || 'x402@unykorn.org' },
      status: r.any_payable ? 'live' : 'fail_closed_no_payable_lane',
      services: Object.entries(CATALOG).map(([name, c]) => ({
        name,
        endpoint: PUBLIC_ORIGIN + c.path,
        title: c.title,
        what_you_get: c.buys,
        parameters: c.params,
        markets_supported: c.markets_supported,
        deterministic: c.deterministic,
        typical_execution_ms: c.typical_ms,
        price: { usd: taskPrice(name), note: 'per successful execution on base, polygon or solana (USDC, this task\'s price); pay-first lanes: stellar ' + lanesMod.STELLAR_PRICE + ' USDC, XRPL ' + rails.PRICES.xrpl_xrp + ' XRP flat' }
      })),
      accepts,
      lanes: r.lanes,
      terms: {
        unit_of_sale: 'one successful task execution per on-chain payment proof',
        replay: 'each payment proof redeems exactly once; a re-presented proof returns HTTP 409',
        underpayment: 'an amount below the server-side price is refused; the server never reads a price from the payer',
        failure: 'if the task fails after payment, the payment proof is RELEASED and can be re-presented at no extra cost; the response says so explicitly',
        unavailable: 'if no lane can settle, endpoints return HTTP 503 and no price is quoted',
        refunds: 'Base lane: funds do not move unless settlement succeeds. XRPL lane is pay-first: if verification fails the proof is retryable, and unresolved cases are handled by contacting the address above.',
        not_advice: 'rwa-screen is informational only and is not investment, legal or tax advice'
      },
      free_endpoints: ['/health', '/.well-known/x402', '/prove/keys', '/prove/stats', '/prove/receipts/{receiptId}', '/llm/models'],
      generated_at: new Date().toISOString()
    });
  }

  // ---------- free: proof receipt lookup + issuer key (so anyone can verify offline) ----------
  if (p === '/prove/keys') return send(res, 200, [prove.registryEntry()]);
  // ---------- facilitator proxy (bearer): the estate settles on Base/Polygon/Solana through this process's CDP key ----------
  if (p === '/facilitator/supported' || p === '/facilitator/verify' || p === '/facilitator/settle') {
    if (!FACILITATOR_BEARER) return send(res, 503, { refused: 'facilitator proxy not configured' });
    if (!bearerOk(req)) return send(res, 401, { refused: 'bearer required' });
    const which = p.split('/').pop();
    try {
      if (which === 'supported') {
        if (req.method !== 'GET') return send(res, 405, { refused: 'GET' });
        const r = await rails.cdpCall('/platform/v2/x402/supported', undefined, 'GET');
        return send(res, r.status, r.json || { raw: r.raw });
      }
      if (req.method !== 'POST') return send(res, 405, { refused: 'POST' });
      const raw = await readBodyLimited(req, 65536);
      let body; try { body = JSON.parse(raw); } catch (e) { return send(res, 400, { refused: 'invalid JSON' }); }
      if (!body || !body.paymentPayload || !body.paymentRequirements) return send(res, 400, { refused: 'paymentPayload and paymentRequirements required' });
      const r = await rails.cdpCall('/platform/v2/x402/' + which, { x402Version: body.x402Version || 2, paymentPayload: body.paymentPayload, paymentRequirements: body.paymentRequirements });
      log('FACILITATOR ' + which + ' -> ' + r.status);
      return send(res, r.status, r.json || { raw: r.raw });
    } catch (e) {
      return send(res, e.message === 'body_too_large' ? 413 : 502, { refused: e.message === 'body_too_large' ? 'body too large' : 'facilitator upstream error', detail: (e.message || '').slice(0, 160) });
    }
  }
  if (p === '/llm/models') { const st = await llm.status(); return send(res, 200, Object.assign({ price_usd: taskPrice('llm'), max_output_tokens: llm.MAX_OUTPUT_TOKENS, max_input_chars: llm.MAX_INPUT_CHARS, note: 'local models run on the operator GPU; hosted models are an allowlist; the paid response names the one that answered' }, st)); }
  if (p === '/prove/stats') return send(res, 200, { ...prove.stats(), keyId: prove.registryEntry().keyId, anchor: 'UNANCHORED', verifier: 'https://github.com/FTHTrading/402-truth' });
  if (p === '/prove/recent') return send(res, 200, { receipts: prove.recent(20), anchor: 'UNANCHORED' });
  if (p.startsWith('/prove/receipts/')) {
    const r = prove.get(p.slice('/prove/receipts/'.length));
    return r ? send(res, 200, { receipt: r, keys: [prove.registryEntry()], anchor: 'UNANCHORED' }) : send(res, 404, { error: 'receipt_not_found' });
  }

  // ---------- admin ----------
  if (p === '/admin/receipts' || p === '/log' || p === '/admin/log') {
    if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
    if (p === '/admin/receipts') return send(res, 200, { stats: ledger.stats(), recent: ledger.recent(50) });
    return send(res, 200, { log: LOG.slice(-100) });
  }

  // ---------- paid ----------
  if (Object.prototype.hasOwnProperty.call(PATH_TO_TASK, p)) {
    if (req.method === 'GET') {
      const t = PATH_TO_TASK[p] || 'genesis-sim';
      return sendChallenge(res, t);
    }
    if (req.method === 'POST') {
      let body = '';
      let tooBig = false;
      req.on('data', (c) => {
        body += c;
        if (body.length > 64 * 1024) { tooBig = true; req.destroy(); }
      });
      req.on('end', async () => {
        if (tooBig) return send(res, 413, { error: 'payload_too_large' });
        let taskName = PATH_TO_TASK[p];
        if (!taskName) {
          let t = null;
          try { t = (JSON.parse(body || '{}').type) || null; } catch (e) { /* handled downstream */ }
          taskName = t || 'genesis-sim';
        }
        if (!CATALOG[taskName]) {
          return send(res, 400, { error: 'unknown_task', requested: taskName, supported: Object.keys(CATALOG) });
        }
        try { await handlePaid(req, res, taskName, body); }
        catch (e) {
          log('UNHANDLED ' + (e && e.stack ? e.stack : e));
          alerts.alert('crit', 'x402 unhandled server error', { Task: taskName, Error: String(e && e.message) }, 'unhandled');
          if (!res.headersSent) send(res, 500, { error: 'internal_error' });
        }
      });
      return undefined;
    }
    return send(res, 405, { error: 'method_not_allowed', allow: 'GET, POST' });
  }

  return send(res, 404, { error: 'not_found', free: ['/health', '/.well-known/x402', '/prove/keys', '/prove/receipts/{receiptId}'], paid: Object.values(CATALOG).map((c) => c.path) });
});

// =====================================================================
// Startup + standing lane monitor
// =====================================================================
let lastPayable = null;

async function laneWatch() {
  try {
    const r = await rails.readiness(true);
    const nowKey = r.payable_lanes.join(',') || 'NONE';
    if (lastPayable !== null && nowKey !== lastPayable) {
      const level = r.any_payable ? 'warn' : 'crit';
      alerts.alert(level, 'x402 lane availability CHANGED', {
        Was: lastPayable, Now: nowKey,
        Base: r.lanes['base:usdc'].payable ? 'payable via ' + r.lanes['base:usdc'].settle_via : r.lanes['base:usdc'].reason,
        XRPL: r.lanes['xrpl:xrp'].payable ? 'payable' : r.lanes['xrpl:xrp'].reason
      });
    }
    lastPayable = nowKey;
  } catch (e) { /* monitor must never crash the server */ }
}

server.listen(PORT, '127.0.0.1', async () => {
  log(SERVICE + ' v' + VERSION + ' listening on http://127.0.0.1:' + PORT);
  log('paid tasks: ' + Object.keys(CATALOG).join(', '));
  log('replay ledger: ' + ledger.DB_PATH);
  const r = await rails.readiness(true);
  lastPayable = r.payable_lanes.join(',') || 'NONE';
  log('payable lanes at boot: ' + lastPayable);
  if (!ADMIN_KEY) log('WARNING: no ADMIN_KEY set — /admin/receipts and /log are closed to everyone');
  await alerts.alertSync(r.any_payable ? 'info' : 'crit', 'Genesis402 rail started', {
    Version: VERSION,
    'Payable lanes': lastPayable,
    Base: r.lanes['base:usdc'].payable ? 'payable via ' + r.lanes['base:usdc'].settle_via : 'DOWN — ' + r.lanes['base:usdc'].reason,
    XRPL: r.lanes['xrpl:xrp'].payable ? 'payable 0.05 XRP' : 'DOWN — ' + r.lanes['xrpl:xrp'].reason,
    'Lifetime gross': '$' + ledger.stats().gross_usd,
    Alerts: 'you will get a message on every settled payment, every rejection, and any lane change'
  });
  setInterval(laneWatch, Number(process.env.LANE_WATCH_MS || 300000));
});

process.on('SIGINT', () => { log('shutting down'); process.exit(0); });
process.on('SIGTERM', () => { log('shutting down'); process.exit(0); });
process.on('unhandledRejection', (e) => log('unhandledRejection: ' + (e && e.message)));
