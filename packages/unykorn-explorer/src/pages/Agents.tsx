import { useEffect, useState } from "react";
import { getAgents, type AgentInfo } from "../api";

const PLANE_ORDER = ["L2 — Control Plane", "L3 — Commerce Plane", "L4 — Work Plane"];
const PLANE_COLORS: Record<string, string> = {
  "L2 — Control Plane": "var(--sov-accent-1)",
  "L3 — Commerce Plane": "var(--sov-accent-2)",
  "L4 — Work Plane": "var(--sov-success)",
};

export default function Agents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    setAgents(getAgents());
  }, []);

  const grouped = PLANE_ORDER.map((plane) => ({
    plane,
    agents: agents.filter((a) => a.plane === plane),
  })).filter((g) => g.agents.length > 0);

  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero" style={{ marginBottom: "var(--sov-space-6)" }}>
        <h1 className="hero-title">
          <span className="gradient-text">A2A</span> Agent Network
        </h1>
        <p className="hero-sub">
          12 autonomous agents across 3 operational planes — orchestrated via
          Google A2A protocol with full discovery, capability cards, and x402
          payment integration.
        </p>
        <div className="protocol-badges">
          <span className="protocol-badge">A2A v0.2.1</span>
          <span className="protocol-badge">3 Planes</span>
          <span className="protocol-badge">12 Agents</span>
          <span className="protocol-badge">x402 Metered</span>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="stat-card">
          <div className="stat-label">Total Agents</div>
          <div className="stat-value">{agents.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Control Plane</div>
          <div className="stat-value" style={{ color: "var(--sov-accent-1)" }}>
            {agents.filter((a) => a.plane.includes("L2")).length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Commerce Plane</div>
          <div className="stat-value" style={{ color: "var(--sov-accent-2)" }}>
            {agents.filter((a) => a.plane.includes("L3")).length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Work Plane</div>
          <div className="stat-value" style={{ color: "var(--sov-success)" }}>
            {agents.filter((a) => a.plane.includes("L4")).length}
          </div>
        </div>
      </div>

      {/* ── Agent Groups ── */}
      {grouped.map(({ plane, agents: planeAgents }) => (
        <div key={plane}>
          <div className="section-header">
            <h2 className="section-title" style={{ borderLeft: `3px solid ${PLANE_COLORS[plane]}`, paddingLeft: "var(--sov-space-3)" }}>
              {plane}
            </h2>
            <span className="section-badge">{planeAgents.length} agents</span>
          </div>

          <div className="agent-grid">
            {planeAgents.map((agent) => (
              <div key={agent.name} className="agent-card">
                <div className="agent-header">
                  <div className="agent-icon" style={{ background: PLANE_COLORS[plane] || "var(--sov-accent-1)" }}>
                    {agentIcon(agent.role)}
                  </div>
                  <div>
                    <div className="agent-name">{agent.name}</div>
                    <div className="agent-role">{agent.role}</div>
                  </div>
                  <span className={`pill ${agent.status === "active" ? "pill-success" : "pill-warning"}`} style={{ marginLeft: "auto" }}>
                    {agent.status}
                  </span>
                </div>

                <div className="agent-skills">
                  {agent.skills.map((skill) => (
                    <span key={skill} className="agent-skill">{skill}</span>
                  ))}
                </div>

                <div className="agent-meta">
                  <span className="mono" style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                    /.well-known/agent.json
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── A2A Protocol Details ── */}
      <div className="section-header">
        <h2 className="section-title">Protocol Architecture</h2>
      </div>
      <div className="glass" style={{ padding: "var(--sov-space-5)" }}>
        <div className="arch-layers">
          <div className="arch-layer" style={{ borderColor: "var(--sov-accent-2)" }}>
            <div className="arch-label">Discovery</div>
            <div className="arch-desc">
              Every agent exposes <code>/.well-known/agent.json</code> — a capability card
              describing name, skills, supported input/output modes, and authentication
              requirements. Agents discover each other via DNS-SD or direct URL.
            </div>
          </div>
          <div className="arch-layer" style={{ borderColor: "var(--sov-accent-1)" }}>
            <div className="arch-label">Task Execution</div>
            <div className="arch-desc">
              Clients send tasks via JSON-RPC. Agents process, stream artifacts, and
              return structured results. Long-running tasks use SSE for real-time updates.
            </div>
          </div>
          <div className="arch-layer" style={{ borderColor: "var(--sov-success)" }}>
            <div className="arch-label">x402 Integration</div>
            <div className="arch-desc">
              All agent endpoints are gated with HTTP 402 Payment Required. Callers must
              submit a payment proof (via any supported rail) before the agent executes.
              Revenue flows to UnyKorn Treasury for settlement.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function agentIcon(role: string): string {
  if (role.includes("Treasury")) return "💰";
  if (role.includes("Compliance") || role.includes("Guardian") || role.includes("AML")) return "🛡️";
  if (role.includes("Oracle")) return "📡";
  if (role.includes("Settlement")) return "⚡";
  if (role.includes("Invoice")) return "📄";
  if (role.includes("Trade")) return "📊";
  if (role.includes("Anchor")) return "⚓";
  if (role.includes("Namespace")) return "🏷️";
  if (role.includes("Credit")) return "💳";
  if (role.includes("Router")) return "🔀";
  return "🤖";
}
