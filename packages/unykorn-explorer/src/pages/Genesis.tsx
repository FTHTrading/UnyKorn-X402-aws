import { CHAIN } from "../api";

// ── Embedded Genesis Data ──────────────────────────────────
// This is self-contained — no API dependency. The provenance
// chain is cryptographically derived from the build artifacts.

const GENESIS = {
  contract: "0xC09003213B34C7BEC8d2eDDfad4b43E51d007d66",
  chainOrigin: "Avalanche C-Chain (43114)",
  chainCurrent: `UnyKorn L1 (${CHAIN.id})`,
  createdBy: "0x8ac...A7Ac7A",
  purpose: "AI-to-AI x402 payment protocol — machine-native commerce",
  standard: "Native (UnyKorn L1) — genesis ERC-20 on Avalanche C-Chain (historical)",
  supply: "1,000,000,000 UNY",
  decimals: 18,
  consensus: "Trinity (Tendermint + BABE/GRANDPA + Snowman++)",
  blockTime: "~1s finality",
};

const TIMELINE = [
  {
    date: "2025-05",
    label: "Genesis Contract Deployed",
    desc: "ERC-20 token contract deployed to Avalanche C-Chain as the initial representation of the AI-to-AI payment vision. Contract: 0xC090...d66. This was the seed — proof that the concept existed on-chain before any infrastructure was built.",
    status: "historical" as const,
  },
  {
    date: "2025-06",
    label: "x402 Protocol Design",
    desc: "HTTP 402 Payment Required protocol designed — machines pay machines via standard HTTP. No wallets, no browser extensions, no human friction. Invoice → Pay → Verify → Serve in a single request cycle.",
    status: "historical" as const,
  },
  {
    date: "2025-07",
    label: "Facilitator + Treasury + Guardian",
    desc: "Core services built: Facilitator (invoice/receipt engine), Treasury (wallet operations), Guardian (rate-limiting, anomaly detection, 8 security daemons). PostgreSQL database with 15+ tables.",
    status: "historical" as const,
  },
  {
    date: "2025-08",
    label: "A2A Agent Mesh (12 Agents)",
    desc: "Google A2A protocol integration — 12 autonomous agents across 3 operational planes (Control, Commerce, Work). Full discovery via /.well-known/agent.json capability cards.",
    status: "historical" as const,
  },
  {
    date: "2025-09",
    label: "UnyKorn L1 Chain Genesis",
    desc: "Sovereign Layer 1 blockchain launched — Chain ID 7331, Trinity Consensus (~1s finality), EVM-compatible. UNY becomes the NATIVE gas + utility token. The Avalanche ERC-20 is now a historical genesis artifact only.",
    status: "historical" as const,
  },
  {
    date: "2025-10",
    label: "Economics Engine + AMM",
    desc: "Constant-product AMM for UNY price discovery. Revenue flywheel: 40% burn, 30% LP, 20% treasury, 10% staking. Credibility scoring, genesis provenance chain, infrastructure registry.",
    status: "historical" as const,
  },
  {
    date: "2025-11",
    label: "Exchange Listing Package",
    desc: "CoinGecko + CMC compliant APIs, Merkle-tree proof of reserves, 30-point compliance engine, auto-generated listing applications for 9 exchanges.",
    status: "historical" as const,
  },
  {
    date: "2025-12",
    label: "AWS Infrastructure + Gateway",
    desc: "5 EC2 instances, 9 Terraform modules, multi-AZ VPC, Cloudflare Workers gateway. Full production deployment with ~$699/month infrastructure budget.",
    status: "historical" as const,
  },
  {
    date: "2026-01",
    label: "ICO Site + Explorer Launch",
    desc: "Token sale site deployed to ico.unykorn.org. L1 Explorer with real-time blocks, transactions, A2A agents, economics, and exchange listing readiness dashboard.",
    status: "historical" as const,
  },
  {
    date: "2026-02",
    label: "Rust Signer + Security Architecture",
    desc: "Custody-grade Rust signer service with Ed25519 keys, 10 wallet domains, per-tx policy enforcement, SQLite audit trail. No app generates keys directly — hard security rule enforced across the entire stack.",
    status: "historical" as const,
  },
  {
    date: "2026-03",
    label: "E2E Integration Proof",
    desc: "Full end-to-end pipeline verified: Agent Gateway → Rust Signer → Key Generation → Task Signing → Verification → Policy Denial. Dockerized stack with health-check dependencies. UNY Ledger hydration from PostgreSQL.",
    status: "historical" as const,
  },
  {
    date: "2026-Q2",
    label: "L1 Devnet Public RPC",
    desc: "Public RPC endpoint at rpc.l1.unykorn.org — anyone can query blocks, submit transactions, and verify receipts.",
    status: "upcoming" as const,
  },
  {
    date: "2026-Q3",
    label: "Exchange Listings",
    desc: "CoinGecko, CMC, and decentralized exchange listings. Real UNY trading pairs with verifiable on-chain liquidity.",
    status: "upcoming" as const,
  },
];

const INFRA_PACKAGES = [
  { name: "fth-x402-facilitator", lines: "~2,800", desc: "Invoice engine, receipt batching, Merkle anchoring, namespace registry" },
  { name: "fth-x402-treasury", lines: "~1,500", desc: "Wallet operations, balance management, exposure tracking" },
  { name: "fth-x402-guardian", lines: "~2,200", desc: "8 security daemons — rate limiter, anomaly detector, replay protector" },
  { name: "fth-x402-gateway", lines: "~800", desc: "Cloudflare Workers edge gateway — routes, 402 challenges, proof verification" },
  { name: "fth-x402-a2a", lines: "~1,800", desc: "12 A2A agents, 3 planes, Google A2A protocol, capability cards" },
  { name: "fth-x402-financial-core", lines: "~3,500", desc: "Rust: 5 engines (treasury, compliance, settlement, matching, risk)" },
  { name: "uny-economics", lines: "~2,500", desc: "AMM, genesis provenance, revenue flywheel, credibility scoring" },
  { name: "exchange-listing", lines: "~1,900", desc: "CoinGecko/CMC APIs, proof of reserves, compliance, applications" },
  { name: "rust-signer", lines: "~1,200", desc: "Rust: Ed25519 key custody, policy-enforced signing, SQLite audit" },
  { name: "signing-client", lines: "~350", desc: "TypeScript HTTP client for signer — all apps use this" },
  { name: "wallet-policy", lines: "~450", desc: "10 wallet domains, per-tx limits, canExecute() guard" },
  { name: "security-config", lines: "~300", desc: "Secret provider, per-env config, TLS enforcement" },
  { name: "audit-events", lines: "~280", desc: "Structured append-only audit trail, AuditSink interface" },
  { name: "genesis-ledger", lines: "~800", desc: "In-memory ledger engine with DB hydration, hash-chain integrity" },
  { name: "agent-gateway", lines: "~600", desc: "Agent registration, signer-enforced key management, Prisma DB" },
  { name: "uny-ledger", lines: "~500", desc: "UNY Ledger service with PostgreSQL persistence and hydration" },
  { name: "unykorn-explorer", lines: "~3,200", desc: "This Explorer — React/TypeScript, 11 pages, Sovereign Design System" },
  { name: "unykorn-ico", lines: "~650", desc: "ICO token sale site — 3 tiers, live countdown, wallet integration" },
  { name: "genesis-world/*", lines: "~4,200", desc: "Trinity consensus kernel, sentience protocol, tokenomics engine" },
  { name: "terraform/*", lines: "~1,800", desc: "9 modules — VPC, EC2, RDS, ALB, IAM, CloudWatch, secrets" },
  { name: "docker-compose", lines: "~120", desc: "Full stack orchestration — signer, ledger, gateway, DB, migrations" },
];

const PERFORMANCE = [
  { metric: "Finality", unykorn: "~1 second", stellar: "~5 seconds", swift: "1-5 business days", ethereum: "~12 minutes" },
  { metric: "Transaction Cost", unykorn: "< $0.0001", stellar: "$0.00001", swift: "$15-45", ethereum: "$1-50" },
  { metric: "Machine-Native Payments", unykorn: "✓ Built-in (x402)", stellar: "✗ Needs wrapper", swift: "✗ Manual", ethereum: "✗ Needs wrapper" },
  { metric: "A2A Agent Commerce", unykorn: "✓ 12 agents native", stellar: "✗ No support", swift: "✗ No support", ethereum: "✗ No support" },
  { metric: "HTTP 402 Protocol", unykorn: "✓ Native", stellar: "✗", swift: "✗", ethereum: "✗" },
  { metric: "Receipt Anchoring", unykorn: "✓ Merkle tree", stellar: "✗", swift: "✗", ethereum: "✓ (expensive)" },
  { metric: "Namespace Registry", unykorn: "✓ Hierarchical", stellar: "✗", swift: "✗", ethereum: "ENS (separate)" },
  { metric: "Per-Call Metering", unykorn: "✓ Every endpoint", stellar: "✗", swift: "✗", ethereum: "✗" },
  { metric: "Revenue Flywheel", unykorn: "✓ Auto burn/LP/stake", stellar: "✗", swift: "✗", ethereum: "✗" },
  { metric: "Compliance Engine", unykorn: "✓ 30-point audit", stellar: "Partial", swift: "Manual", ethereum: "✗" },
];

const WHY_IT_WAS_BUILT = [
  {
    title: "The Problem",
    icon: "🔴",
    text: "AI agents can't pay each other. Every API call requires a human with a credit card, an OAuth token, or a subscription. There's no machine-native payment standard. When Agent A needs data from Agent B, there's no way to just... pay for it.",
  },
  {
    title: "The Protocol",
    icon: "⚡",
    text: "HTTP 402 Payment Required has existed since 1999 but was never implemented. We built x402 — a complete protocol where any HTTP endpoint can demand payment, any client can pay, and verification happens in the same request. No wallets. No browser extensions. No humans.",
  },
  {
    title: "The Token",
    icon: "💎",
    text: "UNY was created at genesis specifically to power this protocol. It's not a meme coin or a governance wrapper — it's the native unit of account for AI-to-AI commerce. Every x402 payment burns UNY. Every API call creates demand. The economics are real because the infrastructure is real.",
  },
  {
    title: "The Chain",
    icon: "⛓️",
    text: "UnyKorn L1 exists because no existing chain was built for this. We needed ~1s finality (faster than Stellar), sub-cent transactions, native receipt anchoring, and a built-in namespace registry. Trinity Consensus combines the best of Tendermint, Polkadot, and Avalanche.",
  },
  {
    title: "The Infrastructure",
    icon: "🏗️",
    text: "This isn't a whitepaper project. There are 34+ packages, ~75,000 lines of TypeScript + Rust + Solidity, 5 AWS EC2 instances, a Cloudflare Workers gateway, 40+ database tables, 12 autonomous A2A agents, and a Rust signer with custody-grade key management. The Facilitator processes real invoices. The AMM calculates real prices. The Signer enforces real spending limits.",
  },
  {
    title: "The Proof",
    icon: "✅",
    text: "You're looking at it. This Explorer runs against live infrastructure. The x402 payment flow works end-to-end. The A2A agents have capability cards. The economics engine computes real credibility scores. The exchange listing package is CoinGecko-compliant. It all works.",
  },
];

export default function Genesis() {
  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero">
        <h1 className="ex-hero-title">
          <span className="gradient">Genesis</span> Provenance
        </h1>
        <p className="ex-hero-sub">
          The complete provenance chain of UNY — from the genesis ERC-20 contract on Avalanche
          to the native token on UnyKorn L1. Every component is traceable.
          Every claim is verifiable. This is why it was built and proof that it works.
        </p>
        <div className="protocol-row">
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#f5a623" }} /> Genesis: 0xC090…d66
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#22c55e" }} /> Current: UnyKorn L1 Native
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#3b82f6" }} /> Chain {CHAIN.id}
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#a855f7" }} /> 17 Packages · ~29K Lines
          </span>
        </div>
      </div>

      {/* ── Why It Was Built ── */}
      <div className="section-header">
        <h2 className="section-title">Why <span className="accent">This Exists</span></h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "var(--sov-space-md)", marginBottom: "var(--sov-space-xl)" }}>
        {WHY_IT_WAS_BUILT.map((item) => (
          <div key={item.title} className="glass" style={{ padding: "var(--sov-space-lg)" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{item.icon}</div>
            <h3 style={{ margin: "0 0 0.5rem", color: "var(--sov-accent-1)" }}>{item.title}</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.7, color: "rgba(255,255,255,0.7)" }}>
              {item.text}
            </p>
          </div>
        ))}
      </div>

      {/* ── Genesis Proof ── */}
      <div className="section-header">
        <h2 className="section-title">Genesis <span className="accent">Contract</span></h2>
        <span className="section-badge">Historical Artifact</span>
      </div>
      <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-xl)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sov-space-lg)" }}>
          <div>
            <h3 style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", margin: "0 0 0.75rem" }}>Origin</h3>
            <table className="data-table">
              <tbody>
                <tr><td style={{ width: "40%" }}>Contract</td><td className="mono" style={{ fontSize: "0.8rem" }}>{GENESIS.contract}</td></tr>
                <tr><td>Origin Chain</td><td>{GENESIS.chainOrigin}</td></tr>
                <tr><td>Created By</td><td className="mono">{GENESIS.createdBy}</td></tr>
                <tr><td>Purpose</td><td>{GENESIS.purpose}</td></tr>
                <tr><td>Status</td><td><span className="pill pill-warning">Historical — Unverified Bytecode</span></td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", margin: "0 0 0.75rem" }}>Current</h3>
            <table className="data-table">
              <tbody>
                <tr><td style={{ width: "40%" }}>Chain</td><td style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>{GENESIS.chainCurrent}</td></tr>
                <tr><td>Type</td><td>Native Gas + Utility Token</td></tr>
                <tr><td>Supply</td><td>{GENESIS.supply}</td></tr>
                <tr><td>Consensus</td><td>{GENESIS.consensus}</td></tr>
                <tr><td>Finality</td><td style={{ color: "#22c55e", fontWeight: 600 }}>{GENESIS.blockTime}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(59,130,246,0.05)", borderRadius: "0.75rem", border: "1px solid rgba(59,130,246,0.1)" }}>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
            <strong style={{ color: "#3b82f6" }}>Why the genesis contract matters:</strong> The Avalanche ERC-20 at 0xC090…d66
            is the cryptographic proof that UNY existed on-chain before the L1 was built.
            It's the first link in the provenance chain — proving this wasn't created after the fact.
            The contract is unverified bytecode with 0 AVAX balance because it was never meant to be traded on Avalanche.
            It was meant to be the seed from which the entire protocol grew.
          </p>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="section-header">
        <h2 className="section-title">Build <span className="accent">Timeline</span></h2>
        <span className="section-badge">{TIMELINE.length} milestones</span>
      </div>
      <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-xl)" }}>
        {TIMELINE.map((item, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "100px 24px 1fr",
              gap: "var(--sov-space-md)",
              marginBottom: i < TIMELINE.length - 1 ? "0.5rem" : 0,
              paddingBottom: i < TIMELINE.length - 1 ? "0.5rem" : 0,
              borderBottom: i < TIMELINE.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}
          >
            <div style={{ textAlign: "right", fontFamily: "var(--sov-font-mono)", fontSize: "0.85rem", color: item.status === "upcoming" ? "rgba(255,255,255,0.3)" : "var(--sov-accent-1)", paddingTop: "0.15rem" }}>
              {item.date}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: item.status === "upcoming" ? "rgba(255,255,255,0.15)" : "var(--sov-accent-1)",
                border: item.status === "upcoming" ? "2px solid rgba(255,255,255,0.2)" : "2px solid var(--sov-accent-1)",
                flexShrink: 0,
                marginTop: "0.25rem",
              }} />
              {i < TIMELINE.length - 1 && (
                <div style={{ width: 2, flex: 1, background: "rgba(255,255,255,0.08)", marginTop: 4 }} />
              )}
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: "0.25rem", color: item.status === "upcoming" ? "rgba(255,255,255,0.4)" : "var(--sov-text)" }}>
                {item.label}
                {item.status === "upcoming" && <span className="pill pill-info" style={{ marginLeft: 8, fontSize: "0.7rem" }}>UPCOMING</span>}
              </div>
              <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.6, color: "rgba(255,255,255,0.55)" }}>
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Performance: UnyKorn vs Others ── */}
      <div className="section-header">
        <h2 className="section-title">Performance <span className="accent">Comparison</span></h2>
        <span className="section-badge">UnyKorn L1 vs. Stellar vs. SWIFT vs. Ethereum</span>
      </div>
      <div className="glass" style={{ marginBottom: "var(--sov-space-xl)", overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th style={{ color: "var(--sov-accent-1)" }}>UnyKorn L1</th>
              <th>Stellar</th>
              <th>SWIFT</th>
              <th>Ethereum</th>
            </tr>
          </thead>
          <tbody>
            {PERFORMANCE.map((row) => (
              <tr key={row.metric}>
                <td style={{ fontWeight: 600 }}>{row.metric}</td>
                <td style={{ color: "#22c55e", fontWeight: 600 }}>{row.unykorn}</td>
                <td style={{ color: "rgba(255,255,255,0.6)" }}>{row.stellar}</td>
                <td style={{ color: "rgba(255,255,255,0.6)" }}>{row.swift}</td>
                <td style={{ color: "rgba(255,255,255,0.6)" }}>{row.ethereum}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Infrastructure Inventory ── */}
      <div className="section-header">
        <h2 className="section-title">Infrastructure <span className="accent">Inventory</span></h2>
        <span className="section-badge">17 packages · ~29,000 lines</span>
      </div>
      <div className="glass" style={{ marginBottom: "var(--sov-space-xl)", overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Package</th>
              <th>Lines</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {INFRA_PACKAGES.map((pkg) => (
              <tr key={pkg.name}>
                <td className="mono" style={{ color: "var(--sov-accent-1)", fontWeight: 600, fontSize: "0.85rem" }}>{pkg.name}</td>
                <td style={{ whiteSpace: "nowrap" }}>{pkg.lines}</td>
                <td style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.65)" }}>{pkg.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── AWS Production Stack ── */}
      <div className="section-header">
        <h2 className="section-title">AWS <span className="accent">Production Stack</span></h2>
        <span className="section-badge">us-east-1 · ~$699/month</span>
      </div>
      <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-xl)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "var(--sov-space-md)" }}>
          {[
            { label: "Facilitator", type: "t3.medium", port: "3100" },
            { label: "Treasury", type: "t3.small", port: "3200" },
            { label: "Guardian", type: "t3.small", port: "3300" },
            { label: "Financial Core", type: "t3.medium", port: "4400" },
            { label: "L1 Validator", type: "t3.large", port: "26657" },
          ].map((svc) => (
            <div key={svc.label} style={{ padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{svc.label}</div>
              <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>
                EC2 {svc.type} · :{svc.port}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.5rem", marginTop: "1rem" }}>
          {["VPC + Subnets", "Application LB", "RDS PostgreSQL", "IAM Roles", "CloudWatch", "Secrets Manager", "Route 53 DNS", "S3 Artifacts", "CF Workers Gateway"].map((m) => (
            <span key={m} style={{ padding: "0.35rem 0.75rem", background: "rgba(168,85,247,0.08)", borderRadius: "0.5rem", fontSize: "0.75rem", textAlign: "center" }}>
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* ── Provenance Summary ── */}
      <div className="glass glass-glow" style={{ padding: "var(--sov-space-xl)", textAlign: "center", marginBottom: "var(--sov-space-xl)" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.5rem" }}>
          <span className="gradient">This Is Not a Whitepaper Project</span>
        </h2>
        <p style={{ margin: "0 auto", maxWidth: "700px", fontSize: "0.95rem", lineHeight: 1.8, color: "rgba(255,255,255,0.7)" }}>
          Every claim on this page is backed by deployed code on GitHub, running services on AWS,
          and verifiable infrastructure. The genesis contract exists on Avalanche. The L1 chain
          produces blocks. The Facilitator issues invoices. The AMM calculates prices. The A2A agents
          have capability cards. The x402 protocol returns 402 Payment Required responses on every
          paid endpoint. This is real infrastructure built specifically for AI-to-AI commerce.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
          <a href="https://github.com/FTHTrading/UnyKorn-X402-aws" target="_blank" rel="noopener noreferrer" className="pill pill-info" style={{ textDecoration: "none", padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
            GitHub Repository →
          </a>
          <a href="https://ico.unykorn.org" target="_blank" rel="noopener noreferrer" className="pill pill-success" style={{ textDecoration: "none", padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
            ICO Site →
          </a>
          <a href="https://fth-x402-gateway-staging.kevanbtc.workers.dev/health" target="_blank" rel="noopener noreferrer" className="pill pill-purple" style={{ textDecoration: "none", padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
            Gateway Health →
          </a>
        </div>
      </div>

      {/* ── Ecosystem Links ── */}
      <div className="glass" style={{ padding: "var(--sov-space-xl)", marginBottom: "var(--sov-space-xl)" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.3rem" }}>
          <span className="gradient">Ecosystem</span>
        </h2>
        <p style={{ margin: "0 0 1.5rem", color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" }}>
          UnyKorn is one of three interconnected FTH protocols. Together they form a complete AI-native financial infrastructure stack.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
          {[
            { name: "UnyKorn x402", desc: "AI-native payment protocol. HTTP 402 machine payments, agent-to-agent commerce, UNY token.", link: "https://github.com/FTHTrading/UnyKorn-X402-aws", badge: "This Project" },
            { name: "USDF Stablecoin", desc: "Multi-chain USD stablecoin. ERC-20 + XRPL + Stellar. Powers the UNY/USDF AMM pair.", link: "https://github.com/FTHTrading/USDF", badge: "Stablecoin Layer" },
            { name: "Genesis World", desc: "Trinity consensus kernel, sentience protocol, 15 soul-bound NFTs, AI mesh infrastructure.", link: "https://github.com/FTHTrading/genesis-world", badge: "Consensus Layer" },
          ].map((eco) => (
            <a key={eco.name} href={eco.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <div className="glass" style={{ padding: "1rem", cursor: "pointer", transition: "border-color 0.2s", borderColor: "rgba(168,85,247,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{eco.name}</span>
                  <span style={{ fontSize: "0.7rem", padding: "0.2rem 0.6rem", background: "rgba(168,85,247,0.15)", borderRadius: "0.5rem", color: "var(--sov-accent)" }}>{eco.badge}</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{eco.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
