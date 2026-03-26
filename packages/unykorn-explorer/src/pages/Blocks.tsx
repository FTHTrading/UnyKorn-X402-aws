import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getRecentBlocks,
  getBlockDetail,
  verifyChainIntegrity,
  truncHash,
  timeAgo,
  type Block,
  type BlockDetail,
  type ChainVerification,
} from "../api";

export default function Blocks() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<BlockDetail | null>(null);
  const [integrity, setIntegrity] = useState<ChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    getRecentBlocks(30).then(setBlocks).catch(() => {});
    const t = setInterval(() => {
      getRecentBlocks(30).then(setBlocks).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const toggleDetail = async (height: number) => {
    if (expanded === height) { setExpanded(null); setDetail(null); return; }
    setExpanded(height);
    setDetail(null);
    const d = await getBlockDetail(height);
    setDetail(d);
  };

  const runIntegrityCheck = async () => {
    setVerifying(true);
    const result = await verifyChainIntegrity();
    setIntegrity(result);
    setVerifying(false);
  };

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          <span className="accent">Blocks</span> — UnyKorn L1 Chain 7331
        </h2>
        <div style={{ display: "flex", gap: "var(--sov-space-sm)", alignItems: "center" }}>
          <span className="section-badge">{blocks.length} blocks · Live every 3s</span>
          <button
            onClick={runIntegrityCheck}
            disabled={verifying}
            style={{
              padding: "4px 12px", borderRadius: "var(--sov-radius-full)",
              fontSize: "var(--sov-text-xs)", fontWeight: 600, cursor: "pointer",
              background: "rgba(34,197,94,0.1)", color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.3)",
            }}
          >
            {verifying ? "Verifying…" : "⛓ Verify Chain Integrity"}
          </button>
        </div>
      </div>

      {/* Integrity Result */}
      {integrity && (
        <div className={`glass ${integrity.valid ? "node-active" : "node-offline"}`} style={{ padding: "var(--sov-space-lg)", marginBottom: "var(--sov-space-lg)", position: "relative", borderTop: `3px solid ${integrity.valid ? "#22c55e" : "#ef4444"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sov-space-md)", marginBottom: "var(--sov-space-sm)" }}>
            <span style={{ fontSize: "1.5rem" }}>{integrity.valid ? "✅" : "❌"}</span>
            <h3 style={{ margin: 0, color: integrity.valid ? "#22c55e" : "#ef4444" }}>
              Chain Integrity: {integrity.valid ? "VERIFIED" : "BROKEN"}
            </h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--sov-space-md)", fontSize: "var(--sov-text-xs)" }}>
            <div><span style={{ color: "var(--sov-text-muted)" }}>Blocks Checked</span><br /><strong>{integrity.blocksChecked.toLocaleString()}</strong></div>
            <div><span style={{ color: "var(--sov-text-muted)" }}>Tip Height</span><br /><strong>#{integrity.tipHeight.toLocaleString()}</strong></div>
            <div><span style={{ color: "var(--sov-text-muted)" }}>Total Transactions</span><br /><strong>{integrity.totalTransactions.toLocaleString()}</strong></div>
            <div><span style={{ color: "var(--sov-text-muted)" }}>Genesis Hash</span><br /><span className="mono">{truncHash(integrity.genesisHash, 8)}</span></div>
            <div><span style={{ color: "var(--sov-text-muted)" }}>Tip Hash</span><br /><span className="mono">{truncHash(integrity.tipHash, 8)}</span></div>
            <div><span style={{ color: "var(--sov-text-muted)" }}>Verified At</span><br /><span className="mono">{timeAgo(integrity.verifiedAt)}</span></div>
          </div>
          <div style={{ marginTop: "var(--sov-space-sm)", fontSize: "var(--sov-text-xs)", color: "var(--sov-text-faint)" }}>
            Every block's hash = SHA256(prevHash + ":" + merkleRoot + ":" + height + ":" + timestamp). Chain verified from genesis to tip.
          </div>
        </div>
      )}

      <div className="glass">
        <table className="data-table">
          <thead>
            <tr>
              <th>Height</th>
              <th>Block Hash</th>
              <th>Transactions</th>
              <th>Producer</th>
              <th>Merkle Root</th>
              <th>Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <>
                <tr key={b.height} onClick={() => toggleDetail(b.height)} style={{ cursor: "pointer" }}
                    className={expanded === b.height ? "latest-block-row" : ""}>
                  <td style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>
                    #{b.height.toLocaleString()}
                  </td>
                  <td className="mono">{truncHash(b.hash, 8)}</td>
                  <td>
                    <span className={`pill ${b.txCount > 0 ? "pill-success" : "pill-info"}`}>
                      {b.txCount} tx{b.txCount !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td>
                    <span className="pill pill-purple">{b.producer ?? "alpha"}</span>
                  </td>
                  <td className="mono">{truncHash(b.merkleRoot ?? "—", 6)}</td>
                  <td className="mono">{timeAgo(b.timestamp)}</td>
                  <td style={{ textAlign: "center" }}>{expanded === b.height ? "▼" : "▶"}</td>
                </tr>
                {expanded === b.height && (
                  <tr key={`${b.height}-detail`}>
                    <td colSpan={7} style={{ padding: 0 }}>
                      {detail ? (
                        <div style={{ padding: "var(--sov-space-lg)", background: "rgba(59,130,246,0.03)", borderTop: "1px solid var(--sov-border)" }}>
                          <h4 style={{ margin: "0 0 var(--sov-space-md)", color: "var(--sov-accent-1)" }}>
                            Block #{detail.height} — Cryptographic Proof
                          </h4>

                          {/* Hash Chain Proof */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sov-space-lg)", marginBottom: "var(--sov-space-lg)" }}>
                            <div>
                              <div className="stat-label" style={{ marginBottom: 4 }}>Block Hash</div>
                              <div className="mono" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{detail.hash}</div>
                            </div>
                            <div>
                              <div className="stat-label" style={{ marginBottom: 4 }}>Previous Hash</div>
                              <div className="mono" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{detail.prevHash}</div>
                            </div>
                            <div>
                              <div className="stat-label" style={{ marginBottom: 4 }}>Merkle Root</div>
                              <div className="mono" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{detail.merkleRoot}</div>
                            </div>
                            <div>
                              <div className="stat-label" style={{ marginBottom: 4 }}>Entry Range</div>
                              <div className="mono" style={{ fontSize: "0.85rem" }}>seq {detail.entryRange[0]} → {detail.entryRange[1]}</div>
                            </div>
                          </div>

                          {/* Verification */}
                          <div style={{ padding: "var(--sov-space-md)", background: detail.verification.hashMatch && detail.verification.merkleMatch ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", borderRadius: "var(--sov-radius-md)", border: `1px solid ${detail.verification.hashMatch ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`, marginBottom: "var(--sov-space-md)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: "1.1rem" }}>{detail.verification.hashMatch && detail.verification.merkleMatch ? "✅" : "❌"}</span>
                              <strong style={{ color: detail.verification.hashMatch ? "#22c55e" : "#ef4444" }}>
                                {detail.verification.hashMatch && detail.verification.merkleMatch ? "Hash & Merkle Verified" : "Verification Failed"}
                              </strong>
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--sov-text-muted)", fontFamily: "var(--sov-font-mono)" }}>
                              {detail.verification.formula}
                            </div>
                          </div>

                          {/* Entries in block */}
                          {detail.entries.length > 0 && (
                            <>
                              <div className="stat-label" style={{ marginBottom: 8 }}>Entries Sealed in Block ({detail.entries.length})</div>
                              <table className="data-table" style={{ fontSize: "0.8rem" }}>
                                <thead>
                                  <tr><th>Seq</th><th>Type</th><th>Amount</th><th>Hash</th><th>Memo</th></tr>
                                </thead>
                                <tbody>
                                  {detail.entries.map(e => (
                                    <tr key={e.id}>
                                      <td>#{e.sequence}</td>
                                      <td><span className={`pill ${e.type === "reserve" && e.memo?.startsWith("system:heartbeat") ? "pill-success" : typeClass(e.type)}`}>{e.memo?.startsWith("system:heartbeat") ? "heartbeat" : e.type}</span></td>
                                      <td>{Number(e.amount).toLocaleString()}</td>
                                      <td className="mono">{truncHash(e.entryHash ?? "—", 6)}</td>
                                      <td style={{ opacity: 0.7, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.memo ?? "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )}
                        </div>
                      ) : (
                        <div style={{ padding: "var(--sov-space-lg)", textAlign: "center", color: "var(--sov-text-faint)" }}>
                          Loading block detail…
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
            {blocks.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--sov-text-faint)" }}>
                  Waiting for blocks from L1 RPC…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
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
