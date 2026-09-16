// Replay ledger + receipts journal for the Genesis402 x402 rail.
//
// WHY A LEDGER: without it, one on-chain payment proof can be presented forever and
// buy unlimited executions. This is the consumed_tx_hashes pattern already proven in
// x402-credit-gateway, ported here. Keyed rail:tx_hash (lower-cased) so the same hash
// on a different rail is a different claim, matching UNIQUE(rail, tx_hash) semantics.
//
// ATOMICITY: Node is single-threaded and there is no await between the read and the
// write in claim(), so two concurrent requests cannot both see "unclaimed".
// There must only ever be ONE process writing this file.
//
// INTERNAL vs EXTERNAL: a sale paid from one of the operator's own wallets is a rail test, not demand.
// Every receipt carries `internal: true|false` from the payer address, and stats() reports the two
// populations separately so self-payments are never presented as customers. The journal itself is
// append-only; receipts written before payer capture existed are classified at read time from the
// tx hashes below (each verified on Blockscout as paid by the operator's Scout wallet), never rewritten.
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.GENESIS402_LEDGER
  || path.join(__dirname, 'data', 'genesis402-ledger.json');

// Operator-controlled payer addresses (lower-cased). Extend with INTERNAL_WALLETS="addr,addr" in the env.
const DEFAULT_INTERNAL = [
  '0x710cbd5b3ee298bb3e1fa9a231239ede615a7ab9', // Scout wallet (paid the 2026-09-13 rail tests)
  '0x69595cce62bd0d128d5760774406bb253ea97db1', // settlement twin
  '0x7d9a65d06dcc435a52d5880c6310bd6e96c156db', // EVM treasury
  'rsj3pggdh4vppedjfvre9yktcf9bwu6tdc',         // XRPL treasury
  'gbyla6vhx4uwifeec2kaojk57rukir2cko7tgvrdwmg2a3b2w4zhjepi', // Stellar treasury
  'fn9tc2scdfax2zpk5kkhhsv6l9gftva8lcuq1ajxlwy1' // Solana treasury
];
const INTERNAL_WALLETS = new Set(DEFAULT_INTERNAL.concat(String(process.env.INTERNAL_WALLETS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)));
// Receipts journaled before payer capture (2026-09-13), paid from the Scout wallet per base.blockscout.com.
const LEGACY_INTERNAL_TX = new Set([
  '0xc0804c4c7b0538', '0xd370ca346209cd', '0xba8fa7fe8ebf3a'
].map((s) => s.toLowerCase()));

function isInternalPayer(payer) {
  if (!payer) return null;
  return INTERNAL_WALLETS.has(String(payer).toLowerCase());
}

/** Classify a receipt: true (operator wallet), false (outside payer), null (payer unknown). */
function classify(r) {
  if (typeof r.internal === 'boolean') return r.internal;
  const byPayer = isInternalPayer(r.payer);
  if (byPayer !== null) return byPayer;
  const tx = String(r.tx_hash || '').toLowerCase();
  for (const prefix of LEGACY_INTERNAL_TX) if (tx.startsWith(prefix)) return true;
  return null;
}

function ensureDir() {
  const d = path.dirname(DB_PATH);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function load() {
  try {
    if (!fs.existsSync(DB_PATH)) return { consumed: {}, receipts: [] };
    const j = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return { consumed: j.consumed || {}, receipts: j.receipts || [] };
  } catch (e) {
    return { consumed: {}, receipts: [] };
  }
}

let db = load();

function persist() {
  ensureDir();
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH); // atomic replace, never a half-written ledger
}

function key(rail, txHash) {
  return String(rail).toLowerCase() + ':' + String(txHash).toLowerCase();
}

const STALE_MS = 10 * 60 * 1000;

/**
 * Claim a payment proof. Returns {ok:true} on first use.
 * Returns {ok:false, reason, consumedAt, receipt} if this proof was already spent.
 * A claim left 'pending' longer than STALE_MS is reclaimable, so a crash mid-delivery
 * does not permanently burn the payer's proof.
 */
function claim(rail, txHash, meta) {
  const k = key(rail, txHash);
  const existing = db.consumed[k];
  if (existing) {
    if (existing.state === 'pending' && Date.now() - existing.at > STALE_MS) {
      // stale in-flight claim — allow the payer to retry
    } else {
      return { ok: false, reason: 'tx_hash_already_consumed', consumedAt: new Date(existing.at).toISOString(), receipt: existing.receipt || null };
    }
  }
  db.consumed[k] = { state: 'pending', at: Date.now(), rail, txHash, meta: meta || null };
  persist();
  return { ok: true };
}

/** Delivery succeeded — burn the proof permanently and journal the sale. */
function commit(rail, txHash, receipt) {
  const k = key(rail, txHash);
  if (!db.consumed[k]) db.consumed[k] = { at: Date.now(), rail, txHash };
  db.consumed[k].state = 'consumed';
  db.consumed[k].receipt = receipt && receipt.receipt_id ? receipt.receipt_id : null;
  if (receipt) {
    if (typeof receipt.internal !== 'boolean') { const c = classify(receipt); if (c !== null) receipt.internal = c; }
    db.receipts.push(receipt);
    if (db.receipts.length > 5000) db.receipts = db.receipts.slice(-5000);
  }
  persist();
}

/** Delivery FAILED — release the claim so the payer is not charged for nothing. */
function release(rail, txHash) {
  const k = key(rail, txHash);
  if (db.consumed[k] && db.consumed[k].state === 'pending') {
    delete db.consumed[k];
    persist();
    return true;
  }
  return false;
}

function isConsumed(rail, txHash) {
  const e = db.consumed[key(rail, txHash)];
  return Boolean(e && e.state === 'consumed');
}

function stats() {
  const vals = Object.values(db.consumed);
  let gross = 0, grossExternal = 0, internal = 0, external = 0, unattributed = 0, lastExternalAt = null;
  for (const r of db.receipts) {
    const amt = Number(r.amount_usd) || 0;
    gross += amt;
    const c = classify(r);
    if (c === true) internal++;
    else if (c === false) { external++; grossExternal += amt; if (!lastExternalAt || r.at > lastExternalAt) lastExternalAt = r.at; }
    else unattributed++;
  }
  return {
    consumed_count: vals.filter((v) => v.state === 'consumed').length,
    pending_count: vals.filter((v) => v.state === 'pending').length,
    receipts: db.receipts.length,
    gross_usd: gross.toFixed(4),
    external_receipts: external,
    internal_receipts: internal,
    unattributed_receipts: unattributed,
    gross_external_usd: grossExternal.toFixed(4),
    last_external_at: lastExternalAt,
    note: 'internal = paid from an operator-controlled wallet (rail tests); external = paid by a wallet the operator does not control. Only external receipts are evidence of demand.'
  };
}

function recent(n) {
  return db.receipts.slice(-(n || 20)).reverse();
}

function shortAddr(a) {
  if (!a) return null;
  const s = String(a);
  return s.length > 14 ? s.slice(0, 6) + '…' + s.slice(-4) : s;
}

/** Sanitized receipt for the public feed: no request contents, payer shortened, provenance intact. */
function publicView(r) {
  const c = classify(r);
  return {
    receipt_id: r.receipt_id,
    at: r.at,
    task: r.task,
    rail: r.rail,
    amount_usd: r.amount_usd,
    tx_hash: r.tx_hash,
    settled_by: r.settled_by,
    payer: shortAddr(r.payer),
    payer_class: c === true ? 'internal (operator wallet - rail test, not demand)' : c === false ? 'external' : 'unattributed (pre-2026-09-16 receipt without payer capture)',
    request_class: r.request_class || r.task,
    result_sha256: r.result_sha256 || null,
    duration_ms: r.duration_ms
  };
}

function publicRecent(n) { return recent(n).map(publicView); }
function get(receiptId) { const r = db.receipts.find((x) => x.receipt_id === receiptId); return r ? publicView(r) : null; }

function reload() { db = load(); }

module.exports = { claim, commit, release, isConsumed, stats, recent, publicRecent, get, classify, isInternalPayer, reload, DB_PATH, INTERNAL_WALLETS };
