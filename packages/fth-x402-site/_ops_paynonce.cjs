// Pay-first binding for XRPL and Stellar lanes.
//
// Problem it closes: a pay-first proof used to be only a tx hash. Anyone watching the public ledger could
// present someone else's payment first, and any unrelated incoming payment could be redeemed for work.
//
// Scheme: each 402 carries a fresh nonce N (only the requester sees it, over TLS). The payer puts
// sha256(N) in the payment memo and later presents N with the tx hash. An observer sees only the hash,
// so it cannot produce N. N is stateless: ts.rand.hmac(key, ts|rand|task), so it cannot be forged,
// is bound to one task, and expires. The replay ledger still stops the same tx being used twice.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_AGE_SEC = Number(process.env.PAY_NONCE_MAX_AGE_SEC || 1800);
const SKEW_SEC = 120;

function loadKey() {
  if (process.env.PAY_NONCE_KEY) return Buffer.from(process.env.PAY_NONCE_KEY, 'hex');
  const f = process.env.PAY_NONCE_KEY_FILE || path.join(os.homedir(), '.unykorn', 'secrets', 'pay-nonce.key');
  try { return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex'); } catch (e) { /* create below */ }
  const k = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, k, { mode: 0o600 });
  return Buffer.from(k, 'hex');
}
const KEY = loadKey();

const mac = (ts, rnd, task) => crypto.createHmac('sha256', KEY).update(ts + '|' + rnd + '|' + task).digest('hex').slice(0, 32);
const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function issue(task) {
  const ts = Math.floor(Date.now() / 1000);
  const rnd = crypto.randomBytes(12).toString('hex');
  const nonce = ts + '.' + rnd + '.' + mac(ts, rnd, task);
  return { nonce, memo_sha256: sha256hex(nonce), expires_at: ts + MAX_AGE_SEC };
}

/** Validates the nonce itself (format, HMAC, task, age). lanePrefix names the reason codes. */
function check(nonce, task, lanePrefix) {
  const p = lanePrefix || 'payfirst';
  if (!nonce || typeof nonce !== 'string') return { ok: false, reason: p + '_nonce_missing' };
  const parts = nonce.split('.');
  if (parts.length !== 3 || !/^\d{10}$/.test(parts[0]) || !/^[0-9a-f]{24}$/.test(parts[1]) || !/^[0-9a-f]{32}$/.test(parts[2])) return { ok: false, reason: p + '_nonce_malformed' };
  const ts = Number(parts[0]);
  const want = Buffer.from(mac(ts, parts[1], task), 'hex');
  const got = Buffer.from(parts[2], 'hex');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { ok: false, reason: p + '_nonce_invalid_for_this_task' };
  const now = Math.floor(Date.now() / 1000);
  if (ts > now + SKEW_SEC) return { ok: false, reason: p + '_nonce_from_future' };
  if (now - ts > MAX_AGE_SEC) return { ok: false, reason: p + '_nonce_expired' };
  return { ok: true, ts, memo_sha256: sha256hex(nonce) };
}

/** After on-chain verification: the tx must carry sha256(nonce) in a memo and be sent after the nonce was issued. */
function bind(nonceCheck, memos, txTime, lanePrefix) {
  const p = lanePrefix || 'payfirst';
  const want = nonceCheck.memo_sha256.toLowerCase();
  if (!(memos || []).some((m) => String(m).toLowerCase() === want)) return { ok: false, reason: p + '_memo_missing_or_mismatch' };
  if (!txTime || txTime < nonceCheck.ts - SKEW_SEC) return { ok: false, reason: p + '_tx_predates_challenge' };
  return { ok: true };
}

function instructions(network) {
  return network === 'stellar:pubnet'
    ? 'Send the payment with memo type HASH = memo_sha256 (32 bytes hex). Then present X-PAYMENT {"network":"stellar:pubnet","txHash":"<hex>","nonce":"<nonce>"}.'
    : 'Send the payment with a Memo whose MemoData = memo_sha256 (hex). Then present X-PAYMENT {"network":"xrpl:mainnet","txHash":"<hex>","nonce":"<nonce>"}.';
}

module.exports = { issue, check, bind, instructions, sha256hex, MAX_AGE_SEC };
