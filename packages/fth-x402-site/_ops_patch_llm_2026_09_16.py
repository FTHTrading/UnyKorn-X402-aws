# Adds per-task pricing to the rail and the paid `llm` task (OpenAI-shaped chat completion, local Ollama first,
# OpenRouter allowlist second). Idempotent (marker: _ops_llm).
import io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))

def patch(name, edits, marker):
    p = os.path.join(HERE, name)
    s = io.open(p, encoding='utf-8').read()
    if marker in s:
        print(name, 'already patched'); return
    for old, new, label in edits:
        assert s.count(old) == 1, name + ' anchor: ' + label + ' (count=%d)' % s.count(old)
        s = s.replace(old, new, 1)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print(name, 'patched')

# ---------------- _ops_rails.cjs: price per task flows through requirements, canonical payload, self-settle, accepts ----------------
patch('_ops_rails.cjs', [
    ("""function baseRequirements() {
  return {
    scheme: 'exact', network: 'eip155:8453', asset: BASE_USDC,
    maxAmountRequired: PRICES.base_usdc_atomic, amount: PRICES.base_usdc_atomic,""",
     """/** USD price -> USDC atomic (6 decimals). Falls back to the rail default when absent or malformed. */
function priceAtomicOf(ctx) {
  const usd = ctx && ctx.priceUsd != null ? Number(ctx.priceUsd) : NaN;
  if (!Number.isFinite(usd) || usd <= 0) return PRICES.base_usdc_atomic;
  return String(Math.round(usd * 1e6));
}
function priceUsdOf(ctx) { return Number(priceAtomicOf(ctx)) / 1e6; }

function baseRequirements(ctx) {
  const atomic = priceAtomicOf(ctx);
  return {
    scheme: 'exact', network: 'eip155:8453', asset: BASE_USDC,
    maxAmountRequired: atomic, amount: atomic,""", 'baseRequirements'),
    ("""      amount: PRICES.base_usdc_atomic,
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
        value: str(a.value, PRICES.base_usdc_atomic),""",
     """      amount: priceAtomicOf(ctx),
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
        value: str(a.value, priceAtomicOf(ctx)),""", 'canonical amount'),
    ("""      const reqs = baseRequirements();
      if (ctx.resourceUrl) reqs.resource = ctx.resourceUrl;""",
     """      const reqs = baseRequirements(ctx);
      if (ctx.resourceUrl) reqs.resource = ctx.resourceUrl;""", 'settleBase reqs'),
    ("""      if (s.status >= 200 && s.status < 300 && txHash) {
        return { ok: true, via: 'cdp', txHash, amount_usd: PRICES.base_usdc_usd };
      }""",
     """      if (s.status >= 200 && s.status < 300 && txHash) {
        return { ok: true, via: 'cdp', txHash, amount_usd: priceUsdOf(ctx) };
      }""", 'settleBase amount'),
    ("""  if (value < BigInt(PRICES.base_usdc_atomic)) {
    return { ok: false, reason: 'base_underpaid', got: value.toString(), required: PRICES.base_usdc_atomic };""",
     """  const requiredAtomic = priceAtomicOf(ctx);
  if (value < BigInt(requiredAtomic)) {
    return { ok: false, reason: 'base_underpaid', got: value.toString(), required: requiredAtomic };""", 'self-settle underpaid'),
    ("""async function settleBaseSelf(payment) {""", """async function settleBaseSelf(payment, ctx) {""", 'self-settle sig'),
    ("""      const fb = await settleBaseSelf(payment);
      if (fb.ok) return fb;
      return { ok: false, reason: 'cdp_settle_failed_and_selfsettle_failed', cdp: (s.json && s.json.error) || s.raw, self: fb.reason };
    } catch (e) {
      const fb = await settleBaseSelf(payment);
      if (fb.ok) return fb;
      return { ok: false, reason: 'cdp_error_and_selfsettle_failed', detail: (e.message || '').slice(0, 160), self: fb.reason };
    }
  }
  return settleBaseSelf(payment);""",
     """      const fb = await settleBaseSelf(payment, ctx);
      if (fb.ok) return fb;
      return { ok: false, reason: 'cdp_settle_failed_and_selfsettle_failed', cdp: (s.json && s.json.error) || s.raw, self: fb.reason };
    } catch (e) {
      const fb = await settleBaseSelf(payment, ctx);
      if (fb.ok) return fb;
      return { ok: false, reason: 'cdp_error_and_selfsettle_failed', detail: (e.message || '').slice(0, 160), self: fb.reason };
    }
  }
  return settleBaseSelf(payment, ctx);""", 'self-settle calls'),
    ("""function buildAccepts(r) {
  const out = [];
  if (r.lanes['base:usdc'].payable) {
    out.push({
      scheme: 'exact', network: 'eip155:8453', asset: BASE_USDC,
      amount: PRICES.base_usdc_atomic, payTo: payToEvm(), maxTimeoutSeconds: 300,""",
     """function buildAccepts(r, priceUsd) {
  const ctx = { priceUsd };
  const atomic = priceAtomicOf(ctx);
  const out = [];
  if (r.lanes['base:usdc'].payable) {
    out.push({
      scheme: 'exact', network: 'eip155:8453', asset: BASE_USDC,
      amount: atomic, payTo: payToEvm(), maxTimeoutSeconds: 300,""", 'buildAccepts'),
    ("""      const q = lanes.exactRequirements(k, r.lanes[k]); delete q.resource;""",
     """      const q = lanes.exactRequirements(k, r.lanes[k], undefined, atomic); delete q.resource;""", 'accepts exact'),
    ("""  return lanes.settleExactCdp(cdpCall, laneKey, st, payment, ctx);""",
     """  return lanes.settleExactCdp(cdpCall, laneKey, st, payment, Object.assign({}, ctx, { priceAtomic: priceAtomicOf(ctx) }));""", 'settleExact ctx'),
    ("""  selectLane: lanes.selectLane, verifyStellar: lanes.verifyStellar, EXACT_LANES: lanes.EXACT_LANES, cdpCall""",
     """  selectLane: lanes.selectLane, verifyStellar: lanes.verifyStellar, EXACT_LANES: lanes.EXACT_LANES, cdpCall, priceAtomicOf""", 'exports'),
], 'priceAtomicOf')

# ---------------- _ops_lanes.cjs: per-call amount override ----------------
patch('_ops_lanes.cjs', [
    ("""function exactRequirements(laneKey, status, resourceUrl) {
  const lane = EXACT_LANES[laneKey];
  const extra = lane.kind === 'svm' ? { feePayer: status.fee_payer } : { ...lane.extra };
  return {
    scheme: 'exact', network: lane.network, asset: lane.asset,
    maxAmountRequired: lane.atomic, amount: lane.atomic,""",
     """function exactRequirements(laneKey, status, resourceUrl, atomicOverride) {
  const lane = EXACT_LANES[laneKey];
  const atomic = atomicOverride && /^\\d+$/.test(String(atomicOverride)) ? String(atomicOverride) : lane.atomic;
  const extra = lane.kind === 'svm' ? { feePayer: status.fee_payer } : { ...lane.extra };
  return {
    scheme: 'exact', network: lane.network, asset: lane.asset,
    maxAmountRequired: atomic, amount: atomic,""", 'exactRequirements'),
    ("""  const req = exactRequirements(laneKey, status, ctx.resourceUrl);
  const p = (payment && (payment.payload || payment)) || {};
  const base = {
    x402Version: 2, scheme: 'exact', network: lane.network,
    resource: { url: ctx.resourceUrl || 'https://twin.unykorn.org/task', mimeType: 'application/json' },
    ...(ctx.extensions ? { extensions: ctx.extensions } : {}),
    accepted: { scheme: 'exact', network: lane.network, amount: lane.atomic, asset: lane.asset, payTo: status.payTo, maxTimeoutSeconds: 300, extra: req.extra }
  };""",
     """  const req = exactRequirements(laneKey, status, ctx.resourceUrl, ctx.priceAtomic);
  const p = (payment && (payment.payload || payment)) || {};
  const base = {
    x402Version: 2, scheme: 'exact', network: lane.network,
    resource: { url: ctx.resourceUrl || 'https://twin.unykorn.org/task', mimeType: 'application/json' },
    ...(ctx.extensions ? { extensions: ctx.extensions } : {}),
    accepted: { scheme: 'exact', network: lane.network, amount: req.amount, asset: lane.asset, payTo: status.payTo, maxTimeoutSeconds: 300, extra: req.extra }
  };""", 'canonical exact accepted'),
    ("""      authorization: { from: a.from, to: a.to || status.payTo, value: str(a.value, lane.atomic),""",
     """      authorization: { from: a.from, to: a.to || status.payTo, value: str(a.value, req.amount),""", 'canonical exact value'),
    ("""    if (s.status >= 200 && s.status < 300 && txHash) return { ok: true, via: 'cdp', txHash: String(txHash), amount_usd: lane.usd, lane: laneKey };""",
     """    if (s.status >= 200 && s.status < 300 && txHash) return { ok: true, via: 'cdp', txHash: String(txHash), amount_usd: Number(built.requirements.amount) / 1e6, lane: laneKey };""", 'settle amount'),
], 'atomicOverride')

# ---------------- task-server.js: the llm task, per-task price everywhere a price is quoted ----------------
patch('task-server.js', [
    ("""  'prove': {
    path: '/prove',""", """  'llm': {
    path: '/llm',
    title: 'LLM chat completion (local RTX 5090 models first, hosted allowlist second)',
    buys: 'One chat completion, OpenAI message shape in, up to 1,024 output tokens. Local models run on the operator\\'s own GPU; hosted models come from an allowlist whose cost is a fraction of the price. The response names the provider and model that actually answered and the token counts. Not deterministic. No content is retained after the response is sent.',
    params: { model: 'optional: a local model (see /llm/models) or an allowlisted hosted id; default local', messages: 'OpenAI-shape array of {role, content}', prompt: 'alternative to messages: one user string', max_tokens: 'optional, 1-1024, default 512', temperature: 'optional, 0-2, default 0.2' },
    price_usd: Number(process.env.PRICE_LLM_USD || 0.02),
    deterministic: false,
    typical_ms: '400-8000'
  },
  'prove': {
    path: '/prove',""", 'catalog'),
    ("""  'prove': { input: { params: { sha256:""", """  'llm': { input: { params: { model: 'qwen2.5:7b', messages: [{ role: 'user', content: 'Summarise the x402 payment flow in three sentences.' }], max_tokens: 200 } }, schema: { model: { type: 'string' }, messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string', enum: ['system', 'user', 'assistant'] }, content: { type: 'string' } }, required: ['role', 'content'] } }, prompt: { type: 'string', maxLength: 24000 }, max_tokens: { type: 'integer', minimum: 1, maximum: 1024 }, temperature: { type: 'number', minimum: 0, maximum: 2 } }, output: { type: 'llm', provider: 'ollama-local', model: 'qwen2.5:7b', output: '<assistant text>', usage: { prompt_tokens: 42, completion_tokens: 88 }, finish_reason: 'stop' } },
  'prove': { input: { params: { sha256:""", 'bazaar example'),
    ("""async function runTask(taskName, params, ctx) {
  if (taskName === 'genesis-sim') return runGenesisSim(params);""",
     """async function runTask(taskName, params, ctx) {
  if (taskName === 'llm') { const r = await llm.run(params, ctx); return Object.assign({ type: 'llm' }, r); }
  if (taskName === 'genesis-sim') return runGenesisSim(params);""", 'runTask'),
    ("""const rails = require('./_ops_rails.cjs');""", """const rails = require('./_ops_rails.cjs');
const llm = require('./_ops_llm.cjs');""", 'require'),
    # challenge quotes the task's price
    ("""  const r = await rails.readiness();
  const accepts = rails.buildAccepts(r);
  if (!accepts.length) {
    alerts.alert('crit', 'x402 gate FAIL-CLOSED — no payable lane', {""",
     """  const r = await rails.readiness();
  const accepts = rails.buildAccepts(r, taskPrice(taskName));
  if (!accepts.length) {
    alerts.alert('crit', 'x402 gate FAIL-CLOSED — no payable lane', {""", 'challenge price'),
    # settlement carries the task's price
    ("""    const s = await rails.settleExact(payment, laneKey, { resourceUrl: PUBLIC_ORIGIN + CATALOG[taskName].path, extensions: bazaarExtension(taskName) });""",
     """    const s = await rails.settleExact(payment, laneKey, { resourceUrl: PUBLIC_ORIGIN + CATALOG[taskName].path, extensions: bazaarExtension(taskName), priceUsd: taskPrice(taskName) });""", 'settle price'),
    # well-known: per-service price + llm backends
    ("""        price: { usd: rails.PRICES.base_usdc_usd, note: 'per successful execution on base, polygon, solana or stellar (USDC); XRPL lane is ' + rails.PRICES.xrpl_xrp + ' XRP' }""",
     """        price: { usd: taskPrice(name), note: 'per successful execution on base, polygon or solana (USDC, this task\\'s price); pay-first lanes: stellar ' + lanesMod.STELLAR_PRICE + ' USDC, XRPL ' + rails.PRICES.xrpl_xrp + ' XRP flat' }""", 'well-known price'),
    ("""function bazaarExtension(taskName) {""", """function taskPrice(taskName) {
  const c = CATALOG[taskName];
  const p = c && Number(c.price_usd);
  return Number.isFinite(p) && p > 0 ? p : rails.PRICES.base_usdc_usd;
}
const lanesMod = require('./_ops_lanes.cjs');

function bazaarExtension(taskName) {""", 'taskPrice'),
], '_ops_llm')

# free route: /llm/models (what is served right now) — appended next to /prove/keys
p = os.path.join(HERE, 'task-server.js'); s = io.open(p, encoding='utf-8').read()
if "p === '/llm/models'" not in s:
    old = "  if (p === '/prove/keys') return send(res, 200, [prove.registryEntry()]);"
    assert s.count(old) == 1
    s = s.replace(old, old + "\n  if (p === '/llm/models') { const st = await llm.status(); return send(res, 200, Object.assign({ price_usd: taskPrice('llm'), max_output_tokens: llm.MAX_OUTPUT_TOKENS, max_input_chars: llm.MAX_INPUT_CHARS, note: 'local models run on the operator GPU; hosted models are an allowlist; the paid response names the one that answered' }, st)); }", 1)
    s = s.replace("free_endpoints: ['/health', '/.well-known/x402', '/prove/keys', '/prove/stats', '/prove/receipts/{receiptId}'],", "free_endpoints: ['/health', '/.well-known/x402', '/prove/keys', '/prove/stats', '/prove/receipts/{receiptId}', '/llm/models'],", 1)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s); print('task-server.js: /llm/models added')
