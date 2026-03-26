import { useState, useEffect } from "react";
import { truncHash, timeAgo } from "../api";

// ── Types (matching real Rust Signer responses) ────────────

interface SignerHealth {
  status: string;
  service: string;
  uptime_secs: number;
  timestamp: string;
}

interface SignerKey {
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

interface AuditEvent {
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

const SIGNER_URL = import.meta.env.VITE_SIGNER_URL ?? "http://localhost:4050";

// ── Wallet Domain Configuration ────────────────────────────

const WALLET_DOMAINS = [
  { domain: "cold_root", label: "Cold Root", desc: "Air-gapped master key. Signs only new wallet creation and emergency rotations.", limit: "$0 per-tx", color: "#ef4444" },
  { domain: "treasury_hot", label: "Treasury Hot", desc: "Day-to-day treasury operations — refills, LP deposits, fee payments.", limit: "$10,000 per-tx", color: "#f5a623" },
  { domain: "issuance", label: "Issuance", desc: "Token minting and initial distribution. Locked after ICO ends.", limit: "$50,000 per-tx", color: "#a855f7" },
  { domain: "operations", label: "Operations", desc: "Infrastructure payments — AWS, RPC nodes, validator hosting.", limit: "$5,000 per-tx", color: "#3b82f6" },
  { domain: "staking_rewards", label: "Staking Rewards", desc: "Automated staking reward distributions.", limit: "$2,000 per-tx", color: "#22c55e" },
  { domain: "fee_collector", label: "Fee Collector", desc: "Receives x402 protocol fees. Funds the revenue flywheel.", limit: "$1,000 per-tx", color: "#60a5fa" },
  { domain: "escrow", label: "Escrow", desc: "Holds funds during A2A agent task settlement.", limit: "$5,000 per-tx", color: "#22d3ee" },
  { domain: "governance", label: "Governance", desc: "Protocol governance votes and parameter changes.", limit: "$0 per-tx", color: "#ec4899" },
  { domain: "agent_observer", label: "Agent Observer", desc: "Read-only agent keys. Can verify but never sign value transfers.", limit: "$0 per-tx", color: "#6b7280" },
  { domain: "agent_execution", label: "Agent Execution", desc: "AI agent operational keys. Used for task settlement signing.", limit: "$1,000 per-tx", color: "#3b82f6" },
];

const SECURITY_LAYERS = [
  { id: "L1", label: "Rust Signer", desc: "Ed25519 key generation, custody, policy-enforced signing. SQLite audit trail.", status: "LIVE", color: "#22c55e" },
  { id: "L2", label: "Signing Client", desc: "TypeScript HTTP client. All services use this — no direct key generation.", status: "LIVE", color: "#22c55e" },
  { id: "L3", label: "Wallet Policy", desc: "10 wallet domains with per-tx limits. canExecute() client-side guard.", status: "LIVE", color: "#22c55e" },
  { id: "L4", label: "Security Config", desc: "Per-environment secret provider. TLS enforcement in production.", status: "LIVE", color: "#22c55e" },
  { id: "L5", label: "Audit Events", desc: "Structured append-only audit trail. Every key operation logged.", status: "LIVE", color: "#22c55e" },
  { id: "L6", label: "Guardian Daemons", desc: "8 security daemons: rate limiter, anomaly detector, replay protector, etc.", status: "LIVE", color: "#22c55e" },
  { id: "L7", label: "Policy Enforcement", desc: "Per-domain tx limits, action whitelists, human-approval thresholds.", status: "LIVE", color: "#22c55e" },
  { id: "L8", label: "HSM Integration", desc: "Hardware Security Module for production cold root key custody.", status: "PLANNED", color: "#6b7280" },
];

// ── Component ──────────────────────────────────────────────

export default function Security() {
  const [health, setHealth] = useState<SignerHealth | null>(null);
  const [keys, setKeys] = useState<SignerKey[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${SIGNER_URL}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError("Signer offline"));

    fetch(`${SIGNER_URL}/keys`)
      .then((r) => r.json())
      .then((d) => setKeys(Array.isArray(d) ? d : []))
      .catch(() => {});

    fetch(`${SIGNER_URL}/audit`)
      .then((r) => r.json())
      .then((d) => setAudits(Array.isArray(d) ? d : []))
      .catch(() => {});

    const t = setInterval(() => {
      fetch(`${SIGNER_URL}/health`).then((r) => r.json()).then(setHealth).catch(() => {});
      fetch(`${SIGNER_URL}/keys`).then((r) => r.json()).then((d) => setKeys(Array.isArray(d) ? d : [])).catch(() => {});
      fetch(`${SIGNER_URL}/audit`).then((r) => r.json()).then((d) => setAudits(Array.isArray(d) ? d : [])).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      {/* Hero */}
      <div className="ex-hero">
        <h1 className="ex-hero-title">
          <span className="gradient">Security</span> Architecture
        </h1>
        <p className="ex-hero-sub">
          Custody-grade key management powered by the Rust Signer. No app generates keys directly —
          all cryptographic operations flow through a purpose-built signing service with policy enforcement
          and append-only audit trails.
        </p>
        <div className="protocol-row">
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#22c55e" }} /> Rust Signer — Ed25519
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#3b82f6" }} /> 10 Wallet Domains
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#a855f7" }} /> Policy Enforcement
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#f5a623" }} /> Append-Only Audit
          </span>
          <span className="proto-badge">
            <span className="proto-dot" style={{ background: "#ef4444" }} /> Per-Tx Limits
          </span>
        </div>
      </div>

      {/* Signer Status */}
      <div className="stat-grid">
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Signer Status</div>
          <div className="stat-value">
            {health ? "Online" : error ?? "..."}
          </div>
          <div className="stat-sub">
            {health ? `Uptime: ${Math.floor(health.uptime_secs / 3600)}h ${Math.floor((health.uptime_secs % 3600) / 60)}m` : "Connecting..."}
          </div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Managed Keys</div>
          <div className="stat-value">{keys.length}</div>
          <div className="stat-sub">Ed25519 key pairs in signer custody</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Audit Events</div>
          <div className="stat-value">{audits.length}</div>
          <div className="stat-sub">Immutable append-only trail</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Wallet Domains</div>
          <div className="stat-value">10</div>
          <div className="stat-sub">System + A2A agent domains</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Security Layers</div>
          <div className="stat-value">7 / 8</div>
          <div className="stat-sub">7 live · 1 planned (HSM)</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Hard Rule</div>
          <div className="stat-value" style={{ fontSize: "var(--sov-text-md)" }}>No Local Keys</div>
          <div className="stat-sub">Apps MUST use SigningClient</div>
        </div>
      </div>

      {/* Security Architecture Layers */}
      <div className="section-header">
        <h2 className="section-title">Security <span className="accent">Layers</span></h2>
        <span className="section-badge">8 layers · 7 live</span>
      </div>
      <div className="glass arch-diagram" style={{ marginBottom: "var(--sov-space-xl)" }}>
        {SECURITY_LAYERS.map((layer) => (
          <div
            key={layer.id}
            className="arch-layer"
            style={{
              background: `${layer.color}08`,
              border: `1px solid ${layer.color}33`,
            }}
          >
            <span className="arch-layer-id">{layer.id}</span>
            <span className="arch-layer-label">
              {layer.label}
              <span className="arch-layer-desc"> — {layer.desc}</span>
            </span>
            <span
              className={`pill ${layer.status === "LIVE" ? "pill-success" : "pill-info"}`}
              style={{ marginLeft: "auto", flexShrink: 0 }}
            >
              {layer.status}
            </span>
          </div>
        ))}
      </div>

      {/* Wallet Domain Map */}
      <div className="section-header">
        <h2 className="section-title">Wallet <span className="accent">Domains</span></h2>
        <span className="section-badge">10 domains · Per-tx policy</span>
      </div>
      <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Label</th>
              <th>Description</th>
              <th>Per-Tx Limit</th>
            </tr>
          </thead>
          <tbody>
            {WALLET_DOMAINS.map((w) => (
              <tr key={w.domain}>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: w.color }} />
                    <code style={{ color: "var(--sov-accent-1)", fontSize: "var(--sov-text-xs)" }}>{w.domain}</code>
                  </span>
                </td>
                <td style={{ fontWeight: 600, fontSize: "var(--sov-text-sm)" }}>{w.label}</td>
                <td style={{ fontSize: "var(--sov-text-xs)", color: "var(--sov-text-muted)", maxWidth: 320 }}>{w.desc}</td>
                <td>
                  <span className={`pill ${w.limit === "$0 per-tx" ? "pill-danger" : "pill-success"}`}>
                    {w.limit}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Key / Signing Flow */}
      <div className="section-header">
        <h2 className="section-title">Key <span className="accent">Lifecycle</span></h2>
        <span className="section-badge">4-stage flow</span>
      </div>
      <div className="two-col" style={{ marginBottom: "var(--sov-space-xl)" }}>
        {[
          { step: "1", title: "Generate", desc: "POST /keys/generate — domain + actor_id. Ed25519 keypair created in signer. Private key NEVER leaves the signer.", icon: "🔑", color: "#3b82f6" },
          { step: "2", title: "Sign", desc: "POST /sign — key_id + domain + action + payload. Policy evaluated (per-tx limit, action whitelist). Signature returned if allowed.", icon: "✍️", color: "#a855f7" },
          { step: "3", title: "Verify", desc: "POST /verify — public_key + payload + signature. Ed25519 verification. Can be called by any service.", icon: "✅", color: "#22c55e" },
          { step: "4", title: "Rotate", desc: "POST /keys/{id}/rotate — Revokes old key, creates new one in same domain. Audit trail links old → new.", icon: "🔄", color: "#f5a623" },
        ].map((s) => (
          <div key={s.step} className="glass glass-glow" style={{ padding: "var(--sov-space-lg)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sov-space-sm)", marginBottom: "var(--sov-space-sm)" }}>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
              <span style={{ fontWeight: 700, fontSize: "var(--sov-text-lg)" }}>
                <span style={{ color: s.color, fontFamily: "var(--sov-font-mono)", marginRight: 8 }}>#{s.step}</span>
                {s.title}
              </span>
            </div>
            <p style={{ fontSize: "var(--sov-text-sm)", color: "var(--sov-text-muted)", lineHeight: 1.7 }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Live Keys (from signer) */}
      {keys.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Managed <span className="accent">Keys</span></h2>
            <span className="section-badge">{keys.length} keys</span>
          </div>
          <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key ID</th>
                  <th>Domain</th>
                  <th>Created By</th>
                  <th>Label</th>
                  <th>Public Key</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="mono" style={{ color: "var(--sov-accent-1)" }}>{truncHash(k.id, 8)}</td>
                    <td><span className="pill pill-info">{k.domain}</span></td>
                    <td className="mono">{truncHash(k.created_by, 10)}</td>
                    <td style={{ fontSize: "0.85rem" }}>{k.label}</td>
                    <td className="mono">{truncHash(k.public_key, 8)}</td>
                    <td>
                      <span className={`pill ${k.revoked ? "pill-danger" : "pill-success"}`}>
                        {k.revoked ? "REVOKED" : "ACTIVE"}
                      </span>
                    </td>
                    <td className="mono">{timeAgo(k.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Audit Trail (from signer) */}
      {audits.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Audit <span className="accent">Trail</span></h2>
            <span className="section-badge">{audits.length} events</span>
          </div>
          <div className="glass" style={{ marginBottom: "var(--sov-space-xl)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Action</th>
                  <th>Domain</th>
                  <th>Result</th>
                  <th>Actor</th>
                  <th>Key</th>
                  <th>Reason</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {audits.slice(0, 20).map((a) => {
                  const eventColor = a.action === "generate" ? "pill-info"
                    : a.action === "sign" ? "pill-success"
                    : a.action === "sign_rejected" ? "pill-danger"
                    : "pill-warning";
                  const resultColor = a.result === "success" ? "pill-success" : "pill-danger";
                  return (
                    <tr key={a.id}>
                      <td className="mono" style={{ color: "var(--sov-text-faint)", fontSize: "0.75rem" }}>{truncHash(a.id, 6)}</td>
                      <td><span className={`pill ${eventColor}`}>{a.action}</span></td>
                      <td className="mono">{a.domain}</td>
                      <td><span className={`pill ${resultColor}`}>{a.result}</span></td>
                      <td className="mono" style={{ fontSize: "0.8rem" }}>{truncHash(a.actor_id, 8)}</td>
                      <td className="mono" style={{ color: "var(--sov-accent-1)", fontSize: "0.8rem" }}>{truncHash(a.key_id, 8)}</td>
                      <td style={{ fontSize: "0.8rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.reason}</td>
                      <td className="mono">{timeAgo(a.timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* E2E Proof */}
      <div className="section-header">
        <h2 className="section-title">E2E <span className="accent">Proven</span></h2>
        <span className="section-badge">Full pipeline verified</span>
      </div>
      <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-xl)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--sov-space-md)" }}>
          {[
            { label: "Agent Registration", detail: "Gateway → Signer → Key Generated", status: "✓ Proven" },
            { label: "Task Signing", detail: "Payload → Policy Check → Signature", status: "✓ Proven" },
            { label: "Signature Verification", detail: "Public Key + Payload → Valid", status: "✓ Proven" },
            { label: "Policy Denial", detail: "$99,999 → HTTP 403 (limit $1,000)", status: "✓ Proven" },
            { label: "Ledger Hydration", detail: "DB → In-Memory Ledger on Boot", status: "✓ Proven" },
            { label: "Agent Hydration", detail: "DB → Gateway Agent Registry", status: "✓ Proven" },
          ].map((p) => (
            <div key={p.label} style={{
              padding: "var(--sov-space-md)",
              background: "rgba(34, 197, 94, 0.04)",
              border: "1px solid rgba(34, 197, 94, 0.15)",
              borderRadius: "var(--sov-radius-sm)",
            }}>
              <div style={{ fontWeight: 600, fontSize: "var(--sov-text-sm)", marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontSize: "var(--sov-text-xs)", color: "var(--sov-text-muted)", marginBottom: 8 }}>{p.detail}</div>
              <span className="pill pill-success">{p.status}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
