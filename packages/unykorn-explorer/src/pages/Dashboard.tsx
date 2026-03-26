import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getChainStatus,
  getRecentBlocks,
  getRecentTransactions,
  getFacilitatorHealth,
  getGatewayHealth,
  getExplorerStats,
  getRevenueFeed,
  getRealAgents,
  getTreasury,
  getSignerHealth,
  getLedgerEntries,
  CHAIN,
  PREMIUM_ROUTES,
  GATEWAY_URL,
  truncHash,
  timeAgo,
  type ChainStatus,
  type Block,
  type Transaction,
  type FacilitatorHealth,
  type GatewayHealth,
  type ExplorerStats,
  type RealAgent,
  type TreasuryState,
  type LedgerEntry,
} from "../api";

export default function Dashboard() {
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [fHealth, setFHealth] = useState<FacilitatorHealth | null>(null);
  const [gHealth, setGHealth] = useState<GatewayHealth | null>(null);
  const [stats, setStats] = useState<ExplorerStats | null>(null);
  const [revenueFeed, setRevenueFeed] = useState<any[]>([]);
  const [agents, setAgents] = useState<RealAgent[]>([]);
  const [treasury, setTreasury] = useState<TreasuryState | null>(null);
  const [signerHealth, setSignerHealth] = useState<any>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    // All data is real — fetched from live services
    getChainStatus().then(setChain).catch(() => {});
    getRecentBlocks(6).then(setBlocks).catch(() => {});
    getRecentTransactions(8).then(setTxs).catch(() => {});
    getFacilitatorHealth().then(setFHealth).catch(() => {});
    getGatewayHealth().then(setGHealth).catch(() => {});
    getExplorerStats().then(setStats).catch(() => {});
    getRevenueFeed().then(setRevenueFeed).catch(() => {});
    getRealAgents().then(setAgents).catch(() => {});
    getTreasury().then(setTreasury).catch(() => {});
    getSignerHealth().then(setSignerHealth).catch(() => {});
    getLedgerEntries(10).then(setLedgerEntries).catch(() => {});

    const t = setInterval(() => {
      getChainStatus().then(setChain).catch(() => {});
      getRecentBlocks(6).then(setBlocks).catch(() => {});
      getRecentTransactions(8).then(setTxs).catch(() => {});
      getExplorerStats().then(setStats).catch(() => {});
      getRevenueFeed().then(setRevenueFeed).catch(() => {});
      getRealAgents().then(setAgents).catch(() => {});
      getTreasury().then(setTreasury).catch(() => {});
      getLedgerEntries(10).then(setLedgerEntries).catch(() => {});
    }, 6000);
    return () => clearInterval(t);
  }, []);

  const totalInvoices = stats?.invoices.total_invoices ?? 0;
  const paidInvoices = stats?.invoices.paid ?? 0;
  const pendingInvoices = stats?.invoices.pending ?? 0;
  const totalRevenue = parseFloat(stats?.invoices.total_revenue ?? "0");
  const totalReceipts = stats?.receipts.total_receipts ?? 0;
  const uniquePayers = stats?.receipts.unique_payers ?? 0;

  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero">
        <h1 className="ex-hero-title">
          <span className="gradient">UnyKorn L1</span> Chain Explorer
        </h1>
        <p className="ex-hero-sub">
          Real-time visibility into the sovereign trade-finance network.
          Blocks, transactions, x402 payments, Merkle anchors, A2A agents, and the
          hierarchical namespace — all in one view.
        </p>
        <div className="protocol-row">
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#3b82f6" }} /> x402 Payment Protocol
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#a855f7" }} /> A2A Agent Mesh (12 agents)
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#22c55e" }} /> Merkle Receipt Anchoring
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#f5a623" }} /> Native L1 Settlement
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#60a5fa" }} /> 7 Supported Assets
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#ef4444" }} /> Rust Signer (Ed25519)
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#22d3ee" }} /> 34+ Packages · 75K+ LOC
          </span>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="stat-grid">
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Ledger Entries</div>
          <div className="stat-value">{chain?.blockHeight ?? "—"}</div>
          <div className="stat-sub">Real double-entry records · Chain {CHAIN.id}</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Services</div>
          <div className="stat-value">
            {[fHealth, gHealth, signerHealth, chain?.synced].filter(Boolean).length + (treasury ? 1 : 0) + (agents.length > 0 ? 1 : 0)} / 6
          </div>
          <div className="stat-sub">
            Facilitator {fHealth?.db === "connected" ? "✓" : "✗"} ·
            Gateway {gHealth ? "✓" : "✗"} ·
            Signer {signerHealth ? "✓" : "✗"} ·
            Ledger {chain?.synced ? "✓" : "✗"} ·
            Treasury {treasury ? "✓" : "✗"} ·
            Agents {agents.length > 0 ? "✓" : "✗"}
          </div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">x402 Invoices</div>
          <div className="stat-value">{totalInvoices}</div>
          <div className="stat-sub">
            {pendingInvoices} pending · {paidInvoices} paid
          </div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Treasury (UNY)</div>
          <div className="stat-value">{treasury ? Number(treasury.engine.totalGenesisSupply).toLocaleString() : "—"}</div>
          <div className="stat-sub">
            Operating: {treasury ? Number(treasury.engine.totalOperating).toLocaleString() : "0"} ·
            Balanced: {treasury?.engine.balanced ? "✓" : "—"}
          </div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Live Agents</div>
          <div className="stat-value">{agents.length}</div>
          <div className="stat-sub">Real registered agents in DB · {agents.filter(a => a.status === "active").length} active</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Signer Keys</div>
          <div className="stat-value">{signerHealth?.status === "healthy" ? "✓" : "—"}</div>
          <div className="stat-sub">Ed25519 · Uptime: {signerHealth ? Math.floor(signerHealth.uptime_secs / 60) + "m" : "—"}</div>
        </div>
      </div>

      {/* ── Architecture ── */}
      <div className="section-header">
        <h2 className="section-title">System <span className="accent">Architecture</span></h2>
        <span className="section-badge">6-Layer Stack</span>
      </div>
      <div className="glass arch-diagram" style={{ marginBottom: "var(--sov-space-xl)" }}>
        {[
          { id: "L6", label: "Ecosystem", desc: "API, partners, AI agents, XR", bg: "rgba(168, 85, 247, 0.08)", border: "rgba(168, 85, 247, 0.2)" },
          { id: "L5", label: "Work Plane", desc: "Delivery, Search, Settlement, Outreach", bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.2)" },
          { id: "L4", label: "Commerce Plane", desc: "Quote, Payment, Treasury, Receipt", bg: "rgba(59, 130, 246, 0.08)", border: "rgba(59, 130, 246, 0.2)" },
          { id: "L3", label: "Control Plane", desc: "Orchestrator, Guardian, Compliance, Budget", bg: "rgba(34, 197, 94, 0.08)", border: "rgba(34, 197, 94, 0.2)" },
          { id: "L2", label: "Security Layer", desc: "Rust Signer · Ed25519 · 10 Wallet Domains · Policy Enforcement", bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.2)" },
          { id: "L1", label: "UnyKorn Chain", desc: `Chain ${CHAIN.id} · Merkle anchors · trade-finance module`, bg: "rgba(245, 166, 35, 0.08)", border: "rgba(245, 166, 35, 0.2)" },
        ].map((layer) => (
          <div
            key={layer.id}
            className="arch-layer"
            style={{ background: layer.bg, border: `1px solid ${layer.border}` }}
          >
            <span className="arch-layer-id">{layer.id}</span>
            <span className="arch-layer-label">
              {layer.label} <span className="arch-layer-desc">— {layer.desc}</span>
            </span>
          </div>
        ))}
      </div>

      {/* ── Two Column: Blocks + Transactions ── */}
      <div className="two-col">
        {/* Recent Blocks */}
        <div className="glass">
          <div style={{ padding: "var(--sov-space-md) var(--sov-space-lg)", borderBottom: "1px solid var(--sov-border)" }}>
            <div className="section-header" style={{ margin: 0 }}>
              <h3 className="section-title" style={{ fontSize: "var(--sov-text-md)" }}>
                Recent <span className="accent">Ledger Entries</span>
              </h3>
              <Link to="/blocks" className="section-badge">View All →</Link>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Entry Hash</th>
                <th>Amount (UNY)</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.height}>
                  <td style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>
                    #{b.height}
                  </td>
                  <td className="mono">{truncHash(b.hash, 6)}</td>
                  <td>
                    {b.gasUsed}
                    {b.anchorCount > 0 && (
                      <span className="pill pill-purple" style={{ marginLeft: 6 }}>⚓</span>
                    )}
                  </td>
                  <td className="mono">{timeAgo(b.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Transactions */}
        <div className="glass">
          <div style={{ padding: "var(--sov-space-md) var(--sov-space-lg)", borderBottom: "1px solid var(--sov-border)" }}>
            <div className="section-header" style={{ margin: 0 }}>
              <h3 className="section-title" style={{ fontSize: "var(--sov-text-md)" }}>
                Recent <span className="accent">Transactions</span>
              </h3>
              <Link to="/transactions" className="section-badge">View All →</Link>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Hash</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.txHash}>
                  <td className="mono">{truncHash(tx.txHash, 6)}</td>
                  <td>
                    <span className={`pill ${txTypePill(tx.type)}`}>{tx.type}</span>
                  </td>
                  <td>
                    {tx.amount !== "0" ? `${tx.amount} ${tx.asset}` : "—"}
                  </td>
                  <td className="mono">{timeAgo(tx.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── x402 Payment Protocol Overview ── */}
      <div className="section-header">
        <h2 className="section-title">x402 <span className="accent">Payment Protocol</span></h2>
        <Link to="/x402" className="section-badge">Full x402 View →</Link>
      </div>
      <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-xl)" }}>
        <div className="stat-grid" style={{ marginBottom: 0 }}>
          <div>
            <div className="stat-label">Protocol Version</div>
            <code style={{ color: "var(--sov-accent-1)", fontSize: "var(--sov-text-lg)", fontWeight: 600 }}>
              fth-x402/2.0
            </code>
          </div>
          <div>
            <div className="stat-label">Accepted Rails</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {CHAIN.rails.map((r) => (
                <span key={r} className="pill pill-info">{r}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="stat-label">Proof Types</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {CHAIN.proofs.map((p) => (
                <span key={p} className="pill pill-purple">{p}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="stat-label">Supported Assets</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {CHAIN.assets.map((a) => (
                <span key={a} className="pill pill-success">{a}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Revenue Feed ── */}
      {revenueFeed.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Live <span className="accent">Revenue Feed</span></h2>
            <span className="section-badge">{revenueFeed.length} events</span>
          </div>
          <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
            <table className="data-table">
              <thead>
                <tr><th>Invoice</th><th>Resource</th><th>Payer</th><th>Amount</th><th>Rail</th><th>Time</th></tr>
              </thead>
              <tbody>
                {revenueFeed.slice(0, 10).map((ev: any, i: number) => (
                  <tr key={i}>
                    <td className="mono" style={{ color: "var(--sov-accent-1)", fontSize: "0.85rem" }}>{truncHash(ev.invoice_id || "", 6)}</td>
                    <td className="mono" style={{ fontSize: "0.85rem" }}>{ev.resource || "—"}</td>
                    <td className="mono" style={{ fontSize: "0.85rem" }}>{truncHash(ev.payer || "", 6)}</td>
                    <td style={{ fontWeight: 600 }}>{ev.amount} {ev.asset}</td>
                    <td><span className="pill pill-info">{ev.rail || "—"}</span></td>
                    <td className="mono">{ev.paid_at ? timeAgo(ev.paid_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Paid Routes (all 9) ── */}
      <div className="section-header">
        <h2 className="section-title">Revenue <span className="accent">Routes</span></h2>
        <span className="section-badge">HTTP 402 · {PREMIUM_ROUTES.length} endpoints</span>
      </div>
      <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Price</th>
              <th>Description</th>
              <th>Status</th>
              <th>Try</th>
            </tr>
          </thead>
          <tbody>
            {PREMIUM_ROUTES.map((r) => (
              <tr key={r.path}>
                <td>
                  <code style={{ color: "var(--sov-accent-1)", fontSize: "0.85rem" }}>{r.path}</code>
                </td>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.price} {r.asset}</td>
                <td style={{ fontSize: "0.85rem", opacity: 0.8 }}>{r.description}</td>
                <td><span className="pill pill-success">LIVE</span></td>
                <td>
                  <a
                    href={`${GATEWAY_URL}${r.example}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pill pill-purple"
                    style={{ textDecoration: "none", cursor: "pointer" }}
                  >
                    402 →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function txTypePill(type: string): string {
  switch (type) {
    case "transfer": return "pill-info";
    case "anchor": return "pill-purple";
    case "channel_open": return "pill-success";
    case "channel_close": return "pill-warning";
    case "credit_deposit": return "pill-success";
    default: return "pill-info";
  }
}
