// Telegram alerting for the Genesis402 x402 rail.
// Never throws into the request path: every send is fire-and-forget and swallowed.
// Reads the moltbot bot credentials so there is one bot, not a second one to babysit.
const fs = require('fs');
const https = require('https');

const MOLTBOT_ENV = 'C:\\Users\\Kevan\\scripts\\moltbot\\.env';

function loadCreds() {
  let token = process.env.TELEGRAM_BOT_TOKEN || '';
  let chat = process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
  if ((!token || !chat) && fs.existsSync(MOLTBOT_ENV)) {
    for (const raw of fs.readFileSync(MOLTBOT_ENV, 'utf8').split(/\r?\n/)) {
      const s = raw.trim();
      if (!s || s[0] === '#') continue;
      const i = s.indexOf('=');
      if (i < 0) continue;
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();
      if (!token && k === 'TELEGRAM_BOT_TOKEN') token = v;
      if (!chat && (k === 'TELEGRAM_ALERT_CHAT_ID' || k === 'TELEGRAM_CHAT_ID')) chat = v;
    }
  }
  return { token, chat };
}

const CREDS = loadCreds();
// Trim aggressively: a stray space or CR in the token becomes "Request path contains
// unescaped characters" at send time, which would silently kill alerting.
CREDS.token = String(CREDS.token || '').trim();
CREDS.chat = String(CREDS.chat || '').trim();
const TOKEN_OK = /^\d+:[A-Za-z0-9_-]+$/.test(CREDS.token);
const ENABLED = Boolean(TOKEN_OK && CREDS.chat);
if (CREDS.token && !TOKEN_OK) {
  console.error('[alerts] TELEGRAM_BOT_TOKEN is malformed — alerting DISABLED (len ' + CREDS.token.length + ')');
}

// De-dupe identical alerts inside a window so a flapping rail cannot spam the phone.
const recent = new Map();
const DEDUPE_MS = 10 * 60 * 1000;

function shouldSend(key) {
  if (!key) return true;
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  if (recent.has(key)) return false;
  recent.set(key, now);
  return true;
}

function post(text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id: CREDS.chat,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + CREDS.token + '/sendMessage',
      method: 'POST',
      timeout: 8000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body: d.slice(0, 200) }));
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Fire-and-forget alert. Returns immediately; never rejects.
 * level: 'money' | 'warn' | 'crit' | 'info'
 */
function alert(level, title, fields, dedupeKey) {
  if (!ENABLED) return;
  if (!shouldSend(dedupeKey)) return;
  const icon = { money: '\u{1F4B5}', warn: '⚠️', crit: '\u{1F6A8}', info: 'ℹ️' }[level] || 'ℹ️';
  const lines = [icon + ' <b>' + esc(title) + '</b>'];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined || v === null || v === '') continue;
    lines.push('<b>' + esc(k) + ':</b> ' + esc(v));
  }
  lines.push('<i>genesis402 · twin.unykorn.org · ' + new Date().toISOString() + '</i>');
  post(lines.join('\n')).catch(() => {});
}

// Awaitable variant for startup/shutdown where we want the send to land.
async function alertSync(level, title, fields) {
  if (!ENABLED) return { ok: false, error: 'telegram not configured' };
  const icon = { money: '\u{1F4B5}', warn: '⚠️', crit: '\u{1F6A8}', info: 'ℹ️' }[level] || 'ℹ️';
  const lines = [icon + ' <b>' + esc(title) + '</b>'];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined || v === null || v === '') continue;
    lines.push('<b>' + esc(k) + ':</b> ' + esc(v));
  }
  lines.push('<i>genesis402 · twin.unykorn.org · ' + new Date().toISOString() + '</i>');
  return post(lines.join('\n'));
}

module.exports = { alert, alertSync, ENABLED, chatId: CREDS.chat };
