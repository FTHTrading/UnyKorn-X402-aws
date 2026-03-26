import { useState } from "react";
import {
  verifyHash,
  verifyChainIntegrity,
  truncHash,
  timeAgo,
  type ChainVerification,
  type HashLookupResult,
} from "../api";
import { Link } from "react-router-dom";

export default function Verify() {
  const [hashInput, setHashInput] = useState("");
  const [lookupResult, setLookupResult] = useState<HashLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [integrity, setIntegrity] = useState<ChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const doLookup = async () => {
    if (!hashInput.trim()) return;
    setLookingUp(true);
    setLookupResult(null);
    setLookupError(null);
    try {
      const r = await verifyHash(hashInput.trim());
      if (r.found) setLookupResult(r);
      else setLookupError("Hash not found in chain. Check if the hash is correct and try again.");
    } catch {
      setLookupError("RPC error — chain may be offline.");
    }
    setLookingUp(false);
  };

  const doIntegrity = async () => {
    setVerifying(true);
    try {
      const r = await verifyChainIntegrity();
      setIntegrity(r);
    } catch {
      setIntegrity(null);
    }
    setVerifying(false);
  };

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          <span className="accent">Verify</span> — Cryptographic Proof Tools
        </h2>
        <span className="section-badge">Independent verification · Chain 7331</span>
      </div>

      {/* Hash Lookup */}
      <div className="glass" style={{ padding: "var(--sov-space-xl)", marginBottom: "var(--sov-space-xl)" }}>
        <h3 style={{ margin: "0 0 var(--sov-space-sm)", color: "var(--sov-accent-1)" }}>🔍 Hash Lookup</h3>
        <p style={{ fontSize: "var(--sov-text-sm)", color: "var(--sov-text-muted)", margin: "0 0 var(--sov-space-md)" }}>
          Paste any SHA-256 hash — block hash, entry hash, or anchor hash — to verify it exists on-chain and see its provenance.
        </p>
        <div style={{ display: "flex", gap: "var(--sov-space-sm)", marginBottom: "var(--sov-space-md)" }}>
          <input
            type="text"
            value={hashInput}
            onChange={e => setHashInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doLookup()}
            placeholder="Paste a SHA-256 hash (e.g. a1b2c3d4e5f6...)"
            style={{
              flex: 1, padding: "10px 14px",
              fontFamily: "var(--sov-font-mono)", fontSize: "0.85rem",
              background: "rgba(0,0,0,0.2)", border: "1px solid var(--sov-border)",
              borderRadius: "var(--sov-radius-md)", color: "var(--sov-text-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={doLookup}
            disabled={lookingUp || !hashInput.trim()}
            style={{
              padding: "10px 20px", borderRadius: "var(--sov-radius-md)",
              fontWeight: 700, cursor: "pointer", fontSize: "var(--sov-text-sm)",
              background: "var(--sov-accent-1)", color: "#000", border: "none",
              opacity: lookingUp || !hashInput.trim() ? 0.5 : 1,
            }}
          >
            {lookingUp ? "Looking up…" : "Verify"}
          </button>
        </div>

        {/* Lookup Result */}
        {lookupResult && (
          <div style={{
            padding: "var(--sov-space-lg)",
            background: "rgba(34,197,94,0.06)",
            borderRadius: "var(--sov-radius-md)",
            border: "1px solid rgba(34,197,94,0.2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--sov-space-md)" }}>
              <span style={{ fontSize: "1.3rem" }}>✅</span>
              <strong style={{ color: "#22c55e", fontSize: "1rem" }}>
                Found: {lookupResult.type.toUpperCase()}
              </strong>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--sov-space-md)", fontSize: "var(--sov-text-sm)" }}>
              {lookupResult.type === "block" && (
                <>
                  <LookupField label="Block Height" value={`#${lookupResult.height?.toLocaleString()}`} link={`/blocks/${lookupResult.height}`} />
                  <LookupField label="Transactions" value={`${lookupResult.txCount ?? 0} entries`} />
                  <LookupField label="Producer" value={lookupResult.producer ?? "alpha"} />
                  <LookupField label="Timestamp" value={timeAgo(lookupResult.timestamp ?? "")} />
                </>
              )}
              {lookupResult.type === "entry" && (
                <>
                  <LookupField label="Sequence" value={`#${lookupResult.sequence}`} />
                  <LookupField label="Type" value={lookupResult.entryType ?? "unknown"} />
                  <LookupField label="Amount" value={`${Number(lookupResult.amount ?? 0).toLocaleString()} UNY`} />
                  <LookupField label="Sealed in Block" value={lookupResult.blockHeight != null ? `#${lookupResult.blockHeight}` : "—"} link={lookupResult.blockHeight != null ? `/blocks/${lookupResult.blockHeight}` : undefined} />
                  <LookupField label="Timestamp" value={timeAgo(lookupResult.timestamp ?? "")} />
                </>
              )}
              {lookupResult.type === "anchor" && (
                <>
                  <LookupField label="Batch ID" value={lookupResult.batchId ?? "—"} />
                  <LookupField label="Block Height" value={lookupResult.blockHeight != null ? `#${lookupResult.blockHeight}` : "—"} link={lookupResult.blockHeight != null ? `/blocks/${lookupResult.blockHeight}` : undefined} />
                  <LookupField label="Merkle Root" value={truncHash(lookupResult.merkleRoot ?? "—", 10)} mono />
                  <LookupField label="Timestamp" value={timeAgo(lookupResult.timestamp ?? "")} />
                </>
              )}
            </div>
            <div style={{ marginTop: "var(--sov-space-md)", fontSize: "0.75rem", color: "var(--sov-text-faint)" }}>
              Full hash: <span className="mono" style={{ userSelect: "all" }}>{lookupResult.hash}</span>
            </div>
          </div>
        )}

        {lookupError && (
          <div style={{
            padding: "var(--sov-space-md)",
            background: "rgba(239,68,68,0.06)",
            borderRadius: "var(--sov-radius-md)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#ef4444",
            fontSize: "var(--sov-text-sm)",
          }}>
            ❌ {lookupError}
          </div>
        )}
      </div>

      {/* Chain Integrity */}
      <div className="glass" style={{ padding: "var(--sov-space-xl)" }}>
        <h3 style={{ margin: "0 0 var(--sov-space-sm)", color: "var(--sov-accent-1)" }}>⛓ Chain Integrity Verification</h3>
        <p style={{ fontSize: "var(--sov-text-sm)", color: "var(--sov-text-muted)", margin: "0 0 var(--sov-space-md)" }}>
          Walk the entire chain from genesis to tip, independently recomputing every block hash to verify no blocks have been tampered with.
        </p>
        <button
          onClick={doIntegrity}
          disabled={verifying}
          style={{
            padding: "12px 24px", borderRadius: "var(--sov-radius-md)",
            fontWeight: 700, cursor: "pointer", fontSize: "var(--sov-text-sm)",
            background: verifying ? "rgba(59,130,246,0.1)" : "rgba(59,130,246,0.15)",
            color: "var(--sov-accent-1)", border: "1px solid rgba(59,130,246,0.3)",
            opacity: verifying ? 0.6 : 1,
          }}
        >
          {verifying ? "Verifying entire chain…" : "⛓ Run Full Chain Verification"}
        </button>

        {integrity && (
          <div style={{
            marginTop: "var(--sov-space-lg)",
            padding: "var(--sov-space-lg)",
            borderRadius: "var(--sov-radius-md)",
            borderTop: `3px solid ${integrity.valid ? "#22c55e" : "#ef4444"}`,
            background: integrity.valid ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sov-space-md)", marginBottom: "var(--sov-space-lg)" }}>
              <span style={{ fontSize: "2rem" }}>{integrity.valid ? "✅" : "❌"}</span>
              <div>
                <h3 style={{ margin: 0, color: integrity.valid ? "#22c55e" : "#ef4444" }}>
                  {integrity.valid ? "CHAIN INTEGRITY: VERIFIED" : `CHAIN BROKEN AT BLOCK #${integrity.brokenAtHeight}`}
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "var(--sov-text-xs)", color: "var(--sov-text-muted)" }}>
                  Every block's hash = SHA256(prevHash + ":" + merkleRoot + ":" + height + ":" + timestamp)
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--sov-space-lg)" }}>
              <StatBox label="Blocks Checked" value={integrity.blocksChecked.toLocaleString()} />
              <StatBox label="Tip Height" value={`#${integrity.tipHeight.toLocaleString()}`} />
              <StatBox label="Total Transactions" value={integrity.totalTransactions.toLocaleString()} />
              <StatBox label="Chain ID" value={integrity.chainId.toString()} />
            </div>

            <div style={{ marginTop: "var(--sov-space-lg)" }}>
              <HashBox label="Genesis Block Hash" value={integrity.genesisHash} />
              <HashBox label="Chain Tip Hash" value={integrity.tipHash} />
            </div>

            <div style={{ marginTop: "var(--sov-space-md)", fontSize: "0.75rem", color: "var(--sov-text-faint)" }}>
              Verified at: {new Date(integrity.verifiedAt).toISOString()}
            </div>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="glass" style={{ padding: "var(--sov-space-xl)", marginTop: "var(--sov-space-xl)" }}>
        <h3 style={{ margin: "0 0 var(--sov-space-md)", color: "var(--sov-accent-2)" }}>How UnyKorn Chain Verification Works</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--sov-space-lg)" }}>
          <ProofStep num="1" title="Genesis Block" desc="Genesis hash = SHA256('genesis-7331'). This is the cryptographic anchor of the entire chain." />
          <ProofStep num="2" title="Merkle Root" desc="Each block computes a Merkle root from all sealed entry hashes. This proves every transaction is included without storing them all." />
          <ProofStep num="3" title="Block Hash" desc="hash = SHA256(prevHash + ':' + merkleRoot + ':' + height + ':' + timestamp). Each block is cryptographically linked to the one before it." />
          <ProofStep num="4" title="Chain Walk" desc="Integrity verification walks every block from genesis to tip, recomputing each hash and verifying it matches. Any tampering breaks the chain." />
        </div>
      </div>
    </>
  );
}

function LookupField({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--sov-text-muted)", marginBottom: 2 }}>{label}</div>
      {link ? (
        <Link to={link} style={{ fontWeight: 600, color: "var(--sov-accent-1)", textDecoration: "none" }}>{value}</Link>
      ) : (
        <div style={{ fontWeight: 600, fontFamily: mono ? "var(--sov-font-mono)" : undefined }}>{value}</div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center", padding: "var(--sov-space-md)", background: "rgba(0,0,0,0.1)", borderRadius: "var(--sov-radius-md)" }}>
      <div style={{ fontSize: "var(--sov-text-xs)", color: "var(--sov-text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--sov-text-primary)" }}>{value}</div>
    </div>
  );
}

function HashBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: "var(--sov-space-sm)" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--sov-text-muted)", marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{
        fontSize: "0.75rem", padding: "8px 12px",
        background: "rgba(0,0,0,0.15)", borderRadius: "var(--sov-radius-md)",
        wordBreak: "break-all", userSelect: "all",
      }}>{value}</div>
    </div>
  );
}

function ProofStep({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: "var(--sov-space-md)" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--sov-accent-1)", color: "#000",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: "0.85rem", flexShrink: 0,
      }}>{num}</div>
      <div>
        <strong style={{ color: "var(--sov-text-primary)" }}>{title}</strong>
        <p style={{ margin: "4px 0 0", fontSize: "var(--sov-text-xs)", color: "var(--sov-text-muted)", lineHeight: 1.5 }}>{desc}</p>
      </div>
    </div>
  );
}
