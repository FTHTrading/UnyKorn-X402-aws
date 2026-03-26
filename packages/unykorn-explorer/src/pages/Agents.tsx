import { useState, useEffect } from "react";
import { GATEWAY_URL, getRealAgents, getSignerKeys, truncHash, timeAgo, type RealAgent, type SignerKey } from "../api";

// ── Full A2A Agent Catalog (from fth-x402-a2a build) ──────

interface AgentCard {
  name: string;
  role: string;
  plane: string;
  planeId: string;
  skills: { name: string; desc: string; inputModes: string[]; outputModes: string[] }[];
  description: string;
  url: string;
  version: string;
  protocol: string;
  auth: string;
  status: "active" | "idle";
  lines: number;
  file: string;
}

const AGENTS: AgentCard[] = [
  // ── L2 Control Plane ──
  {
    name: "Orchestrator",
    role: "Hub Router & Goal Decomposition",
    plane: "L2 — Control Plane",
    planeId: "L2",
    skills: [
      { name: "route-task", desc: "Decompose goals into sub-tasks and dispatch to specialist agents", inputModes: ["text/plain", "application/json"], outputModes: ["application/json"] },
      { name: "aggregate-results", desc: "Collect and merge results from multiple agent executions", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "escalate", desc: "Escalate failed or ambiguous tasks to human operators", inputModes: ["text/plain"], outputModes: ["application/json"] },
    ],
    description: "Central hub agent — receives all incoming tasks, runs control-plane checks (Guardian, Compliance, Budget), decomposes into sub-tasks, dispatches to specialist agents, aggregates results. 328 lines of orchestration logic.",
    url: "/a2a/orchestrator",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 328,
    file: "agents/orchestrator.ts",
  },
  {
    name: "Guardian",
    role: "Security & Policy Enforcement",
    plane: "L2 — Control Plane",
    planeId: "L2",
    skills: [
      { name: "check-policy", desc: "Verify request against rate limits, anomaly patterns, and security policies", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "block-threat", desc: "Block suspicious requests and flag for review", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "daemon-status", desc: "Report health of all 8 security daemons", inputModes: ["text/plain"], outputModes: ["application/json"] },
    ],
    description: "Runs 8 security daemons: rate limiter, anomaly detector, replay protector, signature verifier, amount validator, expiry checker, namespace guard, fraud scorer. Every request passes through Guardian before execution.",
    url: "/a2a/guardian",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 180,
    file: "agents/control/guardian.ts",
  },
  {
    name: "Compliance",
    role: "KYC / AML / Sanctions",
    plane: "L2 — Control Plane",
    planeId: "L2",
    skills: [
      { name: "screen-entity", desc: "Run KYC/AML/sanctions screening on wallet or entity", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "check-jurisdiction", desc: "Verify transaction is permitted in jurisdiction", inputModes: ["application/json"], outputModes: ["application/json"] },
    ],
    description: "Automated compliance screening — checks every transaction participant against sanctions lists, AML databases, and jurisdictional rules. Zero human intervention needed for pass/fail decisions.",
    url: "/a2a/compliance",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 174,
    file: "agents/control/compliance.ts",
  },
  {
    name: "Budget",
    role: "Spend Control & Cost Estimation",
    plane: "L2 — Control Plane",
    planeId: "L2",
    skills: [
      { name: "check-budget", desc: "Verify spend is within policy limits", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "estimate-cost", desc: "Estimate cost of a task before execution", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "manage-policy", desc: "Create or update spend policies", inputModes: ["application/json"], outputModes: ["application/json"] },
    ],
    description: "Pre-flight spend checks for every x402 payment. Enforces per-wallet daily/monthly limits, per-namespace budgets, and per-agent cost caps. Prevents runaway AI spending.",
    url: "/a2a/budget",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 240,
    file: "agents/control/budget.ts",
  },
  // ── L3 Commerce Plane ──
  {
    name: "Quote",
    role: "Pricing Engine",
    plane: "L3 — Commerce Plane",
    planeId: "L3",
    skills: [
      { name: "get-price", desc: "Get current price for a route/namespace", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "bulk-quote", desc: "Quote multiple routes in one request", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "tier-pricing", desc: "Calculate PASS tier pricing (subscription vs pay-per-call)", inputModes: ["application/json"], outputModes: ["application/json"] },
    ],
    description: "Dynamic pricing engine — pulls prices from 9 configured routes, applies volume discounts, calculates bulk quotes, and supports PASS tier subscription pricing for high-volume consumers.",
    url: "/a2a/quote",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 158,
    file: "agents/commerce/quote.ts",
  },
  {
    name: "Payment",
    role: "x402 Flow Handler",
    plane: "L3 — Commerce Plane",
    planeId: "L3",
    skills: [
      { name: "create-invoice", desc: "Create x402 invoice for a resource", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "verify-proof", desc: "Verify payment proof and mark invoice paid", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "payment-status", desc: "Check payment status for an invoice", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "refund", desc: "Process refund for a paid invoice", inputModes: ["application/json"], outputModes: ["application/json"] },
    ],
    description: "The core x402 engine. Creates invoices, validates payment proofs (prepaid credit, channel spend, signed auth, tx hash), marks invoices paid, and issues receipts. Every paid API call flows through this agent.",
    url: "/a2a/payment",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 186,
    file: "agents/commerce/payment.ts",
  },
  {
    name: "Treasury",
    role: "Wallet & Balance Operations",
    plane: "L3 — Commerce Plane",
    planeId: "L3",
    skills: [
      { name: "check-balance", desc: "Query wallet balance and credit status", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "deposit", desc: "Process credit deposit to wallet", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "settlement-status", desc: "Check settlement status for a batch", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "exposure-report", desc: "Get treasury exposure and risk report", inputModes: ["application/json"], outputModes: ["application/json"] },
    ],
    description: "Manages all wallet operations — balance queries, credit deposits, auto-refill triggers, settlement status. Connected to the Treasury service (port 3200) for actual fund management.",
    url: "/a2a/treasury",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 174,
    file: "agents/commerce/treasury.ts",
  },
  {
    name: "Receipt",
    role: "Receipt & Merkle Anchoring",
    plane: "L3 — Commerce Plane",
    planeId: "L3",
    skills: [
      { name: "issue-receipt", desc: "Issue receipt for a verified payment", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "verify-receipt", desc: "Verify receipt Merkle proof against L1 anchor", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "receipt-history", desc: "Get receipt history for a wallet", inputModes: ["application/json"], outputModes: ["application/json"] },
    ],
    description: "Receipts are batched, Merkle-hashed, and anchored to UnyKorn L1. This agent issues receipts, builds Merkle trees for each batch, and provides verification proofs for any individual receipt.",
    url: "/a2a/receipt",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 142,
    file: "agents/commerce/receipt.ts",
  },
  // ── L4 Work Plane ──
  {
    name: "Delivery",
    role: "Artifact Delivery",
    plane: "L4 — Work Plane",
    planeId: "L4",
    skills: [
      { name: "serve-artifact", desc: "Deliver the paid resource/artifact to the caller", inputModes: ["application/json"], outputModes: ["application/json", "application/octet-stream"] },
      { name: "export", desc: "Generate export in requested format (CSV, JSON, PDF)", inputModes: ["application/json"], outputModes: ["application/json", "text/csv", "application/pdf"] },
    ],
    description: "After payment is verified, Delivery serves the actual resource. Supports streaming, bulk exports, and format conversion (CSV, JSON, PDF).",
    url: "/a2a/delivery",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 116,
    file: "agents/work/delivery.ts",
  },
  {
    name: "Search",
    role: "Namespace Lookup & Discovery",
    plane: "L4 — Work Plane",
    planeId: "L4",
    skills: [
      { name: "resolve-namespace", desc: "Resolve a fully-qualified namespace to its handler", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "discover-agents", desc: "Discover available agents and their capabilities", inputModes: ["text/plain"], outputModes: ["application/json"] },
      { name: "route-catalog", desc: "List all available paid routes with pricing", inputModes: ["text/plain"], outputModes: ["application/json"] },
    ],
    description: "Hierarchical namespace resolution — maps fth.x402.route.* to handlers, discovers agent capabilities via A2A cards, and catalogs all available paid routes.",
    url: "/a2a/search",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 142,
    file: "agents/work/search.ts",
  },
  {
    name: "Settlement",
    role: "L1 Anchoring & Finality",
    plane: "L4 — Work Plane",
    planeId: "L4",
    skills: [
      { name: "anchor-batch", desc: "Anchor receipt batch Merkle root to UnyKorn L1", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "check-finality", desc: "Check settlement finality for a transaction", inputModes: ["application/json"], outputModes: ["application/json"] },
    ],
    description: "Handles L1 anchoring — takes batched receipt Merkle roots and submits them as anchoring transactions on UnyKorn L1 for permanent, verifiable settlement.",
    url: "/a2a/settlement",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "active",
    lines: 134,
    file: "agents/work/settlement.ts",
  },
  {
    name: "Outreach",
    role: "Partner Discovery & Federation",
    plane: "L4 — Work Plane",
    planeId: "L4",
    skills: [
      { name: "discover-partners", desc: "Find potential integration partners", inputModes: ["text/plain"], outputModes: ["application/json"] },
      { name: "marketplace", desc: "List services on marketplace", inputModes: ["application/json"], outputModes: ["application/json"] },
      { name: "federate", desc: "Establish federation with external A2A networks", inputModes: ["application/json"], outputModes: ["application/json"] },
    ],
    description: "External-facing agent — discovers potential partners, lists UnyKorn services on marketplaces, and establishes federation links with other A2A networks.",
    url: "/a2a/outreach",
    version: "1.0.0",
    protocol: "Google A2A v0.2.1",
    auth: "x402 Payment Required",
    status: "idle",
    lines: 154,
    file: "agents/work/outreach.ts",
  },
];

const PLANE_ORDER = ["L2", "L3", "L4"];
const PLANE_META: Record<string, { label: string; color: string; desc: string }> = {
  L2: { label: "Control Plane", color: "#3b82f6", desc: "Security, compliance, budget — every request passes through before execution" },
  L3: { label: "Commerce Plane", color: "#a855f7", desc: "Pricing, payment, treasury, receipts — the x402 money layer" },
  L4: { label: "Work Plane", color: "#22c55e", desc: "Delivery, search, settlement, outreach — actual work gets done here" },
};

// ── Discovery Endpoints (from actual build) ────────────────

const DISCOVERY_ENDPOINTS = [
  { path: "/.well-known/agent.json", desc: "A2A Agent Card — name, version, skills, input/output modes, authentication", source: "Facilitator + Gateway" },
  { path: "/.well-known/x402-pay", desc: "x402 Payment Descriptor — rails, proof types, invoice format, verification flow", source: "Facilitator + Gateway" },
  { path: "/.well-known/ai-plugin.json", desc: "OpenAI Plugin Manifest — for ChatGPT/Copilot integration", source: "Facilitator" },
  { path: "/.well-known/openapi.json", desc: "OpenAPI 3.1 Specification — all endpoints documented with x402 pricing", source: "Facilitator" },
  { path: "/a2a/agents", desc: "Full agent registry — all 12 agents with status and capabilities", source: "Facilitator" },
  { path: "/a2a/agents/:role/card", desc: "Individual agent card by role name", source: "Facilitator" },
  { path: "/a2a/routes", desc: "All registered route rules with pattern matching", source: "Facilitator" },
  { path: "/a2a/status", desc: "Network health — agent count, event bus, task engine status", source: "Facilitator" },
];

const JSON_RPC_METHODS = [
  { method: "tasks/send", desc: "Submit a task to an agent", params: "{ id, message: { role, parts } }" },
  { method: "tasks/get", desc: "Get task status and artifacts", params: "{ id }" },
  { method: "tasks/cancel", desc: "Cancel a running task", params: "{ id }" },
  { method: "tasks/sendSubscribe", desc: "Submit task with SSE streaming", params: "{ id, message }" },
];

// ── VS Code / AI Integration ──────────────────────────────

const VSCODE_INTEGRATION = [
  { tool: "VS Code Tasks", desc: "12 pre-configured tasks: Hardhat compile, test, deploy, AWS setup, devnet/staging deploy, Terraform init/plan", file: ".vscode/tasks.json" },
  { tool: "Workspace", desc: "Multi-root workspace with master, contracts, wallet-ui, registry folders + extension recommendations", file: "unyKorn.code-workspace" },
  { tool: "GitHub Copilot", desc: "Full codebase context — Copilot can navigate all 17 packages, understand x402 payment flow, suggest agent implementations", file: "AI-native" },
  { tool: "AI Plugin", desc: "OpenAI plugin manifest at /.well-known/ai-plugin.json — ChatGPT and Copilot can discover and call UnyKorn APIs", file: "/.well-known/ai-plugin.json" },
  { tool: "OpenAPI Spec", desc: "Machine-readable OpenAPI 3.1 at /.well-known/openapi.json — any AI tool can understand every endpoint", file: "/.well-known/openapi.json" },
];

// ── Component ──────────────────────────────────────────────

export default function Agents() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"live" | "agents" | "discovery" | "vscode">("live");
  const [cardJson, setCardJson] = useState<string | null>(null);
  const [liveAgents, setLiveAgents] = useState<RealAgent[]>([]);
  const [signerKeys, setSignerKeys] = useState<SignerKey[]>([]);

  useEffect(() => {
    getRealAgents().then(setLiveAgents).catch(() => {});
    getSignerKeys().then(setSignerKeys).catch(() => {});
    const t = setInterval(() => {
      getRealAgents().then(setLiveAgents).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, []);

  const grouped = PLANE_ORDER.map((id) => ({
    id,
    ...PLANE_META[id],
    agents: AGENTS.filter((a) => a.planeId === id),
  }));

  const totalSkills = AGENTS.reduce((s, a) => s + a.skills.length, 0);
  const totalLines = AGENTS.reduce((s, a) => s + a.lines, 0);

  function showCard(agent: AgentCard) {
    const card = {
      name: agent.name,
      description: agent.description,
      url: `${GATEWAY_URL}${agent.url}`,
      version: agent.version,
      protocol: agent.protocol,
      authentication: { schemes: ["x402"] },
      capabilities: { streaming: true, pushNotifications: false },
      skills: agent.skills.map((s) => ({
        id: s.name,
        name: s.name,
        description: s.desc,
        inputModes: s.inputModes,
        outputModes: s.outputModes,
      })),
    };
    setCardJson(JSON.stringify(card, null, 2));
  }

  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero">
        <h1 className="ex-hero-title">
          <span className="gradient">A2A</span> Agent Network
        </h1>
        <p className="ex-hero-sub">
          12 autonomous agents across 3 operational planes — orchestrated via Google A2A protocol
          with full discovery (<code>/.well-known/agent.json</code>), JSON-RPC task execution,
          SSE streaming, and x402 payment integration. Every agent is a real TypeScript class
          with its own capability card, skill set, and payment gate.
        </p>
        <div className="protocol-row">
          <span className="proto-badge"><span className="proto-dot" style={{ background: "#3b82f6" }} /> Google A2A v0.2.1</span>
          <span className="proto-badge"><span className="proto-dot" style={{ background: "#a855f7" }} /> 12 Agents</span>
          <span className="proto-badge"><span className="proto-dot" style={{ background: "#22c55e" }} /> {totalSkills} Skills</span>
          <span className="proto-badge"><span className="proto-dot" style={{ background: "#f5a623" }} /> {totalLines.toLocaleString()} Lines</span>
          <span className="proto-badge"><span className="proto-dot" style={{ background: "#ef4444" }} /> x402 Metered</span>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: "var(--sov-space-lg)" }}>
        {(["live", "agents", "discovery", "vscode"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pill ${activeTab === tab ? "pill-info" : ""}`}
            style={{ cursor: "pointer", padding: "0.5rem 1.25rem", fontSize: "0.9rem", border: activeTab === tab ? undefined : "1px solid rgba(255,255,255,0.1)", background: activeTab === tab ? undefined : "transparent" }}
          >
            {tab === "live" ? `Live Agents (${liveAgents.length})` : tab === "agents" ? "12 A2A Catalog" : tab === "discovery" ? "Discovery & JSON-RPC" : "VS Code & AI"}
          </button>
        ))}
      </div>

      {/* ── Live Agents Tab (REAL from DB) ── */}
      {activeTab === "live" && (
        <>
          <div className="section-header">
            <h2 className="section-title">Live <span className="accent">Registered Agents</span></h2>
            <span className="section-badge">Real agents from Agent Gateway DB</span>
          </div>

          <div className="stat-grid" style={{ marginBottom: "var(--sov-space-lg)" }}>
            <div className="stat-card glass glass-glow"><div className="stat-label">Registered</div><div className="stat-value">{liveAgents.length}</div></div>
            <div className="stat-card glass glass-glow"><div className="stat-label">Active</div><div className="stat-value" style={{ color: "#22c55e" }}>{liveAgents.filter(a => a.status === "active").length}</div></div>
            <div className="stat-card glass glass-glow"><div className="stat-label">Signer Keys</div><div className="stat-value" style={{ color: "#a855f7" }}>{signerKeys.length}</div></div>
            <div className="stat-card glass glass-glow"><div className="stat-label">Source</div><div className="stat-value" style={{ fontSize: "0.9rem" }}>PostgreSQL</div></div>
          </div>

          {liveAgents.length === 0 ? (
            <div className="glass" style={{ padding: "2rem", textAlign: "center", color: "var(--sov-text-faint)" }}>
              No agents registered yet — register via <code>POST /agents/register</code> on the Agent Gateway (port 4010)
            </div>
          ) : (
            <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agent ID</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Tier</th>
                    <th>Status</th>
                    <th>Public Key</th>
                    <th>Daily Limit</th>
                    <th>Per-Task</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {liveAgents.map((a) => (
                    <tr key={a.id}>
                      <td className="mono" style={{ color: "var(--sov-accent-1)", fontSize: "0.8rem" }}>{truncHash(a.id, 8)}</td>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td><span className="pill pill-info">{a.role}</span></td>
                      <td><span className="pill pill-purple">{a.tier}</span></td>
                      <td><span className={`pill ${a.status === "active" ? "pill-success" : "pill-warning"}`}>{a.status}</span></td>
                      <td className="mono" style={{ fontSize: "0.75rem" }}>{truncHash(a.publicKey, 8)}</td>
                      <td style={{ fontWeight: 600 }}>{Number(a.spendLimitDaily).toLocaleString()} UNY</td>
                      <td>{Number(a.spendLimitPerTask).toLocaleString()} UNY</td>
                      <td className="mono">{timeAgo(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {signerKeys.length > 0 && (
            <>
              <div className="section-header">
                <h2 className="section-title">Managed <span className="accent">Signer Keys</span></h2>
                <span className="section-badge">From Rust Signer · Ed25519</span>
              </div>
              <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Key ID</th>
                      <th>Domain</th>
                      <th>Public Key</th>
                      <th>Label</th>
                      <th>Created By</th>
                      <th>Revoked</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signerKeys.map((k) => (
                      <tr key={k.id}>
                        <td className="mono" style={{ color: "var(--sov-accent-1)", fontSize: "0.8rem" }}>{truncHash(k.id, 8)}</td>
                        <td><span className="pill pill-purple">{k.domain}</span></td>
                        <td className="mono" style={{ fontSize: "0.75rem" }}>{truncHash(k.public_key, 8)}</td>
                        <td style={{ fontSize: "0.85rem" }}>{k.label}</td>
                        <td className="mono" style={{ fontSize: "0.8rem" }}>{truncHash(k.created_by, 10)}</td>
                        <td><span className={`pill ${k.revoked ? "pill-warning" : "pill-success"}`}>{k.revoked ? "revoked" : "active"}</span></td>
                        <td className="mono">{timeAgo(k.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ── A2A Catalog Tab (Architecture Spec) ── */}
      {activeTab === "agents" && (
        <>
          {/* Stats */}
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
            <div className="stat-card glass glass-glow"><div className="stat-label">Total Agents</div><div className="stat-value">12</div></div>
            <div className="stat-card glass glass-glow"><div className="stat-label">Control Plane</div><div className="stat-value" style={{ color: "#3b82f6" }}>4</div></div>
            <div className="stat-card glass glass-glow"><div className="stat-label">Commerce Plane</div><div className="stat-value" style={{ color: "#a855f7" }}>4</div></div>
            <div className="stat-card glass glass-glow"><div className="stat-label">Work Plane</div><div className="stat-value" style={{ color: "#22c55e" }}>4</div></div>
            <div className="stat-card glass glass-glow"><div className="stat-label">Total Skills</div><div className="stat-value">{totalSkills}</div></div>
          </div>

          {/* Agent Groups */}
          {grouped.map(({ id, label, color, desc, agents }) => (
            <div key={id}>
              <div className="section-header">
                <h2 className="section-title" style={{ borderLeft: `3px solid ${color}`, paddingLeft: "var(--sov-space-md)" }}>
                  {id} — {label}
                </h2>
                <span className="section-badge">{desc}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "var(--sov-space-md)", marginBottom: "var(--sov-space-xl)" }}>
                {agents.map((agent) => (
                  <div key={agent.name} className="glass" style={{ padding: "var(--sov-space-lg)", cursor: "pointer", transition: "border-color 0.2s", borderColor: expanded === agent.name ? color : undefined }} onClick={() => setExpanded(expanded === agent.name ? null : agent.name)}>
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <div style={{ width: 42, height: 42, borderRadius: "0.75rem", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem", flexShrink: 0 }}>
                        {agentIcon(agent.role)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "1rem" }}>{agent.name}</div>
                        <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>{agent.role}</div>
                      </div>
                      <span className={`pill ${agent.status === "active" ? "pill-success" : "pill-warning"}`}>{agent.status}</span>
                    </div>

                    {/* Skills */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      {agent.skills.map((sk) => (
                        <span key={sk.name} style={{ padding: "0.15rem 0.5rem", borderRadius: "0.5rem", fontSize: "0.7rem", background: `${color}15`, color, border: `1px solid ${color}30` }}>
                          {sk.name}
                        </span>
                      ))}
                    </div>

                    {/* Meta */}
                    <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", display: "flex", gap: "1rem" }}>
                      <span>{agent.lines} lines</span>
                      <span className="mono">{agent.file}</span>
                    </div>

                    {/* Expanded Detail */}
                    {expanded === agent.name && (
                      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <p style={{ fontSize: "0.85rem", lineHeight: 1.7, color: "rgba(255,255,255,0.65)", margin: "0 0 1rem" }}>
                          {agent.description}
                        </p>

                        <h4 style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", margin: "0 0 0.5rem" }}>Skill Details</h4>
                        <table className="data-table" style={{ fontSize: "0.8rem" }}>
                          <thead><tr><th>Skill</th><th>Description</th><th>Input</th><th>Output</th></tr></thead>
                          <tbody>
                            {agent.skills.map((sk) => (
                              <tr key={sk.name}>
                                <td className="mono" style={{ color }}>{sk.name}</td>
                                <td>{sk.desc}</td>
                                <td style={{ fontSize: "0.7rem" }}>{sk.inputModes.join(", ")}</td>
                                <td style={{ fontSize: "0.7rem" }}>{sk.outputModes.join(", ")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                          <button className="pill pill-info" style={{ cursor: "pointer", border: "none" }} onClick={(e) => { e.stopPropagation(); showCard(agent); }}>
                            View Agent Card JSON
                          </button>
                          <a href={`${GATEWAY_URL}${agent.url}`} target="_blank" rel="noopener noreferrer" className="pill pill-purple" style={{ textDecoration: "none" }}>
                            Try Endpoint →
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Discovery Tab ── */}
      {activeTab === "discovery" && (
        <>
          <div className="section-header">
            <h2 className="section-title">Discovery <span className="accent">Endpoints</span></h2>
            <span className="section-badge">{DISCOVERY_ENDPOINTS.length} endpoints</span>
          </div>
          <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
            <table className="data-table">
              <thead><tr><th>Path</th><th>Description</th><th>Source</th><th>Try</th></tr></thead>
              <tbody>
                {DISCOVERY_ENDPOINTS.map((ep) => (
                  <tr key={ep.path}>
                    <td className="mono" style={{ color: "var(--sov-accent-1)", fontSize: "0.85rem" }}>{ep.path}</td>
                    <td style={{ fontSize: "0.85rem" }}>{ep.desc}</td>
                    <td style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>{ep.source}</td>
                    <td>
                      <a href={`${GATEWAY_URL}${ep.path}`} target="_blank" rel="noopener noreferrer" className="pill pill-purple" style={{ textDecoration: "none", fontSize: "0.75rem" }}>
                        Open →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-header">
            <h2 className="section-title">JSON-RPC <span className="accent">Methods</span></h2>
            <span className="section-badge">Google A2A Protocol</span>
          </div>
          <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
            <table className="data-table">
              <thead><tr><th>Method</th><th>Description</th><th>Parameters</th></tr></thead>
              <tbody>
                {JSON_RPC_METHODS.map((m) => (
                  <tr key={m.method}>
                    <td className="mono" style={{ color: "var(--sov-accent-2)", fontWeight: 600 }}>{m.method}</td>
                    <td>{m.desc}</td>
                    <td className="mono" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>{m.params}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Example Agent Card */}
          <div className="section-header">
            <h2 className="section-title">Example <span className="accent">Agent Card</span></h2>
            <span className="section-badge">/.well-known/agent.json</span>
          </div>
          <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-xl)" }}>
            <pre style={{ margin: 0, fontSize: "0.75rem", lineHeight: 1.6, color: "rgba(255,255,255,0.7)", overflow: "auto", maxHeight: 400 }}>
{`{
  "name": "UnyKorn x402 Facilitator",
  "description": "AI-to-AI payment facilitator — x402 protocol",
  "url": "${GATEWAY_URL}",
  "version": "2.0.0",
  "protocol": "a2a/0.2.1",
  "authentication": { "schemes": ["x402"] },
  "capabilities": { "streaming": true, "pushNotifications": false },
  "skills": [
    {
      "id": "agent-pay-api",
      "name": "Agent Pay API",
      "description": "Execute pay-per-call agent API via x402",
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    },
    {
      "id": "genesis-repro-pack",
      "name": "Genesis Reproduction Pack",
      "description": "Download genesis reproduction proof pack",
      "inputModes": ["application/json"],
      "outputModes": ["application/json", "application/zip"]
    },
    ...6 more skills
  ]
}`}
            </pre>
          </div>

          {/* x402 Flow */}
          <div className="section-header">
            <h2 className="section-title">x402 <span className="accent">Payment Flow</span></h2>
          </div>
          <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-xl)" }}>
            <div style={{ fontFamily: "var(--sov-font-mono)", fontSize: "0.8rem", lineHeight: 2, color: "rgba(255,255,255,0.7)" }}>
              <div><span style={{ color: "#3b82f6" }}>1.</span> Client → <code>GET /api/v1/agent/pay-api/demo</code></div>
              <div><span style={{ color: "#3b82f6" }}>2.</span> Gateway matches route → finds price: <span style={{ color: "#22c55e" }}>0.0001 UNY</span></div>
              <div><span style={{ color: "#3b82f6" }}>3.</span> Gateway → Facilitator: <code>POST /invoices</code> (creates invoice)</div>
              <div><span style={{ color: "#ef4444" }}>4.</span> Gateway → Client: <code style={{ color: "#ef4444" }}>HTTP 402 Payment Required</code></div>
              <div style={{ paddingLeft: 24, color: "rgba(255,255,255,0.5)" }}>Body: {"{"} invoice_id, amount, asset, receiver, expires_at {"}"}</div>
              <div style={{ paddingLeft: 24, color: "rgba(255,255,255,0.5)" }}>Header: <code>X-PAYMENT-REQUIRED: base64(PaymentRequirement)</code></div>
              <div><span style={{ color: "#3b82f6" }}>5.</span> Client pays → sends proof in <code>X-PAYMENT-SIGNATURE</code> header</div>
              <div><span style={{ color: "#3b82f6" }}>6.</span> Gateway → Facilitator: <code>POST /verify</code> (validates proof)</div>
              <div><span style={{ color: "#22c55e" }}>7.</span> Facilitator: marks invoice paid, issues receipt, batches for Merkle anchor</div>
              <div><span style={{ color: "#22c55e" }}>8.</span> Gateway → Client: <code style={{ color: "#22c55e" }}>HTTP 200 OK</code> + resource data</div>
              <div><span style={{ color: "#a855f7" }}>9.</span> Revenue flywheel: 40% burn, 30% LP, 20% treasury, 10% staking</div>
              <div><span style={{ color: "#a855f7" }}>10.</span> Settlement agent anchors receipt batch Merkle root to UnyKorn L1</div>
            </div>
          </div>
        </>
      )}

      {/* ── VS Code Tab ── */}
      {activeTab === "vscode" && (
        <>
          <div className="section-header">
            <h2 className="section-title">VS Code & AI <span className="accent">Integration</span></h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--sov-space-md)", marginBottom: "var(--sov-space-xl)" }}>
            {VSCODE_INTEGRATION.map((item) => (
              <div key={item.tool} className="glass" style={{ padding: "var(--sov-space-lg)" }}>
                <h3 style={{ margin: "0 0 0.5rem", color: "var(--sov-accent-1)" }}>{item.tool}</h3>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", lineHeight: 1.6, color: "rgba(255,255,255,0.65)" }}>{item.desc}</p>
                <span className="mono" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" }}>{item.file}</span>
              </div>
            ))}
          </div>

          <div className="section-header">
            <h2 className="section-title">Task <span className="accent">Automation</span></h2>
            <span className="section-badge">12 VS Code Tasks</span>
          </div>
          <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
            <table className="data-table">
              <thead><tr><th>Task</th><th>Category</th></tr></thead>
              <tbody>
                {[
                  ["Inventory Scan", "Analysis"],
                  ["Hardhat: Compile", "Smart Contracts"],
                  ["Hardhat: Test", "Smart Contracts"],
                  ["Hardhat: Deploy", "Smart Contracts"],
                  ["Hardhat: Node", "Smart Contracts"],
                  ["Wallet UI: Dev", "Frontend"],
                  ["Wallet UI: Build", "Frontend"],
                  ["AWS: Setup Tools", "Infrastructure"],
                  ["Deploy: Devnet", "Infrastructure"],
                  ["Deploy: Staging", "Infrastructure"],
                  ["Teardown", "Infrastructure"],
                  ["Terraform: Init + Plan", "Infrastructure"],
                ].map(([task, cat]) => (
                  <tr key={task}>
                    <td style={{ fontWeight: 600 }}>{task}</td>
                    <td><span className="pill pill-info">{cat}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Prompt Engineering */}
          <div className="section-header">
            <h2 className="section-title">AI-Native <span className="accent">Development</span></h2>
          </div>
          <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-xl)" }}>
            <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", lineHeight: 1.7, color: "rgba(255,255,255,0.65)" }}>
              UnyKorn was built AI-first. The entire 34+ package, ~75,000-line codebase was developed
              using GitHub Copilot inside VS Code — from Terraform infrastructure to TypeScript services
              to Rust financial engines. The A2A protocol enables <strong>AI agents to discover, negotiate,
              and pay each other</strong> — and the development tools are themselves AI-powered.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "var(--sov-space-md)" }}>
              {[
                { label: "Copilot-Built", value: "~75K lines", desc: "TypeScript + Rust + Solidity — all AI-assisted" },
                { label: "OpenAPI Spec", value: "Machine-Readable", desc: "Any AI tool can understand every endpoint" },
                { label: "AI Plugin", value: "ChatGPT + Copilot", desc: "/.well-known/ai-plugin.json for LLM discovery" },
                { label: "Agent Cards", value: "12 Published", desc: "/.well-known/agent.json on every agent" },
              ].map((item) => (
                <div key={item.label} style={{ padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "0.75rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginBottom: "0.25rem" }}>{item.label}</div>
                  <div style={{ fontWeight: 700, color: "var(--sov-accent-1)" }}>{item.value}</div>
                  <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginTop: "0.15rem" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Card JSON Modal ── */}
      {cardJson && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }} onClick={() => setCardJson(null)}>
          <div className="glass" style={{ maxWidth: 700, width: "100%", maxHeight: "80vh", overflow: "auto", padding: "var(--sov-space-lg)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0 }}>Agent Card JSON</h3>
              <button className="pill pill-info" style={{ cursor: "pointer", border: "none" }} onClick={() => setCardJson(null)}>Close</button>
            </div>
            <pre style={{ margin: 0, fontSize: "0.75rem", lineHeight: 1.5, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap" }}>
              {cardJson}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

function agentIcon(role: string): string {
  if (role.includes("Hub")) return "🔀";
  if (role.includes("Security")) return "🛡️";
  if (role.includes("KYC") || role.includes("Compliance")) return "📋";
  if (role.includes("Budget") || role.includes("Spend")) return "💳";
  if (role.includes("Pricing")) return "💲";
  if (role.includes("x402") || role.includes("Payment")) return "💰";
  if (role.includes("Wallet") || role.includes("Treasury")) return "🏦";
  if (role.includes("Receipt") || role.includes("Merkle")) return "⚓";
  if (role.includes("Delivery") || role.includes("Artifact")) return "📦";
  if (role.includes("Namespace") || role.includes("Search")) return "🔍";
  if (role.includes("Settlement") || role.includes("Anchor")) return "⚡";
  if (role.includes("Partner") || role.includes("Outreach") || role.includes("Federation")) return "🌐";
  return "🤖";
}
