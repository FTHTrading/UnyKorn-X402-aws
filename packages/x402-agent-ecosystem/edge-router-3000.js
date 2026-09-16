/**
 * Edge Router on Port 3000
 * Seamlessly routes incoming traffic from Cloudflare tunnel 98795c02:
 * - twin.unykorn.org -> http://127.0.0.1:8402 (Digital Twin HTTP + WebSockets)
 * - ada.unykorn.org  -> http://127.0.0.1:8800
 * - needai.unykorn.org -> http://127.0.0.1:3090
 * - default fallback -> http://127.0.0.1:8402
 */
const http = require('http');
const net = require('net');

const TARGETS = {
  'twin.unykorn.org': { host: '127.0.0.1', port: 8402 },
  'ada.unykorn.org': { host: '127.0.0.1', port: 8800 },
  'needai.unykorn.org': { host: '127.0.0.1', port: 3090 },
  'default': { host: '127.0.0.1', port: 8402 }
};

// Paths owned by the Genesis402 x402 task server on :3101.
// PAID: the four task endpoints.
// FREE: /health and /.well-known/x402 — an agent must be able to read our terms and
//       lane status WITHOUT paying. These were previously falling through to the
//       digital-twin app on :8402, which 404s them, so discovery looked absent.
// ADMIN: receipts + log, which the task server itself guards with a bearer key.
const X402_PATHS = new Set([
  '/task', '/risk', '/receipts', '/rwa-screen', '/wallet-ops', '/genesis-sim', '/prove', '/llm', '/llm/models', '/facilitator/supported', '/facilitator/verify', '/facilitator/settle',
  '/health', '/.well-known/x402', '/prove/keys', '/prove/stats', '/prove/recent',
  '/admin/receipts', '/admin/log', '/log'
]);
// Free receipt lookups carry an id in the path: /prove/receipts/{receiptId}
const X402_PREFIXES = ['/prove/receipts/', '/receipts/'];

function getTarget(req) {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const urlPath = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (X402_PATHS.has(urlPath) || X402_PREFIXES.some((p) => urlPath.startsWith(p))) {
    return { host: '127.0.0.1', port: 3101 };
  }
  return TARGETS[host] || TARGETS['default'];
}

const server = http.createServer((req, res) => {
  const target = getTarget(req);
  const options = {
    hostname: target.host,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: req.headers.host }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Bridge error connecting to ${target.host}:${target.port}: ${err.message}`);
  });

  req.pipe(proxyReq, { end: true });
});

// WebSocket upgrade handling
server.on('upgrade', (req, socket, head) => {
  const target = getTarget(req);
  const targetSocket = net.connect(target.port, target.host, () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    raw += '\r\n';
    targetSocket.write(raw);
    if (head && head.length > 0) {
      targetSocket.write(head);
    }
    socket.pipe(targetSocket);
    targetSocket.pipe(socket);
  });

  targetSocket.on('error', () => {
    socket.destroy();
  });
  socket.on('error', () => {
    targetSocket.destroy();
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[edge-router-3000] Listening on 0.0.0.0:${PORT}`);
  console.log(`[edge-router-3000] Routing twin.unykorn.org -> http://127.0.0.1:8402`);
});
