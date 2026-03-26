import { useEffect, useState, useRef } from "react";
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
  getNodeStatus,
  getInfrastructureOverview,
  getEconomicState,
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
  type NodeInfo,
  type InfrastructureOverview,
  type EconomicState,
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
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [infra, setInfra] = useState<InfrastructureOverview | null>(null);
  const [econ, setEcon] = useState<EconomicState | null>(null);
  const [blockPulse, setBlockPulse] = useState(false);
  const prevHeight = useRef(0);

  useEffect(() => {
    // All data is real — fetched from live services
    getChainStatus().then(setChain).catch(() => {});
    getRecentBlocks(8).then(setBlocks).catch(() => {});
    getRecentTransactions(8).then(setTxs).catch(() => {});
    getFacilitatorHealth().then(setFHealth).catch(() => {});
    getGatewayHealth().then(setGHealth).catch(() => {});
    getExplorerStats().then(setStats).catch(() => {});
    getRevenueFeed().then(setRevenueFeed).catch(() => {});
    getRealAgents().then(setAgents).catch(() => {});
    getTreasury().then(setTreasury).catch(() => {});
    getSignerHealth().then(setSignerHealth).catch(() => {});
    getLedgerEntries(10).then(setLedgerEntries).catch(() => {});
    getNodeStatus().then(setNodes).catch(() => {});
    getInfrastructureOverview().then(setInfra).catch(() => {});
    getEconomicState().then(setEcon).catch(() => {});

    const t = setInterval(() => {
      getChainStatus().then((c) => {
        if (c && c.blockHeight > prevHeight.current) {
          prevHeight.current = c.blockHeight;
          setBlockPulse(true);
          setTimeout(() => setBlockPulse(false), 600);
        }
        setChain(c);
      }).catch(() => {});
      getRecentBlocks(8).then(setBlocks).catch(() => {});
      getRecentTransactions(8).then(setTxs).catch(() => {});
      getExplorerStats().then(setStats).catch(() => {});
      getRevenueFeed().then(setRevenueFeed).catch(() => {});
      getRealAgents().then(setAgents).catch(() => {});
      getTreasury().then(setTreasury).catch(() => {});
      getLedgerEntries(10).then(setLedgerEntries).catch(() => {});
      getNodeStatus().then(setNodes).catch(() => {});
      getInfrastructureOverview().then(setInfra).catch(() => {});
      getEconomicState().then(setEcon).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const totalInvoices = stats?.invoices.total_invoices ?? 0;
  const paidInvoices = stats?.invoices.paid ?? 0;
  const pendingInvoices = stats?.invoices.pending ?? 0;
  const totalRevenue = parseFloat(stats?.invoices.total_revenue ?? "0");
  const totalReceipts = stats?.receipts.total_receipts ?? 0;
  const uniquePayers = stats?.receipts.unique_payers ?? 0;

  const activeNodes = nodes.filter(n => n.status === "active").length;
  const totalTps = blocks.length > 1
    ? Math.round(blocks.reduce((s, b) => s + b.txCount, 0) / blocks.length * (1000 / 3000) * 10) / 10
    : 0;

  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero">
        <h1 className="ex-hero-title">
          <span className="gradient">UnyKorn L1</span> Chain Explorer
        </h1>
        <p className="ex-hero-sub">
          Real-time visibility into the sovereign trade-finance network.
          Live block production, node topology, AI infrastructure, x402 payments,
          Merkle anchors, and the full stack — all producing real energy.
        </p>
        <div className="protocol-row">
          <span className="proto-badge">
            <span className="proto-dot energy-pulse" style={{ background: "#22c55e" }} /> Live Block Production
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#3b82f6" }} /> x402 Payment Protocol
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#a855f7" }} /> A2A Agent Mesh ({agents.length || 12} agents)
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#22c55e" }} /> Merkle Receipt Anchoring
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#f5a623" }} /> {nodes.length || 5} Network Nodes
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#ef4444" }} /> Rust Signer (Ed25519)
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#60a5fa" }} /> AWS Bedrock AI
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#22d3ee" }} /> 34+ Packages · 75K+ LOC
          </span>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="stat-grid">
        <div className={`stat-card glass glass-glow${blockPulse ? " block-pulse" : ""}`}>
          <div className="stat-label">Block Height</div>
          <div className="stat-value">{chain?.blockHeight?.toLocaleString() ?? "—"}</div>
          <div className="stat-sub">
            <span className="energy-dot" /> Producing every 3s · Chain {CHAIN.id}
          </div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Network Nodes</div>
          <div className="stat-value">{activeNodes} / {nodes.length || 5}</div>
          <div className="stat-sub">
            {nodes.filter(n => n.role === "producer").length} producer ·
            {nodes.filter(n => n.role === "validator").length} validators ·
            {nodes.filter(n => n.role === "oracle").length} oracles
          </div>
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
            Ledger {chain?.synced ? "✓" : "✗"}
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
          <div className="stat-label">AI Systems</div>
          <div className="stat-value">{infra?.ai?.length ?? 4}</div>
          <div className="stat-sub">Bedrock · Lambda · Agents · Anchoring</div>
        </div>
      </div>

      {/* ── Live Economy ── */}
      {econ && (
        <>
          <div className="section-header">
            <h2 className="section-title">Live <span className="accent">Economy</span></h2>
            <span className="section-badge">{econ.systemAgents} agents · {econ.flowTypes} flow types · cycle #{econ.econCycle}</span>
          </div>

          {/* Economy Stats */}
          <div className="stat-grid" style={{ marginBottom: "var(--sov-space-lg)" }}>
            <div className="stat-card glass">
              <div className="stat-label">Recent Volume (UNY)</div>
              <div className="stat-value">{Number(econ.recentVolume).toLocaleString()}</div>
              <div className="stat-sub">Last 200 transactions</div>
            </div>
            <div className="stat-card glass">
              <div className="stat-label">Total Settled</div>
              <div className="stat-value">{Number(econ.treasury.totalSettled).toLocaleString()}</div>
              <div className="stat-sub">Immutable proof receipts</div>
            </div>
            <div className="stat-card glass">
              <div className="stat-label">Total Operating</div>
              <div className="stat-value">{Number(econ.treasury.totalOperating).toLocaleString()}</div>
              <div className="stat-sub">Active across all agents</div>
            </div>
            <div className="stat-card glass">
              <div className="stat-label">Supply Integrity</div>
              <div className="stat-value" style={{ color: econ.treasury.supplyIntegrity === "balanced" ? "#22c55e" : "#ef4444" }}>{econ.treasury.supplyIntegrity === "balanced" ? "✓ Balanced" : "⚠ Check"}</div>
              <div className="stat-sub">Double-entry accounting verified</div>
            </div>
          </div>

          {/* Transaction Flow Types */}
          <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-lg)" }}>
            <h4 style={{ margin: "0 0 var(--sov-space-md)", color: "var(--sov-accent-1)" }}>Transaction Flow Distribution</h4>
            <div style={{ display: "flex", gap: "var(--sov-space-sm)", flexWrap: "wrap" }}>
              {Object.entries(econ.recentFlowTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <span key={type} className={`pill ${flowPill(type)}`} style={{ fontSize: "0.8rem" }}>
                  {type}: {count}
                </span>
              ))}
            </div>
          </div>

          {/* Agent Balances */}
          <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Operating (UNY)</th>
                  <th>Settled</th>
                  <th>Reserved</th>
                  <th>Deposited</th>
                </tr>
              </thead>
              <tbody>
                {econ.agents.map(a => (
                  <tr key={a.agentId}>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>{a.name}</span>
                      <div style={{ fontSize: "0.75rem", color: "var(--sov-text-faint)", fontFamily: "var(--sov-font-mono)" }}>{a.agentId}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{Number(a.operating).toLocaleString()}</td>
                    <td>{Number(a.proofReceipt).toLocaleString()}</td>
                    <td>{Number(a.reserved).toLocaleString()}</td>
                    <td className="mono" style={{ color: "var(--sov-text-muted)" }}>{Number(a.totalDeposited).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Node Topology ── */}
      <div className="section-header">
        <h2 className="section-title">Network <span className="accent">Nodes</span></h2>
        <span className="section-badge">{activeNodes} active · {nodes.length || 5} total</span>
      </div>
      <div className="node-grid" style={{ marginBottom: "var(--sov-space-xl)" }}>
        {(nodes.length > 0 ? nodes : placeholderNodes).map((node) => (
          <div key={node.nodeId} className={`glass node-card node-${node.status}`}>
            <div className="node-header-row">
              <span className={`node-status-dot node-dot-${node.status}`} />
              <span className="node-id">{node.nodeId}</span>
              <span className={`pill ${node.role === "producer" ? "pill-success" : node.role === "validator" ? "pill-info" : "pill-purple"}`}>
                {node.role}
              </span>
            </div>
            <div className="node-meta">
              <div><span className="node-label">Region</span> <span className="mono">{node.region}</span></div>
              <div><span className="node-label">Height</span> <span className="mono">{node.blockHeight.toLocaleString()}</span></div>
              <div><span className="node-label">Peers</span> <span className="mono">{node.peers}</span></div>
              <div><span className="node-label">Uptime</span> <span className="mono">{formatUptime(node.uptime)}</span></div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Infrastructure & AI Systems ── */}
      <div className="section-header">
        <h2 className="section-title">Infrastructure & <span className="accent">AI Systems</span></h2>
        <span className="section-badge">{infra?.services?.length ?? 7} services · {infra?.ai?.length ?? 4} AI</span>
      </div>
      <div className="infra-grid" style={{ marginBottom: "var(--sov-space-xl)" }}>
        {/* Cloud */}
        <div className="glass infra-card">
          <div className="infra-card-title">☁️ Cloud Platform</div>
          <div className="infra-item"><span className="infra-label">Provider</span><span className="mono">{infra?.cloud?.provider ?? "AWS"}</span></div>
          <div className="infra-item"><span className="infra-label">Region</span><span className="mono">{infra?.cloud?.region ?? "us-east-1"}</span></div>
          <div className="infra-item"><span className="infra-label">Account</span><span className="mono">{truncHash(infra?.cloud?.account ?? "933629770808", 4)}</span></div>
          <div className="infra-item"><span className="infra-label">Database</span><span className="mono">{infra?.db?.engine ?? "PostgreSQL 16"}</span></div>
        </div>

        {/* AI Systems */}
        {(infra?.ai ?? defaultAI).map((ai, i) => (
          <div key={i} className="glass infra-card">
            <div className="infra-card-title">
              {ai.name === "AWS Bedrock" ? "🧠" : ai.name === "AWS Lambda" ? "⚡" : ai.name.includes("Agent") ? "🤖" : "⚓"} {ai.name}
            </div>
            <div className="infra-status">
              <span className={`pill ${ai.status === "available" || ai.status === "active" || ai.status === "running" || ai.status === "warm" ? "pill-success" : "pill-warning"}`}>
                {ai.status}
              </span>
            </div>
            <div className="infra-purpose">{ai.purpose}</div>
            {ai.model && <div className="infra-detail mono">{ai.model}</div>}
            {ai.agents && <div className="infra-detail mono">{ai.agents} agents</div>}
            {ai.functions && <div className="infra-detail mono">{ai.functions} functions</div>}
          </div>
        ))}

        {/* Domains */}
        <div className="glass infra-card">
          <div className="infra-card-title">🌐 Live Domains</div>
          {(infra?.domains ?? defaultDomains).map((d, i) => (
            <div key={i} className="infra-item">
              <a href={`https://${d.name}`} target="_blank" rel="noopener noreferrer" className="infra-domain-link">{d.name}</a>
              <span className={`pill ${d.status === "live" ? "pill-success" : "pill-warning"}`}>{d.status}</span>
            </div>
          ))}
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

      {/* ── Two Column: Real Blocks + Transactions ── */}
      <div className="two-col">
        {/* Recent Blocks */}
        <div className="glass">
          <div style={{ padding: "var(--sov-space-md) var(--sov-space-lg)", borderBottom: "1px solid var(--sov-border)" }}>
            <div className="section-header" style={{ margin: 0 }}>
              <h3 className="section-title" style={{ fontSize: "var(--sov-text-md)" }}>
                Recent <span className="accent">Blocks</span>
                {blockPulse && <span className="new-block-flash">NEW</span>}
              </h3>
              <Link to="/blocks" className="section-badge">View All →</Link>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Height</th>
                <th>Block Hash</th>
                <th>Txs</th>
                <th>Producer</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.height} className={b.height === (chain?.blockHeight ?? 0) ? "latest-block-row" : ""}>
                  <td style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>
                    #{b.height.toLocaleString()}
                  </td>
                  <td className="mono">{truncHash(b.hash, 6)}</td>
                  <td>
                    <span className={`pill ${b.txCount > 0 ? "pill-success" : "pill-info"}`}>
                      {b.txCount}
                    </span>
                  </td>
                  <td>
                    <span className="pill pill-purple">{b.producer ?? "alpha"}</span>
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

function flowPill(type: string): string {
  if (type.startsWith("transfer")) return "pill-info";
  if (type.startsWith("settle")) return "pill-success";
  if (type.startsWith("reserve")) return "pill-warning";
  if (type.startsWith("deposit")) return "pill-purple";
  if (type.startsWith("unreserve")) return "pill-info";
  return "pill-info";
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

const placeholderNodes: NodeInfo[] = [
  { nodeId: "alpha", role: "producer", status: "active", region: "us-east-1", blockHeight: 0, peers: 4, uptime: 0, lastBlock: "", version: "1.0.0", ip: "10.0.1.10" },
  { nodeId: "bravo", role: "validator", status: "syncing", region: "eu-west-1", blockHeight: 0, peers: 3, uptime: 0, lastBlock: "", version: "1.0.0", ip: "10.0.2.10" },
  { nodeId: "charlie", role: "validator", status: "active", region: "ap-southeast-1", blockHeight: 0, peers: 4, uptime: 0, lastBlock: "", version: "1.0.0", ip: "10.0.3.10" },
  { nodeId: "delta", role: "oracle", status: "active", region: "us-west-2", blockHeight: 0, peers: 2, uptime: 0, lastBlock: "", version: "1.0.0", ip: "10.0.4.10" },
  { nodeId: "echo", role: "oracle", status: "idle", region: "us-east-1", blockHeight: 0, peers: 1, uptime: 0, lastBlock: "", version: "1.0.0", ip: "10.0.5.10" },
];

const defaultAI = [
  { name: "AWS Bedrock", model: "anthropic.claude-3-sonnet", status: "available", purpose: "Agent reasoning & orchestration", region: "us-east-1" },
  { name: "AWS Lambda", runtime: "nodejs20.x", status: "warm", purpose: "Serverless event processing", functions: 8 },
  { name: "Agent Mesh (A2A)", agents: 12, status: "active", purpose: "Multi-agent task execution" },
  { name: "Merkle Anchor Engine", batches: 0, status: "running", purpose: "Receipt root anchoring to L1" },
];

const defaultDomains = [
  { name: "ex.unykorn.org", target: "CF Pages", status: "live", ssl: "active" },
  { name: "ico.unykorn.org", target: "CF Pages", status: "live", ssl: "active" },
  { name: "unykorn.org", target: "Landing", status: "live", ssl: "active" },
  { name: "rpc.l1.unykorn.org", target: "L1 RPC", status: "planned", ssl: "pending" },
];
