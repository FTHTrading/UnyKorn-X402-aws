# The rail becomes the estate's facilitator: /facilitator/{supported,verify,settle} on task-server, bearer-gated,
# forwarding to the CDP facilitator with the rail's own JWT. The CDP credential never leaves this process.
# Bearer = FACILITATOR_BEARER env, else the file ~/.unykorn/secrets/facilitator-proxy.key (read at boot, never logged).
# Also opens the three paths in site-server.js and edge-router-3000.js. Idempotent (marker: /facilitator/).
import io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
EDGE = os.path.join(HERE, '..', 'x402-agent-ecosystem', 'edge-router-3000.js')

def patch(path, edits, marker):
    s = io.open(path, encoding='utf-8').read()
    if marker in s:
        print(os.path.basename(path), 'already patched'); return
    for old, new, label in edits:
        assert s.count(old) == 1, os.path.basename(path) + ' anchor: ' + label + ' (count=%d)' % s.count(old)
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print(os.path.basename(path), 'patched')

patch(os.path.join(HERE, 'task-server.js'), [
    ("""const llm = require('./_ops_llm.cjs');""", """const llm = require('./_ops_llm.cjs');
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
}""", 'bearer'),
    ("""  if (p === '/llm/models') {""", """  // ---------- facilitator proxy (bearer): the estate settles on Base/Polygon/Solana through this process's CDP key ----------
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
  if (p === '/llm/models') {""", 'routes'),
], '/facilitator/')

patch(os.path.join(HERE, 'site-server.js'), [
    ("""  if (url.pathname === '/llm' || url.pathname.startsWith('/llm/') || """,
     """  if (url.pathname.startsWith('/facilitator/') || url.pathname === '/llm' || url.pathname.startsWith('/llm/') || """, 'proxy'),
], "startsWith('/facilitator/')")

patch(EDGE, [
    ("""'/prove', '/llm', '/llm/models',""", """'/prove', '/llm', '/llm/models', '/facilitator/supported', '/facilitator/verify', '/facilitator/settle',""", 'allowlist'),
], '/facilitator/supported')
