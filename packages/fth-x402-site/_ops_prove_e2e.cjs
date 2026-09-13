'use strict';
// End-to-end delivery test for the paid /prove task WITHOUT spending USDC.
// Boots the real task server on a test port with settlement and the replay ledger stubbed in-process,
// sends a real x402 request + X-PAYMENT header, and verifies the returned receipt offline with the open
// verifier. Everything else (dispatch, catalog, claim/commit ordering, prove issuance, signing, chaining)
// is the production code path. Production ledgers are untouched: PROVE_DIR and the replay ledger are stubs.
//   node _ops_prove_e2e.cjs
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'g402-prove-e2e-'));
process.env.PROVE_DIR = tmp;
process.env.TASK_SERVER_PORT = process.env.TEST_PORT || '3199';
process.env.ADMIN_KEY = 'e2e-admin';

// ---- stubs: settlement + replay ledger (in-process, before the server loads them) ----
const rails = require('./_ops_rails.cjs');
const ledger = require('./_ops_ledger.cjs');
const TX = '0x' + 'e2e0'.repeat(16);
rails.readiness = async () => ({ any_payable: true, payable_lanes: ['base:usdc'], lanes: { 'base:usdc': { payable: true, settle_via: 'stub', payTo: rails.payToEvm(), price_usd: rails.PRICES.base_usdc_usd }, 'xrpl:xrp': { payable: false, reason: 'stub' }, 'xrpl:rlusd': { payable: false, reason: 'stub' }, 'stellar:usdc': { payable: false, reason: 'stub' } }, cdp: { ok: true }, relayer: { ok: false, reason: 'stub' }, checked_at: new Date().toISOString() });
rails.settleBase = async () => ({ ok: true, txHash: TX, amount_usd: rails.PRICES.base_usdc_usd, via: 'e2e-stub' });
const mem = new Map();
ledger.claim = (rail, tx) => (mem.has(rail + tx) ? { ok: false, consumedAt: mem.get(rail + tx).at, receipt: mem.get(rail + tx).receipt } : (mem.set(rail + tx, { at: new Date().toISOString() }), { ok: true }));
ledger.commit = (rail, tx, receipt) => { mem.set(rail + tx, { at: new Date().toISOString(), receipt }); };
ledger.release = () => {};
ledger.stats = () => ({ consumed_count: mem.size, pending_count: 0, receipts: mem.size, gross_usd: (mem.size * 0.25).toFixed(4) });
ledger.recent = () => [];

require('./task-server.js');   // boots on TASK_SERVER_PORT with the stubs above

function req(method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: Number(process.env.TASK_SERVER_PORT), path: p, method, headers: { 'content-type': 'application/json', ...(headers || {}) } }, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) { j = d; } resolve({ status: res.statusCode, body: j }); }); });
    r.on('error', reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
const fail = (m) => { console.error('FAIL', m); process.exit(1); };

setTimeout(async () => {
  const digest = require('crypto').createHash('sha256').update('invoice 1042').digest('hex');
  const params = { params: { sha256: digest, claim: 'invoice 1042 existed before the dispute', subject: 'invoice-1042' } };
  const challenge = await req('POST', '/prove', params);
  if (challenge.status !== 402 || !challenge.body.accepts) fail('expected 402 challenge, got ' + challenge.status);
  console.log('1. unpaid POST /prove -> 402, price', challenge.body.accepts[0].amount || challenge.body.accepts[0].maxAmountRequired, 'atomic to', challenge.body.accepts[0].payTo);

  const xp = Buffer.from(JSON.stringify({ x402Version: 2, scheme: 'exact', network: 'eip155:8453', payload: { signature: '0x' + '11'.repeat(65), authorization: { from: '0x' + '22'.repeat(20), to: rails.payToEvm(), value: '250000', validAfter: '0', validBefore: String(Math.floor(Date.now() / 1000) + 600), nonce: '0x' + '33'.repeat(32) } } })).toString('base64');
  const paid = await req('POST', '/prove', params, { 'X-PAYMENT': xp });
  if (paid.status !== 200) fail('paid call returned ' + paid.status + ' ' + JSON.stringify(paid.body).slice(0, 300));
  const out = paid.body;
  const rc = out.proofReceipt;
  if (!rc || rc.receiptVersion !== 'genesis402-receipt-v1') fail('no proofReceipt (receipt-v1) in response: ' + JSON.stringify(out).slice(0, 300));
  if (!out.receipt || !out.receipt.tx_hash || !out.receipt.receipt_id) fail('rail payment receipt missing from response');
  console.log('2. paid POST /prove -> 200, rail receipt', out.receipt && out.receipt.receipt_id, '| proof receipt', rc.receiptId, rc.truthLabels, 'bound tx', rc.body.txHash === TX ? 'MATCHES payment' : 'MISMATCH');

  const replay = await req('POST', '/prove', params, { 'X-PAYMENT': xp });
  if (replay.status !== 409) fail('replayed proof should be 409, got ' + replay.status);
  console.log('3. same X-PAYMENT again -> 409 (one payment, one execution)');

  const look = await req('GET', '/prove/receipts/' + rc.receiptId);
  if (look.status !== 200 || look.body.receipt.receiptId !== rc.receiptId) fail('lookup failed');
  const keys = await req('GET', '/prove/keys');
  console.log('4. free lookup /prove/receipts/{id} -> 200; /prove/keys ->', keys.body[0].keyId);

  fs.writeFileSync(path.join(tmp, 'receipt.json'), JSON.stringify(rc)); fs.writeFileSync(path.join(tmp, 'keys.json'), JSON.stringify(keys.body));
  const verifier = path.join(process.env.USERPROFILE || 'C:\\Users\\Kevan', 'unykorn-control', 'packages', 'g402-verify', 'bin', 'g402-verify.ts');
  const v = JSON.parse(execFileSync(process.execPath, [verifier, 'receipt', path.join(tmp, 'receipt.json'), '--keys', path.join(tmp, 'keys.json'), '--json'], { encoding: 'utf8' }));
  if (v.overallStatus !== 'VALID_WITH_LIMITATIONS' || v.checks.signature !== 'VALID') fail('offline verify failed ' + JSON.stringify(v.findings));
  console.log('5. offline verify with @genesis402/verify ->', v.overallStatus, '| signature', v.checks.signature, '| leaf', v.checks.leafHash, '| inclusion', v.checks.inclusionProof, '| lifecycle', v.lifecycle);

  const stats = await req('GET', '/prove/stats');
  console.log('6. /prove/stats on test instance ->', JSON.stringify(stats.body).slice(0, 120));
  console.log('DELIVERY E2E: PASS (settlement stubbed; production ledgers untouched; temp dir ' + tmp + ')');
  process.exit(0);
}, 1500);
