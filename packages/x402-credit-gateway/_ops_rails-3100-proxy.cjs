// _ops_rails-3100-proxy.cjs
// Transparent reverse proxy forwarding 0.0.0.0:3100 -> 127.0.0.1:4020
const http = require('http');

const LISTEN_PORT = 3100;
const LISTEN_HOST = '0.0.0.0';
const TARGET_PORT = 4020;
const TARGET_HOST = '127.0.0.1';

const server = http.createServer((req, res) => {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${TARGET_HOST}:${TARGET_PORT}`,
      'x-forwarded-for': req.socket.remoteAddress || '',
      'x-forwarded-proto': 'http',
      'x-forwarded-port': `${LISTEN_PORT}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message, target: `${TARGET_HOST}:${TARGET_PORT}` }));
    }
  });

  req.pipe(proxyReq);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[rails-3100] proxying ${LISTEN_HOST}:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});
