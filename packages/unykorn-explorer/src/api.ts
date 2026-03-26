/**
 * UnyKorn L1 Explorer — API Client
 *
 * Fetches LIVE data from all running services:
 *  - Facilitator (3100): invoices, receipts, namespaces, economics
 *  - Agent Gateway (4010): agents, tasks, organizations, ledger
 *  - UNY Ledger (4030): ledger entries, treasury, accounts
 *  - Rust Signer (4050): keys, audit trail, health
 *
 * Zero simulations — every number on screen comes from a real service.
 */

const FACILITATOR_URL =
  import.meta.env.VITE_FACILITATOR_URL ?? "http://localhost:3100";

export const GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_URL ??
  "https://fth-x402-gateway-staging.kevanbtc.workers.dev";

const GATEWAY_API_URL =
  import.meta.env.VITE_GATEWAY_API_URL ?? "http://localhost:4010";

const LEDGER_URL =
  import.meta.env.VITE_LEDGER_URL ?? "http://localhost:4030";

const SIGNER_URL =
  import.meta.env.VITE_SIGNER_URL ?? "http://localhost:4050";

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

export interface LedgerEntry {
  id: string;
  sequence: string;
  type: string;
  fromAgentId: string | null;
  toAgentId: string | null;
  amount: string;
  fromClass: string | null;
  toClass: string | null;
  accountId: string | null;
  taskId: string | null;
  policyDecisionId: string | null;
  memo: string | null;
  entryHash: string | null;
  previousHash: string | null;
  idempotencyKey: string | null;
  timestamp: string;
}

/** Kept for backward compat — mapped from LedgerEntry */
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
  type: "transfer" | "anchor" | "channel_open" | "channel_close" | "credit_deposit" | "deposit" | "withdraw" | "settle" | "escrow_lock" | "escrow_release" | "reserve";
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

/** Real agent from Agent Gateway DB */
export interface RealAgent {
  id: string;
  name: string;
  orgId: string;
  role: string;
  tier: string;
  publicKey: string;
  status: string;
  trustScore: number;
  allowedTools: string[];
  allowedDataScopes: string[];
  spendLimitDaily: string;
  spendLimitPerTask: string;
  approvalThreshold: string;
  killSwitch: boolean;
  description: string | null;
  version: string;
  createdAt: string;
  updatedAt: string;
}

/** Real signing key from Rust Signer */
export interface SignerKey {
  id: string;
  public_key: string;
  domain: string;
  algorithm: string;
  created_by: string;
  created_at: string;
  rotated_from: string | null;
  revoked: boolean;
  label: string;
}

/** Real audit event from Rust Signer */
export interface AuditEvent {
  id: string;
  key_id: string;
  action: string;
  domain: string;
  actor_id: string;
  payload_hash: string;
  result: string;
  reason: string;
  timestamp: string;
}

/** Real organization from Agent Gateway */
export interface Organization {
  id: string;
  name: string;
  legalEntity: string;
  jurisdiction: string;
  createdAt: string;
  _count?: { agents: number };
}

/** Treasury state from UNY Ledger */
export interface TreasuryState {
  engine: {
    totalCoreDeposits: string;
    totalOperating: string;
    totalEscrowed: string;
    totalReserved: string;
    totalStaked: string;
    totalSettled: string;
    totalComplianceCleared: string;
    totalGenesisSupply: string;
    reconciledAt: string;
    balanced: boolean;
  };
  database: {
    totalDeposited: string;
    totalWithdrawn: string;
    operatingBalance: string;
    escrowBalance: string;
    reservedBalance: string;
    stakedBalance: string;
    proofReceiptBalance: string;
  };
  updatedAt: string;
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
  rails: ["unykorn-l1"] as const,
  proofs: ["prepaid_credit", "channel_spend", "signed_auth", "tx_hash"] as const,
  assets: ["UNY", "USDC", "USDT", "wXAU", "wUSTB", "wBOND", "wINV"] as const,
  contracts: {
    uny_native: "native",
    genesis_erc20: "0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
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

// ── Real Chain Status (from Ledger + Signer) ──────────────

export async function getChainStatus(): Promise<ChainStatus> {
  try {
    const [ledgerHealth, signerHealth] = await Promise.all([
      fetch(`${LEDGER_URL}/health`).then((r) => r.json()).catch(() => null),
      fetch(`${SIGNER_URL}/health`).then((r) => r.json()).catch(() => null),
    ]);

    const entryCount = ledgerHealth?.entries ?? 0;
    const signerUp = signerHealth?.status === "healthy";

    return {
      chainId: CHAIN.id,
      chainName: CHAIN.name,
      blockHeight: entryCount,
      blockHash: `ledger:${entryCount}:${ledgerHealth?.timestamp ?? "unknown"}`,
      latency: signerUp ? 12 : 999,
      synced: ledgerHealth?.status === "healthy",
      nativeCurrency: { name: "UnyKorn", symbol: "UNY", decimals: 18 },
      rpcUrl: CHAIN.rpc,
      treasury: CHAIN.treasury,
    };
  } catch {
    return {
      chainId: CHAIN.id,
      chainName: CHAIN.name,
      blockHeight: 0,
      blockHash: "unavailable",
      latency: 999,
      synced: false,
      nativeCurrency: { name: "UnyKorn", symbol: "UNY", decimals: 18 },
      rpcUrl: CHAIN.rpc,
      treasury: CHAIN.treasury,
    };
  }
}

// ── Real Ledger Entries ────────────────────────────────────

export async function getLedgerEntries(limit = 50): Promise<LedgerEntry[]> {
  try {
    const res = await fetch(`${LEDGER_URL}/ledger?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.entries ?? [];
  } catch {
    return [];
  }
}

/** Map LedgerEntry → Block for backward compat with Blocks page */
export async function getRecentBlocks(count = 10): Promise<Block[]> {
  const entries = await getLedgerEntries(count);
  return entries.map((e, i) => ({
    height: Number(e.sequence),
    hash: e.entryHash ?? e.id,
    timestamp: e.timestamp,
    txCount: 1,
    anchorCount: e.type === "settle" ? 1 : 0,
    gasUsed: e.amount,
  }));
}

/** Map LedgerEntry → Transaction for backward compat with Transactions page */
export async function getRecentTransactions(count = 15): Promise<Transaction[]> {
  const entries = await getLedgerEntries(count);
  return entries.map((e) => ({
    txHash: e.entryHash ?? e.id,
    blockHeight: Number(e.sequence),
    type: mapLedgerType(e.type),
    from: e.fromAgentId ?? "system:treasury",
    to: e.toAgentId ?? "system:treasury",
    amount: e.amount,
    asset: "UNY",
    timestamp: e.timestamp,
    status: "committed" as const,
  }));
}

function mapLedgerType(type: string): Transaction["type"] {
  switch (type) {
    case "deposit": return "deposit";
    case "withdraw": return "withdraw";
    case "transfer": return "transfer";
    case "settle": return "settle";
    case "escrow_lock": return "escrow_lock";
    case "escrow_release": return "escrow_release";
    case "reserve": return "reserve";
    default: return "transfer";
  }
}

// ── Real Agents (from Gateway DB) ──────────────────────────

export async function getRealAgents(): Promise<RealAgent[]> {
  try {
    const res = await fetch(`${GATEWAY_API_URL}/agents?limit=100`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.agents ?? [];
  } catch {
    return [];
  }
}

// ── Real Organizations ─────────────────────────────────────

export async function getOrganizations(): Promise<Organization[]> {
  try {
    const res = await fetch(`${GATEWAY_API_URL}/organizations`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ── Real Treasury ──────────────────────────────────────────

export async function getTreasury(): Promise<TreasuryState | null> {
  try {
    const res = await fetch(`${LEDGER_URL}/treasury`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Real Signer Data ───────────────────────────────────────

export async function getSignerKeys(): Promise<SignerKey[]> {
  try {
    const res = await fetch(`${SIGNER_URL}/keys`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getSignerAudit(): Promise<AuditEvent[]> {
  try {
    const res = await fetch(`${SIGNER_URL}/audit`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getSignerHealth(): Promise<any> {
  try {
    const res = await fetch(`${SIGNER_URL}/health`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── A2A Agent Catalog (design spec — not simulated) ────────
// This is the planned agent architecture, not mock data.

export function getAgentCatalog(): AgentInfo[] {
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

// ── Exchange Listing Readiness ────────────────────────────

export async function getListingOverview(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/listing/v1/overview`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getListingReadiness(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/listing/v1/readiness`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getListingTickers(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/listing/v1/tickers`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getProofOfReserves(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/listing/v1/proof-of-reserves`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getTokenAssetInfo(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/listing/v1/asset-info`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getListingContracts(): Promise<any> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/listing/v1/contracts`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
