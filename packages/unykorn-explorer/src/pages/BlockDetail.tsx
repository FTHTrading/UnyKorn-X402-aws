import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getBlockDetail, truncHash, timeAgo, type BlockDetail as BlockDetailType } from "../api";

export default function BlockDetail() {
  const { height } = useParams<{ height: string }>();
  const [block, setBlock] = useState<BlockDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!height) return;
    const h = parseInt(height, 10);
    if (isNaN(h)) { setError("Invalid block height"); return; }
    getBlockDetail(h).then(setBlock).catch(() => setError("Block not found"));
  }, [height]);

  if (error) return (
    <div className="glass" style={{ padding: "3rem", textAlign: "center" }}>
      <h2 style={{ color: "#ef4444" }}>❌ {error}</h2>
      <Link to="/blocks" style={{ color: "var(--sov-accent-1)" }}>← Back to Blocks</Link>
    </div>
  );

  if (!block) return (
    <div className="glass" style={{ padding: "3rem", textAlign: "center", color: "var(--sov-text-faint)" }}>
      Loading block #{height}…
    </div>
  );

  const verified = block.verification.hashMatch && block.verification.merkleMatch;

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          <span className="accent">Block #{block.height.toLocaleString()}</span> — Cryptographic Proof
        </h2>
        <Link to="/blocks" className="section-badge" style={{ textDecoration: "none" }}>← All Blocks</Link>
      </div>

      {/* Verification Banner */}
      <div className="glass" style={{
        padding: "var(--sov-space-lg)",
        marginBottom: "var(--sov-space-lg)",
        borderTop: `3px solid ${verified ? "#22c55e" : "#ef4444"}`,
        background: verified ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sov-space-md)", marginBottom: "var(--sov-space-sm)" }}>
          <span style={{ fontSize: "2rem" }}>{verified ? "✅" : "❌"}</span>
          <div>
            <h3 style={{ margin: 0, color: verified ? "#22c55e" : "#ef4444" }}>
              {verified ? "Block Hash & Merkle Root Verified" : "Verification Failed"}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "var(--sov-text-xs)", color: "var(--sov-text-muted)" }}>
              Independent recomputation confirms this block's cryptographic proof chain
            </p>
          </div>
        </div>
        <div style={{
          padding: "var(--sov-space-md)",
          background: "rgba(0,0,0,0.15)",
          borderRadius: "var(--sov-radius-md)",
          fontFamily: "var(--sov-font-mono)",
          fontSize: "0.75rem",
          color: "var(--sov-text-muted)",
          lineHeight: 1.6,
        }}>
          <div><strong style={{ color: "var(--sov-text-primary)" }}>Formula:</strong> {block.verification.formula}</div>
          <div><strong style={{ color: "var(--sov-text-primary)" }}>Hash Match:</strong> {block.verification.hashMatch ? "✓ YES" : "✗ NO"}</div>
          <div><strong style={{ color: "var(--sov-text-primary)" }}>Merkle Match:</strong> {block.verification.merkleMatch ? "✓ YES" : "✗ NO"}</div>
          <div><strong style={{ color: "var(--sov-text-primary)" }}>Recomputed Hash:</strong> {block.verification.recomputedHash}</div>
          <div><strong style={{ color: "var(--sov-text-primary)" }}>Recomputed Merkle:</strong> {block.verification.recomputedMerkle}</div>
        </div>
      </div>

      {/* Block Data */}
      <div className="glass" style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-lg)" }}>
        <h4 style={{ margin: "0 0 var(--sov-space-md)", color: "var(--sov-accent-1)" }}>Block Header</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "var(--sov-space-lg)" }}>
          <Field label="Height" value={`#${block.height.toLocaleString()}`} />
          <Field label="Producer" value={block.producer} pill />
          <Field label="Timestamp" value={new Date(block.timestamp).toISOString()} />
          <Field label="Transactions" value={`${block.txCount} entries sealed`} />
          <Field label="Entry Range" value={`seq ${block.entryRange[0]} → ${block.entryRange[1]}`} />
          <Field label="Time Ago" value={timeAgo(block.timestamp)} />
        </div>

        <div style={{ marginTop: "var(--sov-space-lg)" }}>
          <HashField label="Block Hash" value={block.hash} />
          <HashField label="Previous Block Hash" value={block.prevHash} />
          <HashField label="Merkle Root" value={block.merkleRoot} />
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--sov-space-lg)" }}>
          {block.height > 1 ? (
            <Link to={`/blocks/${block.height - 1}`} style={{ color: "var(--sov-accent-1)", fontWeight: 600, fontSize: "var(--sov-text-sm)" }}>
              ← Block #{(block.height - 1).toLocaleString()}
            </Link>
          ) : <span />}
          <Link to={`/blocks/${block.height + 1}`} style={{ color: "var(--sov-accent-1)", fontWeight: 600, fontSize: "var(--sov-text-sm)" }}>
            Block #{(block.height + 1).toLocaleString()} →
          </Link>
        </div>
      </div>

      {/* Entries Table */}
      {block.entries.length > 0 && (
        <div className="glass" style={{ padding: "var(--sov-space-lg)" }}>
          <h4 style={{ margin: "0 0 var(--sov-space-md)", color: "var(--sov-accent-1)" }}>
            Sealed Entries ({block.entries.length})
          </h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Type</th>
                <th>Amount (UNY)</th>
                <th>Entry Hash</th>
                <th>From</th>
                <th>To</th>
                <th>Memo</th>
              </tr>
            </thead>
            <tbody>
              {block.entries.map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>#{e.sequence}</td>
                  <td>
                    <span className={`pill ${e.memo?.startsWith("system:heartbeat") ? "pill-success" : typeClass(e.type)}`}>
                      {e.memo?.startsWith("system:heartbeat") ? "💓 heartbeat" : e.type}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{Number(e.amount).toLocaleString()}</td>
                  <td className="mono" style={{ fontSize: "0.75rem" }}>{truncHash(e.entryHash ?? "—", 8)}</td>
                  <td className="mono">{e.fromAgentId ? truncHash(e.fromAgentId, 6) : <span style={{ color: "var(--sov-text-faint)" }}>system</span>}</td>
                  <td className="mono">{e.toAgentId ? truncHash(e.toAgentId, 6) : <span style={{ color: "var(--sov-text-faint)" }}>system</span>}</td>
                  <td style={{ fontSize: "0.85rem", opacity: 0.8, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.memo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Field({ label, value, pill }: { label: string; value: string; pill?: boolean }) {
  return (
    <div>
      <div className="stat-label" style={{ marginBottom: 4 }}>{label}</div>
      {pill ? (
        <span className="pill pill-purple">{value}</span>
      ) : (
        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{value}</div>
      )}
    </div>
  );
}

function HashField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: "var(--sov-space-md)" }}>
      <div className="stat-label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{
        fontSize: "0.75rem",
        padding: "8px 12px",
        background: "rgba(0,0,0,0.15)",
        borderRadius: "var(--sov-radius-md)",
        wordBreak: "break-all",
        userSelect: "all",
      }}>{value}</div>
    </div>
  );
}

function typeClass(type: string): string {
  switch (type) {
    case "deposit": return "pill-success";
    case "withdraw": return "pill-warning";
    case "transfer": return "pill-info";
    case "settle": return "pill-purple";
    case "escrow_lock": return "pill-warning";
    case "escrow_release": return "pill-success";
    case "reserve": return "pill-info";
    default: return "pill-info";
  }
}
