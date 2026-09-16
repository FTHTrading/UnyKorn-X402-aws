// Wallet / token / contract risk snapshot for the Genesis402 rail — the launch SKU.
//
// WHAT THE BUYER GETS: one structured, timestamped, reproducible snapshot of the public evidence about ONE EVM
// address on Base or Polygon, with every signal naming the dataset it came from and the URL it was fetched from.
// The verdict is a heuristic summary of those signals. It is not a KYC decision, not a finding about any person,
// and not investment, legal or tax advice. Absence from every list is not a clearance. Every one of those
// limitations is carried inside the paid response so it travels with the artifact.
//
// SOURCES (all public, all fetched at request time, none cached across buyers):
//   - Blockscout (base.blockscout.com / polygon.blockscout.com): address record, verified-source record for contracts,
//     token record + top holders for token contracts, recent transaction and token-transfer samples.
//   - blockchainfraud.org/api/registry: OFAC SDN digital-currency entries, community scam-address blocklists, and the
//     Blockchain Fraud case registry — the estate's own live screening worker.
// A source that cannot be reached is reported as a signal of severity "unavailable"; it never silently lowers the score.
const https = require('https');
const crypto = require('crypto');

const CHAINS = {
  base: { explorer: 'https://base.blockscout.com', caip2: 'eip155:8453', label: 'Base mainnet' },
  polygon: { explorer: 'https://polygon.blockscout.com', caip2: 'eip155:137', label: 'Polygon mainnet' }
};
const REGISTRY_ORIGIN = process.env.BF_REGISTRY_ORIGIN || 'https://blockchainfraud.org';
const TIMEOUT_MS = Number(process.env.RISK_SOURCE_TIMEOUT_MS || 9000);

function isEvmAddress(a) { return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a); }

function getJson(url, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const req = https.get(url, { timeout: timeoutMs || TIMEOUT_MS, headers: { accept: 'application/json', 'user-agent': 'genesis402-rail-risk/1.0 (+https://twin.unykorn.org)' } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; if (d.length > 2_000_000) { req.destroy(); finish({ ok: false, status: res.statusCode, error: 'body_too_large' }); } });
      res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) { /* not json */ } finish({ ok: res.statusCode >= 200 && res.statusCode < 300 && j !== null, status: res.statusCode, json: j }); });
    });
    req.on('error', (e) => finish({ ok: false, error: (e.message || 'error').slice(0, 120) }));
    req.on('timeout', () => { req.destroy(); finish({ ok: false, error: 'timeout' }); });
  });
}

/** Validate before any payment is verified, so a buyer is never charged for a request the rail would refuse. */
function validate(params) {
  const p = params || {};
  const chain = String(p.chain || 'base').toLowerCase();
  if (!CHAINS[chain]) return { ok: false, error: 'unsupported_chain', message: 'chain must be one of: ' + Object.keys(CHAINS).join(', '), supported: Object.keys(CHAINS) };
  const address = String(p.address || '').trim();
  if (!isEvmAddress(address)) return { ok: false, error: 'invalid_address', message: 'address must be a 0x-prefixed 40-hex EVM address' };
  return { ok: true, chain, address };
}

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

/** Deterministic JSON: sorted keys so the evidence hash is reproducible from the artifact alone. */
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

const SEVERITY_WEIGHT = { high: 30, warning: 12, info: 0, clear: 0, unavailable: 0 };

async function run(params, ctx) {
  const v = validate(params);
  if (!v.ok) { const e = new Error(v.error); e.userMessage = v.message; throw e; }
  const { chain, address } = v;
  const ex = CHAINS[chain];
  const lower = address.toLowerCase();
  const fetchedAt = new Date().toISOString();
  const signals = [];
  const sources = [];
  const push = (name, severity, evidence, extra) => signals.push(Object.assign({ name, severity, evidence }, extra || {}));

  const urls = {
    address: ex.explorer + '/api/v2/addresses/' + address,
    contract: ex.explorer + '/api/v2/smart-contracts/' + address,
    token: ex.explorer + '/api/v2/tokens/' + address,
    holders: ex.explorer + '/api?module=token&action=getTokenHolders&contractaddress=' + address + '&page=1&offset=10',
    txlist: ex.explorer + '/api?module=account&action=txlist&address=' + address + '&sort=desc&page=1&offset=50',
    tokentx: ex.explorer + '/api?module=account&action=tokentx&address=' + address + '&sort=desc&page=1&offset=50',
    registry: REGISTRY_ORIGIN + '/api/registry?q=' + encodeURIComponent(address)
  };

  // Round 1: the address record, activity samples and the screening registry in parallel.
  const [addr, txs, ttx, reg] = await Promise.all([getJson(urls.address), getJson(urls.txlist), getJson(urls.tokentx), getJson(urls.registry)]);
  sources.push({ name: 'blockscout_address', url: urls.address, ok: addr.ok, status: addr.status || null });
  sources.push({ name: 'blockscout_txlist', url: urls.txlist, ok: txs.ok, status: txs.status || null });
  sources.push({ name: 'blockscout_tokentx', url: urls.tokentx, ok: ttx.ok, status: ttx.status || null });
  sources.push({ name: 'blockchainfraud_registry', url: urls.registry, ok: reg.ok, status: reg.status || null });

  const subject = { chain, network: ex.caip2, address, kind: 'unknown' };

  // ---- screening (OFAC / blocklists / case registry) ----
  if (reg.ok && reg.json && Array.isArray(reg.json.subjects) && reg.json.subjects[0] && Array.isArray(reg.json.subjects[0].results)) {
    for (const r of reg.json.subjects[0].results) {
      const listed = String(r.status || '').toUpperCase() !== 'CLEAR';
      push('screen:' + String(r.source || 'list').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), listed ? 'high' : 'clear', String(r.summary || r.status || ''), { source: r.source, status: r.status });
    }
  } else {
    push('screen:registry', 'unavailable', 'Screening registry unreachable (status ' + (reg.status || reg.error || 'n/a') + '); sanctions and blocklist status NOT checked in this snapshot.');
  }

  // ---- address record ----
  let isContract = false;
  if (addr.ok && addr.json) {
    const a = addr.json;
    isContract = a.is_contract === true;
    subject.kind = isContract ? 'contract' : 'eoa';
    if (a.is_scam === true) push('explorer:scam_flag', 'high', 'Explorer marks this address as scam.', { source: 'Blockscout address record' });
    else push('explorer:scam_flag', 'clear', 'Explorer does not flag this address as scam.', { source: 'Blockscout address record' });
    const tags = [].concat(a.public_tags || [], a.private_tags || []).map((t) => t && (t.display_name || t.label || t.name)).filter(Boolean);
    if (tags.length) push('explorer:public_tags', 'info', 'Public tags: ' + tags.slice(0, 8).join(', '), { tags: tags.slice(0, 8) });
    if (a.name) subject.name = String(a.name).slice(0, 120);
    const coin = num(a.coin_balance);
    if (coin !== null) subject.native_balance = (coin / 1e18).toFixed(6);
  } else {
    push('explorer:address_record', 'unavailable', 'Explorer address record unreachable (status ' + (addr.status || addr.error || 'n/a') + ').');
  }

  // ---- activity sample (last 50 tx / token transfers) ----
  const txItems = (txs.ok && txs.json && Array.isArray(txs.json.result)) ? txs.json.result : null;
  const ttxItems = (ttx.ok && ttx.json && Array.isArray(ttx.json.result)) ? ttx.json.result : null;
  if (txItems || ttxItems) {
    const all = [].concat(txItems || [], ttxItems || []);
    const stamps = all.map((t) => num(t.timeStamp)).filter((n) => n !== null);
    const newest = stamps.length ? Math.max(...stamps) : null;
    const oldest = stamps.length ? Math.min(...stamps) : null;
    const counterparties = new Set();
    for (const t of all) { for (const k of ['from', 'to']) { const x = String(t[k] || '').toLowerCase(); if (x && x !== lower) counterparties.add(x); } }
    const activity = { transactions_sampled: txItems ? txItems.length : null, token_transfers_sampled: ttxItems ? ttxItems.length : null, unique_counterparties_in_sample: counterparties.size, newest_at: newest ? new Date(newest * 1000).toISOString() : null, oldest_in_sample_at: oldest ? new Date(oldest * 1000).toISOString() : null, sample_limit: 50 };
    subject.activity = activity;
    if (all.length === 0) push('activity:history', 'warning', 'No transactions or token transfers found on this chain; the address has no observable history here.');
    else {
      const ageDays = oldest ? (Date.now() / 1000 - oldest) / 86400 : null;
      if (ageDays !== null && ageDays < 7 && all.length < 50) push('activity:age', 'warning', 'Oldest observed activity is ' + ageDays.toFixed(1) + ' days old; short history.');
      else push('activity:age', 'info', 'Observed activity spans ' + (ageDays === null ? 'unknown' : ageDays.toFixed(0) + '+ days') + ' (sample of ' + all.length + ').');
      if (counterparties.size <= 2 && all.length >= 5) push('activity:counterparties', 'warning', 'Only ' + counterparties.size + ' unique counterparties across ' + all.length + ' sampled movements; concentrated flow.');
      else push('activity:counterparties', 'info', counterparties.size + ' unique counterparties in the sample.');
    }
  } else {
    push('activity:history', 'unavailable', 'Explorer activity endpoints unreachable; activity NOT assessed.');
  }

  // Round 2 (contracts only): verified source + token economics.
  if (isContract) {
    const [con, tok] = await Promise.all([getJson(urls.contract), getJson(urls.token)]);
    sources.push({ name: 'blockscout_smart_contract', url: urls.contract, ok: con.ok, status: con.status || null });
    sources.push({ name: 'blockscout_token', url: urls.token, ok: tok.ok, status: tok.status || null });
    if (con.ok && con.json) {
      const c = con.json;
      if (c.is_verified === true || c.is_fully_verified === true) push('contract:source_verification', 'clear', 'Source verified on explorer' + (c.name ? ' as ' + String(c.name).slice(0, 60) : '') + (c.verified_at ? ' (' + c.verified_at + ')' : '') + '.', { proxy_type: c.proxy_type || null, compiler: c.compiler_version || null });
      else push('contract:source_verification', 'warning', 'Source verification unavailable on explorer; bytecode cannot be read against published source.');
      if (c.proxy_type) push('contract:proxy', 'info', 'Upgradeable proxy pattern: ' + c.proxy_type + '. Logic can change under the same address.', { proxy_type: c.proxy_type });
    } else if (con.status === 404) {
      push('contract:source_verification', 'warning', 'No verified-source record on explorer.');
    } else {
      push('contract:source_verification', 'unavailable', 'Explorer contract record unreachable (status ' + (con.status || con.error || 'n/a') + ').');
    }
    if (tok.ok && tok.json && tok.json.type) {
      const t = tok.json;
      subject.kind = 'token_contract';
      subject.token = { name: t.name || null, symbol: t.symbol || null, type: t.type || null, decimals: num(t.decimals), holders_count: num(t.holders_count || t.holders), total_supply: t.total_supply || null };
      const holders = num(t.holders_count || t.holders);
      if (holders !== null && holders < 50) push('token:holder_count', 'warning', 'Only ' + holders + ' holders recorded.');
      else if (holders !== null) push('token:holder_count', 'info', holders + ' holders recorded.');
      const supply = t.total_supply ? Number(t.total_supply) : null;
      const hold = await getJson(urls.holders);
      sources.push({ name: 'blockscout_top_holders', url: urls.holders, ok: hold.ok, status: hold.status || null });
      if (hold.ok && hold.json && Array.isArray(hold.json.result) && supply && supply > 0) {
        const top = hold.json.result.slice(0, 10).map((h) => ({ address: h.address, share: Number(h.value) / supply }));
        const top10 = top.reduce((s, h) => s + (Number.isFinite(h.share) ? h.share : 0), 0);
        const top1 = top.length ? top[0].share : 0;
        subject.token.top10_share = Number((top10 * 100).toFixed(2));
        subject.token.top1_share = Number((top1 * 100).toFixed(2));
        if (top1 >= 0.5) push('token:liquidity_concentration', 'high', 'Largest holder controls ' + (top1 * 100).toFixed(1) + '% of supply.', { top1_pct: subject.token.top1_share, top10_pct: subject.token.top10_share });
        else if (top10 >= 0.7) push('token:liquidity_concentration', 'warning', 'Top 10 holders control ' + (top10 * 100).toFixed(1) + '% of supply.', { top1_pct: subject.token.top1_share, top10_pct: subject.token.top10_share });
        else push('token:liquidity_concentration', 'info', 'Top 10 holders control ' + (top10 * 100).toFixed(1) + '% of supply.', { top1_pct: subject.token.top1_share, top10_pct: subject.token.top10_share });
      } else {
        push('token:liquidity_concentration', 'unavailable', 'Holder distribution unreachable; concentration NOT assessed.');
      }
    }
  }

  // ---- score + verdict (heuristic, fully derivable from the signals above) ----
  let score = 0;
  for (const s of signals) score += SEVERITY_WEIGHT[s.severity] || 0;
  score = Math.min(100, score);
  const unavailable = signals.filter((s) => s.severity === 'unavailable').length;
  const assessed = signals.filter((s) => s.severity !== 'unavailable').length;
  let verdict;
  if (assessed === 0) verdict = 'not_scored';
  else if (signals.some((s) => s.severity === 'high' && s.name.startsWith('screen:'))) verdict = 'listed';
  else if (score >= 40) verdict = 'high_risk';
  else if (score >= 12) verdict = 'medium_risk';
  else verdict = 'low_risk';

  const body = {
    type: 'risk',
    request_id: 'risk_' + crypto.randomBytes(8).toString('hex'),
    subject,
    verdict,
    score: assessed === 0 ? null : score,
    scoring: { method: 'additive-heuristic-v1', weights: SEVERITY_WEIGHT, verdict_bands: { listed: 'any screening hit', high_risk: 'score >= 40', medium_risk: 'score >= 12', low_risk: 'score < 12', not_scored: 'no signal could be assessed' } },
    signals,
    coverage: { signals_assessed: assessed, signals_unavailable: unavailable },
    sources,
    generated_at: fetchedAt,
    labels: {
      mode: 'live',
      truth: ['OBSERVED: every signal is read from the named public source at request time', 'HEURISTIC: the score and verdict summarise those signals and nothing else'],
      limitations: [
        'Not a KYC/AML decision and not a finding about any person; a listing means the subject appears in the named dataset on its stated refresh date.',
        'Absence from every list is not a clearance.',
        'Not investment, legal or tax advice.',
        'Activity signals are computed from a sample of at most 50 recent transactions and 50 token transfers.',
        'A source marked unavailable was not assessed; it never lowers the score.'
      ]
    },
    payment: ctx && ctx.txHash ? { rail: ctx.rail, tx_hash: ctx.txHash } : undefined
  };
  body.evidence_hash = 'sha256:' + sha256(canonical({ subject: body.subject, verdict: body.verdict, score: body.score, signals: body.signals, sources: body.sources, generated_at: body.generated_at }));
  return body;
}

module.exports = { run, validate, CHAINS, canonical, sha256, isEvmAddress };
