/**
 * Read-only empire registry loader for genesis402 orchestrator cross-domain hints.
 * Canonical: sovereign-control-plane/registry/empire-domains.yaml
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_REGISTRY =
  'C:\\Users\\Kevan\\sovereign-control-plane\\registry\\empire-domains.yaml';

function unquote(v) {
  const t = String(v).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseDomains(text) {
  const lines = text.split(/\r?\n/);
  const domains = [];
  const domainsIdx = lines.findIndex((l) => l.trim() === 'domains:');
  if (domainsIdx < 0) return domains;

  let current = null;
  for (let i = domainsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === 'infrastructure:') break;
    const itemStart = line.match(/^\s+-\s+id:\s+(.+)$/);
    if (itemStart) {
      if (current) domains.push(current);
      current = { id: unquote(itemStart[1]) };
      continue;
    }
    if (!current) continue;
    const fields = [
      'domain', 'role', 'status', 'mcp_hub_url', 'web3_gateway_prefix',
      'stripe_surface', 'system_id', 'cross_domain_hint',
    ];
    for (const key of fields) {
      const m = line.match(new RegExp(`^\\s+${key}:\\s*(.*)$`));
      if (m) {
        const raw = m[1].trim();
        current[key] = raw === 'null' ? null : unquote(raw);
      }
    }
  }
  if (current) domains.push(current);
  return domains;
}

function loadEmpireConfig() {
  const registryPath = process.env.EMPIRE_REGISTRY_PATH || DEFAULT_REGISTRY;
  if (!fs.existsSync(registryPath)) {
    return { domains: [], hints: {} };
  }
  const text = fs.readFileSync(registryPath, 'utf8');
  const domains = parseDomains(text);

  const hints = {};
  for (const d of domains) {
    if (d.domain) {
      hints[d.domain] = {
        role: d.role || null,
        hint: d.cross_domain_hint || null,
        system_id: d.system_id || null,
        web3: d.web3_gateway_prefix || null,
      };
    }
  }

  if (!process.env.MCP_HUB_URL) {
    process.env.MCP_HUB_URL = 'http://127.0.0.1:9077';
  }
  process.env.EMPIRE_MCP_HUB_URL = process.env.MCP_HUB_URL;
  process.env.EMPIRE_DOMAIN_COUNT = String(domains.length);
  process.env.EMPIRE_CROSS_DOMAIN_HINTS = JSON.stringify(hints);

  return { domains, hints, registryPath };
}

module.exports = { loadEmpireConfig, DEFAULT_REGISTRY };
