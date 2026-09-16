// Adversarial test suite for the Genesis402 rail. Run against a SCRATCH instance.
// Usage: set TEST_PORT=3199 && node _ops_adversarial_test.cjs
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = Number(process.env.TEST_PORT || 3199);
let pass = 0, fail = 0;

function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  <- ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

function req(method, p, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({
      host: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {},
        payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(d); } catch (e) { /* raw */ }
        resolve({ status: res.statusCode, json: j, raw: d, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function ledgerTests() {
  console.log('\n-- replay ledger (unit) --');
  const tmp = path.join(os.tmpdir(), 'g402-ledger-adv-' + Date.now() + '.json');
  process.env.GENESIS402_LEDGER = tmp;
  delete require.cache[require.resolve('./_ops_ledger.cjs')];
  const L = require('./_ops_ledger.cjs');
  const H = 'a'.repeat(64);

  check('first claim succeeds', L.claim('xrpl:xrp', H).ok === true);
  check('second claim on pending proof refused', L.claim('xrpl:xrp', H).ok === false);
  L.commit('xrpl:xrp', H, { receipt_id: 'r1', amount_usd: 0.05 });
  const again = L.claim('xrpl:xrp', H);
  check('consumed proof cannot be re-claimed', again.ok === false && again.reason === 'tx_hash_already_consumed', again);
  check('consumed proof names the receipt that spent it', again.receipt === 'r1', again);
  check('case-different hash is the SAME proof', L.claim('xrpl:xrp', H.toUpperCase()).ok === false);
  check('same hash on a DIFFERENT rail is allowed', L.claim('base:usdc', H).ok === true);
  check('isConsumed true for committed', L.isConsumed('xrpl:xrp', H) === true);
  check('isConsumed false for merely pending', L.isConsumed('base:usdc', H) === false);
  check('release frees a pending claim', L.release('base:usdc', H) === true);
  check('released proof is re-claimable', L.claim('base:usdc', H).ok === true);
  check('release does NOT free a consumed claim', L.release('xrpl:xrp', H) === false);
  const st = L.stats();
  check('stats count consumed sales only', st.consumed_count === 1 && st.receipts === 1, st);
  check('gross reflects the receipt amount', st.gross_usd === '0.0500', st);
  L.commit('base:usdc', H, { receipt_id: 'r2', amount_usd: 0.25 });
  check('gross accumulates across rails', L.stats().gross_usd === '0.3000', L.stats());
  try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
}

async function httpTests() {
  console.log('\n-- free surface --');
  const h = await req('GET', '/health');
  check('/health is free and 200', h.status === 200, h.status);
  check('/health declares replay protection', h.json && h.json.replay_protection && h.json.replay_protection.enabled === true);
  check('/health states fail-closed policy', Boolean(h.json && h.json.fail_closed));
  const d = await req('GET', '/.well-known/x402');
  check('/.well-known/x402 is free and 200 (was 404)', d.status === 200, d.status);
  check('discovery publishes terms', Boolean(d.json && d.json.terms && d.json.terms.unit_of_sale));
  const advertised = (d.json.accepts || []).map((a) => a.network + ':' + a.asset);
  const payable = h.json.payable_lanes || [];
  check('discovery advertises ONLY payable lanes', advertised.length === payable.length, { advertised, payable });
  check('Stellar lane is advertised only when payable', advertised.some((a) => /stellar/i.test(a)) === payable.includes('stellar:usdc'), { advertised, payable });
  for (const k of ['polygon:usdc', 'solana:usdc']) check(k + ' is advertised only when payable', advertised.some((a) => a.startsWith(k === 'polygon:usdc' ? 'eip155:137' : 'solana:')) === payable.includes(k), { advertised, payable });
  check('unpayable RLUSD lane is NOT advertised', !advertised.some((a) => /RLUSD/i.test(a)), advertised);

  console.log('\n-- destructive + internal endpoints removed --');
  const kill = await req('POST', '/task', {}, { type: 'site-shutdown', params: { target: 'all' } });
  check('site-shutdown is refused as unknown_task', kill.status === 400 && kill.json && kill.json.error === 'unknown_task', kill.json);
  await new Promise((r) => setTimeout(r, 1200));
  const alive = await req('GET', '/health');
  check('server SURVIVED the shutdown attempt', alive.status === 200, alive.status);
  for (const t of ['self-repair', 'fulfill-revenue', 'ai-reason', 'bridge-lock', 'enforce-prepay', 'register-agent']) {
    const r2 = await req('POST', '/task', {}, { type: t });
    check('paid surface rejects "' + t + '"', r2.status === 400 && r2.json.error === 'unknown_task', r2.json);
  }

  console.log('\n-- admin surface locked --');
  const ar = await req('GET', '/admin/receipts');
  check('/admin/receipts requires auth', ar.status === 401, ar.status);
  const lg = await req('GET', '/log');
  check('/log requires auth (was public, leaked internals)', lg.status === 401, lg.status);
  const bad = await req('GET', '/admin/receipts', { Authorization: 'Bearer wrong' });
  check('/admin/receipts rejects a wrong key', bad.status === 401, bad.status);
}

async function paymentTests() {
  console.log('\n-- payment gates --');
  const ch = await req('GET', '/task');
  check('unpaid GET returns 402 with a challenge', ch.status === 402 && ch.json.x402Version === 2, ch.status);
  check('402 states what the money buys', Boolean(ch.json.resource && ch.json.resource.what_you_get));
  check('Payment-Required header present', Boolean(ch.headers['payment-required']));

  // bogus XRPL proof must fail as an XRPL error, NOT as an unrelated OpenSSL error
  const bogus = await req('POST', '/task', { 'x-payment': JSON.stringify({ network: 'xrpl:mainnet', asset: 'XRP', txHash: '0'.repeat(64) }) }, { type: 'genesis-sim' });
  check('bogus XRPL proof is refused', bogus.status === 402 || bogus.status === 503, bogus.status);
  check('refusal names an XRPL reason (no cross-verifier fallthrough)', bogus.json && /xrpl/i.test(String(bogus.json.reason)), bogus.json);
  check('refusal does NOT leak an OpenSSL DECODER error', !/DECODER/i.test(bogus.raw), bogus.raw.slice(0, 160));

  // payer-supplied price must be ignored
  const cheap = await req('POST', '/task', { 'x-payment': JSON.stringify({ network: 'xrpl:mainnet', asset: 'XRP', txHash: '1'.repeat(64), price: '0.000001' }) }, { type: 'genesis-sim' });
  check('payer-supplied price does not buy access', cheap.status !== 200, cheap.status);
  check('required amount echoed is the SERVER price', !cheap.json || !cheap.json.required || cheap.json.required.amount === '0.05', cheap.json && cheap.json.required);

  // malformed payment header
  const junk = await req('POST', '/task', { 'x-payment': 'not-base64-not-json' }, { type: 'genesis-sim' });
  check('undecodable X-PAYMENT is a clean 400', junk.status === 400 && junk.json.error === 'x_payment_undecodable', junk.json);

  // Base lane: a bogus authorization must be refused cleanly with no funds moved.
  // When the lane is unpayable this is a 503 lane_unavailable; when it IS payable the
  // facilitator rejects the payload and we must return 402, never 200 and never a 500.
  const h2 = await req('GET', '/health');
  const basePayable = (h2.json.payable_lanes || []).includes('base:usdc');
  const baseTry = await req('POST', '/task', { 'x-payment': Buffer.from(JSON.stringify({ network: 'eip155:8453', payload: { authorization: { from: '0x' + '1'.repeat(40), to: '0x' + '2'.repeat(40), value: '250000', nonce: '0x' + '3'.repeat(64) }, signature: '0x' + '4'.repeat(130) } })).toString('base64') }, { type: 'genesis-sim' });
  if (basePayable) {
    check('payable Base lane refuses a bogus authorization with 402', baseTry.status === 402, { s: baseTry.status, j: baseTry.json });
    check('refusal is settlement_failed, not a 200 and not a 500', baseTry.json && baseTry.json.error === 'settlement_failed', baseTry.json);
    check('refusal states no funds moved', baseTry.json && /no funds moved|nothing was delivered/i.test(baseTry.json.message), baseTry.json);
    check('bogus authorization did NOT consume ledger state', (await req('GET', '/health')).json.replay_protection.ledger.consumed_count === h2.json.replay_protection.ledger.consumed_count);
  } else {
    check('unpayable Base lane returns 503 lane_unavailable', baseTry.status === 503 && baseTry.json.error === 'lane_unavailable', { s: baseTry.status, j: baseTry.json });
    check('503 says nothing was charged', baseTry.json && /nothing was charged/i.test(baseTry.json.message), baseTry.json);
  }

  console.log('\n-- launch SKU: /risk --');
  const rc = await req('GET', '/risk');
  check('/risk without payment is a 402 challenge', rc.status === 402, rc.status);
  check('challenge names the risk resource and a price', rc.json && JSON.stringify(rc.json).includes('/risk') && Array.isArray(rc.json.accepts), rc.json && Object.keys(rc.json));
  const badAddr = await req('POST', '/risk', {}, { params: { address: 'not-an-address' } });
  check('bad address is refused with 400 BEFORE any payment is read', badAddr.status === 400 && badAddr.json.error === 'invalid_address' && /nothing was charged/.test(badAddr.json.message), badAddr.json);
  const badChain = await req('POST', '/risk', {}, { params: { address: '0x' + 'a'.repeat(40), chain: 'solana' } });
  check('unsupported chain is refused with 400 and lists supported chains', badChain.status === 400 && badChain.json.error === 'unsupported_chain' && Array.isArray(badChain.json.supported_chains), badChain.json);
  const goodNoPay = await req('POST', '/risk', {}, { params: { address: '0x' + 'a'.repeat(40), chain: 'base' } });
  check('valid params without payment still get the 402 challenge', goodNoPay.status === 402, goodNoPay.status);
  const disc = await req('GET', '/.well-known/x402');
  const riskSvc = disc.json && disc.json.services.find((x) => x.name === 'risk');
  check('discovery lists risk with price and address parameter', riskSvc && riskSvc.price && riskSvc.price.usd > 0 && /address/.test(JSON.stringify(riskSvc.parameters)), riskSvc);
  check('discovery names the launch SKU', disc.json && disc.json.launch_sku && disc.json.launch_sku.name === 'risk', disc.json && disc.json.launch_sku);
  check('risk copy carries its limitations (not advice, not a clearance)', riskSvc && /not advice/i.test(riskSvc.what_you_get) && /not a clearance/i.test(riskSvc.what_you_get));

  console.log('\n-- zero-cost discovery surfaces --');
  const card = await req('GET', '/.well-known/agent.json');
  check('agent card lists every paid task as a skill with a price', card.status === 200 && Array.isArray(card.json.skills) && card.json.skills.length === disc.json.services.length && card.json.skills.every((s) => s.price && s.price.usd > 0), card.status);
  const oa = await req('GET', '/openapi.json');
  check('openapi describes /risk with a 402 and a 400-before-payment response', oa.status === 200 && oa.json.paths['/risk'] && oa.json.paths['/risk'].post.responses['402'] && oa.json.paths['/risk'].post.responses['400'], oa.status);
  const lt = await req('GET', '/llms.txt');
  check('llms.txt is plain text and names the receipts feed', lt.status === 200 && /text\/plain/.test(lt.headers['content-type']) && /\/receipts/.test(lt.raw) && /investment, legal or tax advice/.test(lt.raw), lt.status);

  console.log('\n-- public receipts feed --');
  const rcp = await req('GET', '/receipts');
  check('/receipts is free and returns stats + receipts', rcp.status === 200 && rcp.json.stats && Array.isArray(rcp.json.receipts), rcp.status);
  check('stats split internal from external receipts', typeof rcp.json.stats.external_receipts === 'number' && typeof rcp.json.stats.internal_receipts === 'number' && typeof rcp.json.stats.gross_external_usd === 'string', rcp.json.stats);
  check('stats state that only external receipts are evidence of demand', /only external receipts are evidence of demand/i.test(rcp.json.stats.note || ''));
  const rmiss = await req('GET', '/receipts/g402-doesnotexist');
  check('unknown receipt id 404s', rmiss.status === 404 && rmiss.json.error === 'receipt_not_found', rmiss.status);
  const h3 = await req('GET', '/health');
  check('/health ledger stats carry the internal/external split', h3.json.replay_protection.ledger.external_receipts !== undefined, h3.json.replay_protection.ledger);

  console.log('\n-- risk module (direct) --');
  const risk = require('./_ops_risk.cjs');
  check('validate refuses a malformed address', risk.validate({ address: '0x123' }).ok === false);
  check('validate refuses an unsupported chain', risk.validate({ address: '0x' + 'b'.repeat(40), chain: 'tron' }).ok === false);
  check('validate defaults to base', risk.validate({ address: '0x' + 'b'.repeat(40) }).chain === 'base');
  check('canonical JSON is key-order independent', risk.canonical({ b: 1, a: [2, { d: 3, c: 4 }] }) === risk.canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
  const ledgerMod = require('./_ops_ledger.cjs');
  check('operator Scout wallet classifies as internal', ledgerMod.isInternalPayer('0x710CBD5B3EE298BB3E1FA9A231239EDE615A7AB9') === true);
  check('a foreign wallet classifies as external', ledgerMod.isInternalPayer('0x' + 'c'.repeat(40)) === false);
  check('unknown payer classifies as null, never external', ledgerMod.isInternalPayer(null) === null);
  const rsrc = fs.readFileSync(path.join(__dirname, '_ops_risk.cjs'), 'utf8');
  check('an unavailable source never lowers the score', /unavailable:\s*0/.test(rsrc));
  check('risk response carries limitations in-band', /Absence from every list is not a clearance/.test(rsrc) && /not investment, legal or tax advice/i.test(rsrc));

  console.log('\n-- routing --');
  const nf = await req('GET', '/totally-made-up');
  check('unknown path 404s and lists the free endpoints', nf.status === 404 && Array.isArray(nf.json.free), nf.status);
  const m = await req('DELETE', '/task');
  check('unsupported method is 405', m.status === 405, m.status);
  const unk = await req('POST', '/task', {}, { type: 'definitely-not-a-task' });
  check('unknown task lists the supported set', unk.status === 400 && Array.isArray(unk.json.supported), unk.json);
}

function taskTruthTests() {
  console.log('\n-- task honesty (direct) --');
  // rwa-screen must refuse an uncovered market rather than silently returning Texas
  delete require.cache[require.resolve('./_ops_rails.cjs')];
  const src = fs.readFileSync(path.join(__dirname, 'task-server.new.js'), 'utf8');
  check('no silent market substitution left in source', !/markets\[market\]\s*\|\|\s*markets\.texas/.test(src));
  check('site-shutdown implementation is gone from source', !/process\.exit\(0\)[\s\S]{0,80}shutdown/i.test(src) && !/siteShutdown/.test(src));
  check('no hardcoded balance dict left in wallet-ops', !/usdf_issuer/.test(src));
  check('no fake tx minting left in source', !/x402-real-\$\{/.test(src) && !/'x402-real-'/.test(src));
  check('server never reads price from the payer', !/parsedPayment\.price/.test(src));
  const rsrc = fs.readFileSync(path.join(__dirname, '_ops_rails.cjs'), 'utf8');
  check('facilitator is called over https, not http', !/http\.request\([\s\S]{0,120}cdp\.coinbase/.test(rsrc) && /hostname: 'api\.cdp\.coinbase\.com', port: 443/.test(rsrc));
  check('settle endpoint is actually called', /x402\/settle/.test(rsrc));
  check('rails enforce a server-side price table', /PRICES\s*=\s*\{/.test(rsrc));
}

(async () => {
  console.log('Genesis402 adversarial suite — target 127.0.0.1:' + PORT);
  ledgerTests();
  try {
    await httpTests();
    await paymentTests();
  } catch (e) {
    console.log('  HTTP tests aborted: ' + e.message);
    fail++;
  }
  taskTruthTests();
  console.log('\n================================');
  console.log('  PASS ' + pass + '   FAIL ' + fail);
  console.log('================================');
  process.exit(fail === 0 ? 0 : 1);
})();
