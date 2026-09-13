'use strict';
// PAID PROOF RECEIPTS on the live rail. An agent pays, submits bytes-as-text or a SHA-256 it computed,
// and gets back a genesis402-receipt-v1: Ed25519-signed by this rail's issuer key, chained to the
// previous receipt, sealed as an RFC 6962 leaf, bound to the payment tx. Verifiable offline with
// @genesis402/verify (github.com/FTHTrading/402-truth). No deps beyond node:crypto.
//
// Honesty rules (spec/genesis402-receipt-v1): text the rail hashed itself is OBSERVED; a hash the payer
// supplied is ATTESTED (by the payer). VERIFIED covers the deterministic checks the rail ran. Never
// CONFIRMED (nothing external corroborates the claim itself), never ANCHORED (no external anchor yet).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, 'data', 'prove');
const KEY_FILE = path.join(DIR, 'issuer.key.pem');
const PUB_FILE = path.join(DIR, 'issuer.pub.pem');
const LEDGER = path.join(DIR, 'ledger.jsonl');
const RECEIPT_VERSION = 'genesis402-receipt-v1';
const STANDARD_LIMITATIONS = [
  'Authorized does not mean universally right. Refused does not mean universally wrong. Each receipt reports an outcome under a declared scope, evidence state, policy version, and time.',
  'This receipt does not establish universal truth, legal compliance, ownership, or the correctness of third-party content.',
  'This receipt is valid only for the declared subject, policy, time window, and evidence set.',
  'Not a legal opinion or guarantee.'
];
const MAX_TEXT = 16 * 1024;

function canonicalize(v) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'bigint') return JSON.stringify(v.toString());
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : canonicalize(x))).join(',') + ']';
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
}
const sha256 = (d) => crypto.createHash('sha256').update(d).digest();
const hashCanonical = (o) => 'sha256:' + sha256(canonicalize(o)).toString('hex');
const leafHash = (s) => sha256(Buffer.concat([Buffer.from([0]), Buffer.from(s)]));

let issuer = null;
function loadIssuer() {
  if (issuer) return issuer;
  fs.mkdirSync(DIR, { recursive: true });
  let priv, pub;
  if (fs.existsSync(KEY_FILE)) { priv = crypto.createPrivateKey(fs.readFileSync(KEY_FILE, 'utf8')); pub = crypto.createPublicKey(priv); }
  else {
    const kp = crypto.generateKeyPairSync('ed25519'); priv = kp.privateKey; pub = kp.publicKey;
    fs.writeFileSync(KEY_FILE, priv.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    fs.writeFileSync(PUB_FILE, pub.export({ type: 'spki', format: 'pem' }));
  }
  const der = pub.export({ type: 'spki', format: 'der' });
  issuer = { priv, keyId: 'g402-key-' + sha256(der).toString('hex').slice(0, 16), publicKeyPem: pub.export({ type: 'spki', format: 'pem' }), publicKeyHex: der.subarray(der.length - 32).toString('hex'), createdAt: fs.statSync(KEY_FILE).birthtime.toISOString() };
  return issuer;
}
function registryEntry() { const i = loadIssuer(); return { keyId: i.keyId, alg: 'ed25519', issuer: 'genesis402-rail', publicKeyPem: i.publicKeyPem, publicKeyHex: i.publicKeyHex, createdAt: i.createdAt, status: 'active' }; }

function head() {
  if (!fs.existsSync(LEDGER)) return { seq: 0, hash: 'sha256:' + '0'.repeat(64) };
  const lines = fs.readFileSync(LEDGER, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { seq: 0, hash: 'sha256:' + '0'.repeat(64) };
  const last = JSON.parse(lines[lines.length - 1]);
  return { seq: last.workflow.sequence, hash: last.integrity.canonicalBodyHash };
}

/**
 * @param {object} params  { text?: string (<=16KB, hashed here), sha256?: 64hex (payer-computed), claim?: string, subject?: string }
 * @param {object} ctx     { rail, txHash, amountUsd }  — the settled payment this receipt is bound to
 */
function prove(params, ctx) {
  const i = loadIssuer();
  const p = params || {};
  let digest, labels, statement, evidenceClass;
  if (typeof p.text === 'string' && p.text.length) {
    if (Buffer.byteLength(p.text, 'utf8') > MAX_TEXT) { const e = new Error('text_too_large'); e.userMessage = 'text must be <= 16 KiB; submit sha256 instead'; throw e; }
    digest = sha256(Buffer.from(p.text, 'utf8')).toString('hex');
    labels = ['OBSERVED', 'VERIFIED']; evidenceClass = 'HASH_ONLY';
    statement = 'The rail hashed ' + Buffer.byteLength(p.text, 'utf8') + ' bytes supplied by the payer at ' + new Date().toISOString() + ' and observed SHA-256 ' + digest + '. The bytes are not stored.';
  } else if (typeof p.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(p.sha256)) {
    digest = p.sha256.toLowerCase();
    labels = ['ATTESTED', 'VERIFIED']; evidenceClass = 'HASH_ONLY';
    statement = 'The payer attested SHA-256 ' + digest + ' at ' + new Date().toISOString() + '. The rail verified the digest format and recorded the attestation; it did not see the bytes.';
  } else { const e = new Error('bad_params'); e.userMessage = 'provide text (<=16 KiB) or sha256 (64 hex)'; throw e; }
  const claim = typeof p.claim === 'string' ? p.claim.slice(0, 512) : null;
  const subject = typeof p.subject === 'string' ? p.subject.slice(0, 200) : digest;
  const h = head();
  const rid = 'g402_rcpt_' + crypto.randomBytes(6).toString('hex');
  const issuedAt = new Date().toISOString();
  const env = {
    receiptVersion: RECEIPT_VERSION, receiptId: rid, kind: labels[0] === 'OBSERVED' ? 'prove.observed' : 'prove.attested', mode: 'LIVE',
    truthLabels: labels,
    workflow: { id: 'rail-prove', stateMachineId: 'x402-payment-delivery', stateMachineVersion: '1.0.0', sequence: h.seq + 1, previousReceiptHash: h.hash },
    subject: { type: 'digest', id: subject },
    claim: { scope: 'The SHA-256 digest above, the payer\'s optional claim text as submitted, and the payment that bought this receipt. Nothing else.', statement, limitations: [
      claim ? 'The claim text is the payer\'s assertion, reproduced verbatim and not evaluated.' : 'No claim text was submitted.',
      'The rail does not know what the bytes are, who owns them, or whether they are authentic.',
      ...STANDARD_LIMITATIONS] },
    evidence: { root: 'sha256:' + digest, count: 1, classification: evidenceClass },
    policy: null,
    decision: { outcome: 'ISSUED', reasonCodes: [labels[0] === 'OBSERVED' ? 'EVIDENCE.BYTES.HASHED' : 'EVIDENCE.DIGEST.ATTESTED', 'PAYMENT.RAIL.SETTLED'] },
    binding: { requestHash: hashCanonical({ sha256: digest, claim, subject }), responseHash: null, nonce: ctx && ctx.txHash ? String(ctx.txHash).toLowerCase() : null },
    body: { sha256: digest, claim, payment: ctx ? { rail: ctx.rail, txHash: ctx.txHash, amountUsd: ctx.amountUsd } : null, txHash: ctx ? ctx.txHash : null },
    lifecycle: { statusAtIssuance: 'ACTIVE', issuedAt, expiresAt: null, revocationStatusAtIssuance: 'NOT_REVOKED' },
    issuer: { id: 'genesis402-rail', keyId: i.keyId, alg: 'ed25519', signature: null }
  };
  const signable = { ...env }; signable.issuer = { ...env.issuer }; delete signable.issuer.signature;
  const cbh = hashCanonical(signable);
  env.issuer.signature = crypto.sign(null, Buffer.from(cbh.slice(7), 'hex'), i.priv).toString('hex');
  const leaf = leafHash(canonicalize(env)).toString('hex');
  // Each receipt is sealed on issue as a one-leaf segment: root == leaf, proof []. Stated plainly.
  env.integrity = { canonicalBodyHash: cbh, leafHash: leaf, segmentRoot: leaf, inclusionProof: [], segmentId: 'seg_' + rid.slice(10), leafIndex: 0, segmentNote: 'one-leaf segment sealed at issue; root equals leaf; not externally anchored' };
  fs.appendFileSync(LEDGER, JSON.stringify(env) + '\n');
  return {
    type: 'prove', receipt: env,
    verify: { how: 'offline with @genesis402/verify', keys: '/prove/keys', lookup: '/prove/receipts/' + rid, source: 'https://github.com/FTHTrading/402-truth' },
    truthLabels: labels, mode: 'LIVE', anchor: 'UNANCHORED',
    companionRule: STANDARD_LIMITATIONS[0]
  };
}

function get(rid) {
  if (!/^g402_rcpt_[0-9a-f]{12}$/.test(rid) || !fs.existsSync(LEDGER)) return null;
  for (const line of fs.readFileSync(LEDGER, 'utf8').split(/\r?\n/)) { if (line.includes('"' + rid + '"')) { const r = JSON.parse(line); if (r.receiptId === rid) return r; } }
  return null;
}
function stats() { if (!fs.existsSync(LEDGER)) return { receipts: 0 }; const n = fs.readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean).length; return { receipts: n, head: head() }; }

module.exports = { prove, get, stats, registryEntry, loadIssuer };
