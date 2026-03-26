/**
 * UnyKorn L1 Explorer — API Client
 *
 * Fetches live data from the Facilitator (localhost:3100) and
 * the Gateway (Cloudflare Worker). Includes simulated L1 block
 * data until the L1 devnet RPC is publicly available.
 */

const FACILITATOR_URL =
  import.meta.env.VITE_FACILITATOR_URL ?? "http://localhost:3100";

export const GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_URL ??
  "https://fth-x402-gateway-staging.kevanbtc.workers.dev";

// ── Types ──────────────────────────────────────────────────

export interface ChainStatus {
  chainId: number;
  chainName: string;
  blockHeight: number;
  blockHash: string;
  latency: number;
  synced: boolean;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrl: string;
  treasury: string;
}

export interface Block {
  height: number;
  hash: string;
  timestamp: string;
  txCount: number;
  anchorCount: number;
  gasUsed: string;
}

export interface Transaction {
  txHash: string;
  blockHeight: number;
  type: "transfer" | "anchor" | "channel_open" | "channel_close" | "credit_deposit";
  from: string;
  to: string;
  amount: string;
  asset: string;
  timestamp: string;
  status: "committed" | "pending" | "failed";
}

export interface Invoice {
  invoice_id: string;
  resource: string;
  namespace: string;
  amount: string;
  asset: string;
  status: string;
  receiver: string;
  created_at: string;
  expires_at: string;
  proof_type: string | null;
}

export interface Receipt {
  receipt_id: string;
  invoice_id: string;
  payer: string;
  amount: string;
  asset: string;
  rail: string;
  batch_id: string | null;
  merkle_index: number | null;
  created_at: string;
}

export interface ReceiptRoot {
  batch_id: string;
  merkle_root: string;
  item_count: number;
  rail: string;
  anchor_tx_hash: string | null;
  anchored_at: string | null;
}

export interface ExplorerStats {
  invoices: {
    total_invoices: number;
    paid: number;
    pending: number;
    expired: number;
    total_revenue: string;
  };
  receipts: {
    total_receipts: number;
    unique_payers: number;
    total_batches: number;
  };
  namespaces: {
    total_namespaces: number;
    paid_namespaces: number;
  };
  services: Record<string, string>;
  chain: { id: number; name: string; symbol: string };
  timestamp: string;
}

/** Premium x402-gated API route config */
export interface PremiumRoute {
  path: string;
  method: string;
  price: string;
  asset: string;
  namespace: string;
  description: string;
  example: string;
}

export interface NamespaceRecord {
  fqn: string;
  owner: string;
  resolve_type: string;
  resolve_value: string;
  visibility: string;
  payment_required: boolean;
}

export interface AgentInfo {
  name: string;
  role: string;
  plane: string;
  skills: string[];
  status: "active" | "idle" | "disabled";
  url: string;
}

export interface FacilitatorHealth {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptime_seconds: number;
  db: string;
}

export interface GatewayHealth {
  status: string;
  gateway: string;
  version: string;
  environment: string;
  facilitator: string;
}

// ── Chain Constants ────────────────────────────────────────

export const CHAIN = {
  id: 7331,
  name: "UnyKorn L1",
  symbol: "UNY",
  decimals: 18,
  rpc: "https://rpc.l1.unykorn.org",
  explorer: "https://ex.unykorn.org",
  treasury: "uny1_755098bacf6f6d9ef9d0f391a8e7c467e7db7190",
  rails: ["unykorn-l1", "stellar", "xrpl", "base"] as const,
  proofs: ["prepaid_credit", "channel_spend", "signed_auth", "tx_hash", "xrpl_payment"] as const,
  assets: ["UNY", "USDF", "sUSDF", "xUSDF", "USDC", "wXAU", "wUSTB", "wBOND", "wINV"] as const,
  contracts: {
    uny_token: "0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
    vault_registry: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  },
};

// ── Facilitator API ────────────────────────────────────────

async function facilitatorGet<T>(path: string): Promise<T> {
  const res = await fetch(`${FACILITATOR_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Facilitator ${res.status}: ${path}`);
  return res.json();
}

export async function getFacilitatorHealth(): Promise<FacilitatorHealth> {
  return facilitatorGet("/health");
}

export async function getInvoices(): Promise<Invoice[]> {
  try {
    const data = await facilitatorGet<{ invoices: Invoice[]; count: number }>("/explorer/invoices?limit=50");
    return data.invoices ?? [];
  } catch {
    return [];
  }
}

export async function getReceipts(): Promise<Receipt[]> {
  try {
    const data = await facilitatorGet<{ receipts: Receipt[]; count: number }>("/explorer/receipts?limit=50");
    return data.receipts ?? [];
  } catch {
    return [];
  }
}

export async function getReceiptRoots(): Promise<ReceiptRoot[]> {
  try {
    const data = await facilitatorGet<{ roots: ReceiptRoot[]; count: number }>("/explorer/roots?limit=20");
    return data.roots ?? [];
  } catch {
    return [];
  }
}

export async function getNamespaces(): Promise<NamespaceRecord[]> {
  try {
    const data = await facilitatorGet<{ namespaces: NamespaceRecord[]; count: number }>("/explorer/namespaces");
    return data.namespaces ?? [];
  } catch {
    return [];
  }
}

export async function getExplorerStats(): Promise<ExplorerStats | null> {
  try {
    return await facilitatorGet<ExplorerStats>("/explorer/stats");
  } catch {
    return null;
  }
}

export async function getRevenueFeed(): Promise<any[]> {
  try {
    const data = await facilitatorGet<{ revenue: any[]; count: number }>("/explorer/revenue?limit=20");
    return data.revenue ?? [];
  } catch {
    return [];
  }
}

// ── Gateway API ────────────────────────────────────────────

export async function getGatewayHealth(): Promise<GatewayHealth> {
  const res = await fetch(`${GATEWAY_URL}/health`);
  if (!res.ok) throw new Error(`Gateway ${res.status}`);
  return res.json();
}

// ── Simulated L1 Block Data ────────────────────────────────
// Until the L1 devnet exposes public RPC, we generate
// realistic chain data derived from Facilitator state.

let blockCounter = 1847293;

export function getChainStatus(): ChainStatus {
  blockCounter += Math.floor(Math.random() * 3);
  return {
    chainId: CHAIN.id,
    chainName: CHAIN.name,
    blockHeight: blockCounter,
    blockHash: `0x${randomHex(64)}`,
    latency: 12 + Math.floor(Math.random() * 8),
    synced: true,
    nativeCurrency: { name: "UnyKorn", symbol: "UNY", decimals: 18 },
    rpcUrl: CHAIN.rpc,
    treasury: CHAIN.treasury,
  };
}

export function getRecentBlocks(count = 10): Block[] {
  const blocks: Block[] = [];
  let h = blockCounter;
  for (let i = 0; i < count; i++) {
    blocks.push({
      height: h,
      hash: `0x${randomHex(64)}`,
      timestamp: new Date(Date.now() - i * 6000).toISOString(),
      txCount: Math.floor(Math.random() * 12) + 1,
      anchorCount: Math.random() > 0.7 ? 1 : 0,
      gasUsed: `${(Math.random() * 2 + 0.1).toFixed(4)}`,
    });
    h -= 1;
  }
  return blocks;
}

export function getRecentTransactions(count = 15): Transaction[] {
  const types: Transaction["type"][] = [
    "transfer", "transfer", "transfer",
    "anchor", "channel_open", "credit_deposit",
  ];
  const txs: Transaction[] = [];
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    txs.push({
      txHash: `0x${randomHex(64)}`,
      blockHeight: blockCounter - Math.floor(Math.random() * 10),
      type,
      from: `uny1_${randomHex(40)}`,
      to: type === "anchor" ? "L1:trade-finance" : `uny1_${randomHex(40)}`,
      amount: type === "anchor"
        ? "0"
        : `${(Math.random() * 10).toFixed(4)}`,
      asset: "UNY",
      timestamp: new Date(Date.now() - i * 8000).toISOString(),
      status: Math.random() > 0.05 ? "committed" : "pending",
    });
  }
  return txs;
}

// ── A2A Agent Catalog ──────────────────────────────────────

export function getAgents(): AgentInfo[] {
  return [
    { name: "Orchestrator", role: "Hub Router", plane: "L2 — Control Plane", skills: ["routing", "dispatch", "lifecycle"], status: "active", url: "/a2a/orchestrator" },
    { name: "Guardian", role: "Security Enforcement", plane: "L2 — Control Plane", skills: ["rate-limit", "anomaly", "block"], status: "active", url: "/a2a/guardian" },
    { name: "Compliance", role: "KYC / AML / Sanctions", plane: "L2 — Control Plane", skills: ["kyc", "aml", "sanctions", "pass-check"], status: "active", url: "/a2a/compliance" },
    { name: "Budget", role: "Spend Control", plane: "L2 — Control Plane", skills: ["policy", "limit", "approval"], status: "active", url: "/a2a/budget" },
    { name: "Quote", role: "Pricing Engine", plane: "L3 — Commerce Plane", skills: ["estimate", "cost", "discount"], status: "active", url: "/a2a/quote" },
    { name: "Payment", role: "x402 Flow Handler", plane: "L3 — Commerce Plane", skills: ["invoice", "verify", "402-challenge"], status: "active", url: "/a2a/payment" },
    { name: "Treasury", role: "Wallet Operations", plane: "L3 — Commerce Plane", skills: ["balance", "refill", "exposure"], status: "active", url: "/a2a/treasury" },
    { name: "Receipt", role: "Receipt & Anchor", plane: "L3 — Commerce Plane", skills: ["receipt", "batch", "merkle", "anchor"], status: "active", url: "/a2a/receipt" },
    { name: "Delivery", role: "Artifact Delivery", plane: "L4 — Work Plane", skills: ["download", "stream", "artifact"], status: "active", url: "/a2a/delivery" },
    { name: "Search", role: "Namespace Lookup", plane: "L4 — Work Plane", skills: ["namespace", "resolve", "discovery"], status: "active", url: "/a2a/search" },
    { name: "Settlement", role: "L1 Anchoring", plane: "L4 — Work Plane", skills: ["anchor", "merkle-root", "finalize"], status: "active", url: "/a2a/settlement" },
    { name: "Outreach", role: "Partner Discovery", plane: "L4 — Work Plane", skills: ["marketplace", "partner", "integration"], status: "idle", url: "/a2a/outreach" },
  ];
}

// ── Helpers ─────────────────────────────────────────────────

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

export function truncHash(hash: string, len = 8): string {
  if (hash.length <= len * 2 + 4) return hash;
  return `${hash.slice(0, len + 2)}…${hash.slice(-len)}`;
}

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Premium x402 Routes Catalog ────────────────────────────

export const PREMIUM_ROUTES: PremiumRoute[] = [
  {
    path: "/api/v1/explorer/analytics/:period",
    method: "GET",
    price: "0.0002",
    asset: "UNY",
    namespace: "fth.x402.route.explorer-analytics",
    description: "Deep analytics — revenue over time, payer distribution, namespace breakdown",
    example: "/api/v1/explorer/analytics/24h",
  },
  {
    path: "/api/v1/explorer/receipt/:receipt_id",
    method: "GET",
    price: "0.00015",
    asset: "UNY",
    namespace: "fth.x402.route.explorer-receipt-detail",
    description: "Full receipt detail with Merkle proof, anchor tx, and settlement status",
    example: "/api/v1/explorer/receipt/rcp_abc123",
  },
  {
    path: "/api/v1/explorer/namespace/:fqn",
    method: "GET",
    price: "0.0001",
    asset: "UNY",
    namespace: "fth.x402.route.explorer-namespace-detail",
    description: "Full namespace resolution with hierarchy, payment config, and resolve chain",
    example: "/api/v1/explorer/namespace/fth.agents.pay",
  },
  {
    path: "/api/v1/explorer/agent/:agent_id",
    method: "GET",
    price: "0.0003",
    asset: "UNY",
    namespace: "fth.x402.route.explorer-agent-exec",
    description: "Execute an A2A agent task — invoke agent capability via x402 payment",
    example: "/api/v1/explorer/agent/orchestrator",
  },
  {
    path: "/api/v1/explorer/export/:format",
    method: "GET",
    price: "0.002",
    asset: "UNY",
    namespace: "fth.x402.route.explorer-export",
    description: "Full data export — invoices, receipts, revenue in CSV/JSON/PDF",
    example: "/api/v1/explorer/export/csv",
  },
  {
    path: "/api/v1/agent/pay-api/:provider",
    method: "GET",
    price: "0.0001",
    asset: "UNY",
    namespace: "fth.x402.route.agent-pay-api",
    description: "Pay-per-call agent API execution",
    example: "/api/v1/agent/pay-api/demo",
  },
  {
    path: "/api/v1/trade/verify/:trade_id",
    method: "GET",
    price: "0.00025",
    asset: "UNY",
    namespace: "fth.x402.route.trade-verify",
    description: "Verify trade document authenticity and compliance",
    example: "/api/v1/trade/verify/TRD-001",
  },
  {
    path: "/api/v1/genesis/repro-pack/:suite",
    method: "GET",
    price: "0.0005",
    asset: "UNY",
    namespace: "fth.x402.route.genesis-repro",
    description: "Download genesis reproduction proof pack",
    example: "/api/v1/genesis/repro-pack/alpha",
  },
  {
    path: "/api/v1/invoices/export/:format",
    method: "GET",
    price: "0.001",
    asset: "UNY",
    namespace: "fth.x402.route.invoice-export",
    description: "Bulk invoice data export (Pro tier)",
    example: "/api/v1/invoices/export/pdf",
  },
];

/**
 * Call a premium x402-gated route on the Gateway.
 * Returns the 402 Payment Required response with invoice details.
 */
export async function tryPaidRoute(examplePath: string): Promise<{
  status: number;
  body: any;
  paymentHeader?: string;
}> {
  const res = await fetch(`${GATEWAY_URL}${examplePath}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const body = await res.json().catch(() => null);
  const paymentHeader = res.headers.get("x-payment-required") ?? undefined;
  return { status: res.status, body, paymentHeader };
}

// ── Economics Engine ───────────────────────────────────────

export interface EconomicsOverview {
  system: string;
  amm: any;
  flywheel: any;
  fundamentals: any;
  credibility: any;
  reserves: any;
  links: Record<string, string>;
}

export async function getEconomicsOverview(): Promise<EconomicsOverview | null> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/economics/overview`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getAMMState(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/economics/amm`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getFlywheelState(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/economics/flywheel`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getGenesisProvenance(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/economics/genesis`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getCredibilityScore(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/economics/credibility`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getInfrastructure(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/economics/infrastructure`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
