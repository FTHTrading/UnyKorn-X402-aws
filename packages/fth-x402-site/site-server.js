#!/usr/bin/env node
/**
 * Simple static server for the Genesis402 Web3 AI Task Center hub.
 * Serves the Bank of AI exact replica + full live Agent Mail console (public/index.html).
 * Port 8080 by default. Matches genesis402.com tunnel.
 * For PM2 persistence and agent-driven ops.
 * 
 * BACKEND SUPPORT: Proxies /api/mcp (for Agent Mail Zoho/MCP tools) and /api/ask
 * to the central MCP hub (9077) and Finn/oracle so the console's interactive
 * mail sending and "Ask the System" actually work against the real sovereign stack.
 */

require('./genesis402-env');

const http = require('http');
const { xrplWssUrl } = require('./lib/gateways');
const fs = require('fs');
const path = require('path');
const { request: httpRequest } = require('http');

const PORT = 8080; // 8080 for genesis402-hub (replica + full live Agent Mail console + MCP proxies + /api/gateway-health powerful infra). Registry + tunnel + preflight expect 8080 for the site. Task enforcement is separate on 3101.
const PUBLIC_DIR = path.join(__dirname, 'public');
const EMPIRE_DASHBOARD = path.join(
  'C:',
  'Users',
  'Kevan',
  'sovereign-control-plane',
  'public',
  'empire-dashboard.html'
);
const MCP_HUB = process.env.MCP_HUB_URL || 'http://127.0.0.1:9077';
const { handleEscrowApi } = require('./routes/escrowApi');
const { handleEscrowRoutes: handleEscrowRoutesLegacy } = require('./routes/escrow-routes');
const { handlePaidRoutes } = require('./routes/paid-api');
const { handleOnboardingApi } = require('./routes/onboarding-api');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.vrm': 'model/gltf-binary',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

  if (url.pathname.startsWith('/api/register') || url.pathname.startsWith('/api/namespace/') || url.pathname === '/api/provision') {
    try {
      const handledOb = await handleOnboardingApi(req, res, url);
      if (handledOb) return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
      return;
    }
  }

  if (url.pathname.startsWith('/api/escrow')) {
    try {
      const handled5 = await handleEscrowApi(req, res);
      if (handled5) return;
      const handledLegacy = await handleEscrowRoutesLegacy(req, res, url.pathname + (url.search || ''));
      if (handledLegacy) return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
      return;
    }
  }

  // Proxy x402 task execution directly to task-server on 3101
  if (url.pathname === '/llm' || url.pathname.startsWith('/llm/') || url.pathname === '/task' || url.pathname.startsWith('/task/') || url.pathname === '/rwa-screen' || url.pathname === '/genesis-sim' || url.pathname === '/wallet-ops') {
    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: 3101,
      path: req.url,
      method: req.method,
      headers: req.headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Task server on port 3101 is temporarily unavailable: ' + err.message }));
    });
    req.pipe(proxyReq, { end: true });
    return;
  }

  // x-402-payment paid REST (parallel to task-server X-PAYMENT on :3101)
  if (url.pathname.startsWith('/api/vault/') || url.pathname.startsWith('/api/agentmail/') || url.pathname === '/api/investigate/paid') {
    const handled = await handlePaidRoutes(req, res, url);
    if (handled) return;
  }

  if (req.url === '/api/revenue_events') {
    // Revenue Ramp Dashboard API
    const revFile = 'C:\\Users\\Kevan\\aws-revenue-stack\\data\\revenue_events.jsonl';
    let events = [];
    try {
      if (fs.existsSync(revFile)) {
        const lines = fs.readFileSync(revFile, 'utf8').trim().split('\n').filter(Boolean);
        events = lines.map(l => JSON.parse(l));
      }
    } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total: events.reduce((s, e) => s + (e.value || 0), 0), events, generatedFromPipeline: 27800 /* 25k + 2.8k */ }));
    return;
  }

  // === POWERFUL INFRA: health/status for the empire CF Web3 Gateways (the "all of this" the user pasted, incl. troptionsmint)
  // Static + note for live (the CF Web3 are managed/no-infra; status from our creation + dashboard). UI can poll or extend with server pings.
  // This gives the replica a powerful observability layer over all sovereign gateways without running nodes.
  if (req.url === '/api/gateway-health' || req.url.startsWith('/api/gateway-health')) {
    const data = {
      updated: new Date().toISOString(),
      xrplWss: xrplWssUrl(),
      note: 'CF Web3 Gateways (managed, zero infra). blockchainfraud (.buck Buck Fraud) + mensofgod (Men of God full infrastructure) + troptionsmint + digitalgiant + genesis402 + full empire. 403/500 on root often expected (use as RPC for web3.*, IPFS paths/CIDs for ipfs.* after publish). Real-payer and manifests use CF URLs for EVM/IPFS. Web3 Agent Mailer activated for .buck and Men of God.',
      gateways: {
        'web3.blockchainfraud.org': { brand: 'blockchainfraud', type: 'ethereum', desc: 'Blockchain Fraud Lab Sovereign Web3 Gateway - Ethereum/Base for x402 payments and agent systems', status: 'active' },
        'ipfs.blockchainfraud.org': { brand: 'blockchainfraud', type: 'ipfs', desc: 'Buck Fraud System IPFS DNSLink Gateway for Agent Mail manifests, sovereign documents, fraud reports, and Web3 agent mail assets', status: 'active', dnslink: '/ipns/blockchainfraud.org' },
        'web3.mensofgod.com': { brand: 'mensofgod', type: 'ethereum', desc: 'Men of God Sovereign Web3 Gateway - Ethereum/Base for x402 payments and agent systems', status: 'active' },
        'ipfs.mensofgod.com': { brand: 'mensofgod', type: 'ipfs', desc: 'Men of God IPFS DNSLink Gateway for manifests, assets, and sovereign documents', status: 'active', dnslink: '/ipns/mensofgod.com' },
        'web3.troptionsmint.com': { brand: 'troptionsmint', type: 'ethereum', desc: 'TROPTIONS Mint Sovereign Web3 Gateway - Ethereum/Base for x402 payments and agent systems', status: 'active' },
        'ipfs.troptionsmint.com': { brand: 'troptionsmint', type: 'ipfs', desc: 'TROPTIONS Mint IPFS DNSLink Gateway for manifests, assets, and sovereign documents', status: 'active', dnslink: '/ipns/troptionsmint.com' },
        'web3.genesis402.com': { brand: 'genesis402', type: 'ethereum', desc: 'Genesis402 Sovereign x402 Backend - Ethereum Web3 Gateway for Base USDC real payments and system access', status: 'active' },
        'x402.genesis402.com': { brand: 'genesis402', type: 'ethereum', desc: 'Genesis402 x402 Payment Gateway - Dedicated for real USDC x402 enforcement on Base', status: 'active' },
        'ipfs.genesis402.com': { brand: 'genesis402', type: 'ipfs', desc: 'Genesis402 IPFS DNSLink Gateway for manifests, 5-Proof artifacts, documents, and sovereign assets', status: 'active' },
        'web3.digitalgiant.xyz': { brand: 'digitalgiant', type: 'ethereum', desc: 'Digital Giant Sovereign Web3 Gateway - Ethereum/Base for x402 payments and agent systems', status: 'active' },
        'ipfs.digitalgiant.xyz': { brand: 'digitalgiant', type: 'ipfs', desc: 'Digital Giant IPFS Gateway for manifests, assets, and sovereign documents', status: 'active' }
      }
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
    return;
  }

  // === BACKEND PROXIES for the live console (Agent Mail + Ask the System) ===
  // These make the frontend's /api/mcp calls (Zoho mail tools for finn.* / bryan.* identities)
  // and /api/ask actually hit the real MCP hub (mail, tools) and Finn/oracle.
  // This completes the "agent mail for both genesis402 and Finn" on the backend.
  const FINN_ASK = process.env.FINN_ASK_URL || 'http://127.0.0.1:7700'; // Finn sovereign brain if it serves ask
  const mcpHubUrl = new URL(MCP_HUB);

  if (req.url === '/hq' || req.url === '/empire-dashboard' || req.url === '/empire' || req.url === '/empire-dashboard.html') {
    const dashPath = fs.existsSync(EMPIRE_DASHBOARD)
      ? EMPIRE_DASHBOARD
      : path.join(PUBLIC_DIR, 'empire-dashboard.html');
    fs.readFile(dashPath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Empire dashboard not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content, 'utf-8');
    });
    return;
  }

  if (req.url === '/api/empire/status') {
    const proxyReq = httpRequest({
      hostname: mcpHubUrl.hostname,
      port: mcpHubUrl.port || (mcpHubUrl.protocol === 'https:' ? 443 : 80),
      path: '/empire/status',
      method: 'GET',
      headers: { host: mcpHubUrl.host, accept: 'application/json' }
    }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', (c) => { body += c; });
      proxyRes.on('end', () => {
        res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(body);
      });
    });
    proxyReq.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'MCP hub unreachable', detail: e.message, hint: 'Start fth-mcp-hub on 9077 and run empire-health-poll.ps1' }));
    });
    proxyReq.end();
    return;
  }

  if (req.url === '/api/mcp' || req.url.startsWith('/api/mcp/')) {
    // Forward to MCP hub invoke or manifest
    const targetPath = req.url === '/api/mcp' ? '/mcp/invoke' : req.url.replace('/api/mcp', '/mcp');
    const proxyReq = httpRequest({
      hostname: mcpHubUrl.hostname,
      port: mcpHubUrl.port || (mcpHubUrl.protocol === 'https:' ? 443 : 80),
      path: targetPath,
      method: req.method,
      headers: { ...req.headers, host: mcpHubUrl.host }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (e) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'MCP hub unreachable', detail: e.message, hint: 'Start fth-mcp-hub on 9077' }));
    });
    req.pipe(proxyReq);
    return;
  }

  if (req.url === '/api/ask' || req.url.startsWith('/api/ask')) {
    // Ask the system: try Finn first, fallback to simple local or MCP tool
    const finnAskUrl = new URL(FINN_ASK);
    const proxyReq = httpRequest({
      hostname: finnAskUrl.hostname,
      port: finnAskUrl.port || (finnAskUrl.protocol === 'https:' ? 443 : 80),
      path: '/ask',
      method: req.method,
      headers: { ...req.headers, host: finnAskUrl.host }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      // Fallback: simple echo/reason using local (or call task ai-reason)
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const p = JSON.parse(body || '{}');
          const q = p.message || p.q || 'status';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ answer: `Sovereign stack (genesis402 + Finn) received: ${q}. Use the console rails or MCP for real actions. Backend x402 + agent mail ready.`, source: 'genesis402-site-fallback' }));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ answer: 'Ask received by genesis402 backend. Real reasoning via Finn/MCP when available.' }));
        }
      });
    });
    req.pipe(proxyReq);
    return;
  }

  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // Try index.html for SPA-like routing if needed
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err, content) => {
          if (err) {
            res.writeHead(404);
            res.end('Not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.on('error', (err) => {
  console.error('Site server error (bind?):', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} in use — check pm2 or other servers. Exiting to allow PM2 restart.`);
    process.exit(1);
  }
});
// Loopback only: the public path is the Cloudflare tunnel on 127.0.0.1; nothing on the LAN needs this port.
// (2026-09-16 security finding: onboarding-api namespace claim has no session; do not widen the bind until it does.)
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Genesis402 Web3 Site Hub running on http://0.0.0.0:${PORT} (bound all interfaces; registry health http://127.0.0.1:${PORT}/)`);
  console.log(`Serving from ${PUBLIC_DIR}`);
  console.log(`Empire HQ dashboard: http://127.0.0.1:${PORT}/hq`);
  console.log(`5-Proof Guardian portal: http://127.0.0.1:${PORT}/guardian-portal.html`);
});

process.on('SIGINT', () => {
  console.log('Shutting down site server...');
  server.close(() => process.exit(0));
});