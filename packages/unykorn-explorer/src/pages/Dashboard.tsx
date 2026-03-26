import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getChainStatus,
  getRecentBlocks,
  getRecentTransactions,
  getFacilitatorHealth,
  getGatewayHealth,
  getInvoices,
  CHAIN,
  truncHash,
  timeAgo,
  type ChainStatus,
  type Block,
  type Transaction,
  type FacilitatorHealth,
  type GatewayHealth,
  type Invoice,
} from "../api";

export default function Dashboard() {
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [fHealth, setFHealth] = useState<FacilitatorHealth | null>(null);
  const [gHealth, setGHealth] = useState<GatewayHealth | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    setChain(getChainStatus());
    setBlocks(getRecentBlocks(6));
    setTxs(getRecentTransactions(8));
    getFacilitatorHealth().then(setFHealth).catch(() => {});
    getGatewayHealth().then(setGHealth).catch(() => {});
    getInvoices().then((inv) => {
      setInvoices(inv);
      setTotalRevenue(inv.reduce((s, i) => s + parseFloat(i.amount || "0"), 0));
    }).catch(() => {});

    const t = setInterval(() => {
      setChain(getChainStatus());
      setBlocks(getRecentBlocks(6));
      setTxs(getRecentTransactions(8));
    }, 6000);
    return () => clearInterval(t);
  }, []);

  const pendingInvoices = invoices.filter((i) => i.status === "pending").length;
  const paidInvoices = invoices.filter((i) => i.status === "paid").length;

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
            <span className="proto-dot" style={{ background: "#f5a623" }} /> Multi-Rail Settlement
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#60a5fa" }} /> 9 Supported Assets
          </span>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="stat-grid">
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Block Height</div>
          <div className="stat-value">{chain?.blockHeight.toLocaleString() ?? "—"}</div>
          <div className="stat-sub">~6s block time · Chain {CHAIN.id}</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Services</div>
          <div className="stat-value">
            {fHealth ? "4" : "..."} / 4
          </div>
          <div className="stat-sub">
            Facilitator {fHealth?.db === "connected" ? "✓" : "?"} ·
            Gateway {gHealth ? "✓" : "?"} ·
            Treasury ✓ · Guardian ✓
          </div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">x402 Invoices</div>
          <div className="stat-value">{invoices.length}</div>
          <div className="stat-sub">
            {pendingInvoices} pending · {paidInvoices} paid
          </div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Revenue (UNY)</div>
          <div className="stat-value">{totalRevenue.toFixed(4)}</div>
          <div className="stat-sub">
            Across {CHAIN.rails.length} settlement rails
          </div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">A2A Agents</div>
          <div className="stat-value">12</div>
          <div className="stat-sub">3 planes · Hub & spoke + JSON-RPC</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Settlement Rails</div>
          <div className="stat-value">{CHAIN.rails.length}</div>
          <div className="stat-sub">{CHAIN.rails.join(" · ")}</div>
        </div>
      </div>

      {/* ── Architecture ── */}
      <div className="section-header">
        <h2 className="section-title">System <span className="accent">Architecture</span></h2>
        <span className="section-badge">5-Layer Stack</span>
      </div>
      <div className="glass arch-diagram" style={{ marginBottom: "var(--sov-space-xl)" }}>
        {[
          { id: "L5", label: "Ecosystem", desc: "API, partners, AI agents, XR", bg: "rgba(168, 85, 247, 0.08)", border: "rgba(168, 85, 247, 0.2)" },
          { id: "L4", label: "Work Plane", desc: "Delivery, Search, Settlement, Outreach", bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.2)" },
          { id: "L3", label: "Commerce Plane", desc: "Quote, Payment, Treasury, Receipt", bg: "rgba(59, 130, 246, 0.08)", border: "rgba(59, 130, 246, 0.2)" },
          { id: "L2", label: "Control Plane", desc: "Orchestrator, Guardian, Compliance, Budget", bg: "rgba(34, 197, 94, 0.08)", border: "rgba(34, 197, 94, 0.2)" },
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
                Recent <span className="accent">Blocks</span>
              </h3>
              <Link to="/blocks" className="section-badge">View All →</Link>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Height</th>
                <th>Hash</th>
                <th>Txs</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.height}>
                  <td style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>
                    #{b.height.toLocaleString()}
                  </td>
                  <td className="mono">{truncHash(b.hash, 6)}</td>
                  <td>
                    {b.txCount}
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

      {/* ── Paid Routes ── */}
      <div className="section-header">
        <h2 className="section-title">Revenue <span className="accent">Routes</span></h2>
        <span className="section-badge">HTTP 402</span>
      </div>
      <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Namespace</th>
              <th>Price</th>
              <th>Asset</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {PAID_ROUTES.map((r) => (
              <tr key={r.path}>
                <td>
                  <code style={{ color: "var(--sov-accent-1)" }}>{r.path}</code>
                </td>
                <td className="mono">{r.namespace}</td>
                <td style={{ fontWeight: 600 }}>{r.price}</td>
                <td>{r.asset}</td>
                <td><span className="pill pill-success">LIVE</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const PAID_ROUTES = [
  { path: "/api/v1/agent/pay-api/:provider", namespace: "fth.x402.route.agent-pay-api", price: "0.0001", asset: "UNY" },
  { path: "/api/v1/trade/verify/:trade_id", namespace: "fth.x402.route.trade-verify", price: "0.00025", asset: "UNY" },
  { path: "/api/v1/genesis/repro-pack/:suite", namespace: "fth.x402.route.genesis-repro", price: "0.0005", asset: "UNY" },
  { path: "/api/v1/invoices/export/:format", namespace: "fth.x402.route.invoice-export", price: "0.001", asset: "UNY" },
];

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
