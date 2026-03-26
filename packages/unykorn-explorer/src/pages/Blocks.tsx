import { useEffect, useState } from "react";
import { getLedgerEntries, truncHash, timeAgo, type LedgerEntry } from "../api";

export default function Blocks() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    getLedgerEntries(50).then(setEntries).catch(() => {});
    const t = setInterval(() => {
      getLedgerEntries(50).then(setEntries).catch(() => {});
    }, 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          <span className="accent">Ledger Entries</span> — UnyKorn L1
        </h2>
        <span className="section-badge">{entries.length} shown · Live from DB</span>
      </div>

      <div className="glass">
        <table className="data-table">
          <thead>
            <tr>
              <th>Seq</th>
              <th>Entry Hash</th>
              <th>Type</th>
              <th>From</th>
              <th>To</th>
              <th>Amount (UNY)</th>
              <th>Memo</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>
                  #{e.sequence}
                </td>
                <td className="mono">{truncHash(e.entryHash ?? e.id, 10)}</td>
                <td>
                  <span className={`pill ${typeClass(e.type)}`}>{e.type}</span>
                </td>
                <td className="mono">{e.fromAgentId ? truncHash(e.fromAgentId, 8) : <span style={{ color: "var(--sov-text-faint)" }}>treasury</span>}</td>
                <td className="mono">{e.toAgentId ? truncHash(e.toAgentId, 8) : <span style={{ color: "var(--sov-text-faint)" }}>treasury</span>}</td>
                <td style={{ fontWeight: 600 }}>{Number(e.amount).toLocaleString()}</td>
                <td style={{ fontSize: "0.85rem", opacity: 0.8 }}>{e.memo ?? "—"}</td>
                <td className="mono">{timeAgo(e.timestamp)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--sov-text-faint)" }}>
                  No ledger entries yet — deposit, transfer, or settle to create entries
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
