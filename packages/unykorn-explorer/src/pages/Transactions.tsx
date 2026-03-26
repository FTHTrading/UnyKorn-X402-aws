import { useEffect, useState } from "react";
import { getRecentTransactions, truncHash, timeAgo, type Transaction } from "../api";

export default function Transactions() {
  const [txs, setTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    getRecentTransactions(50).then(setTxs).catch(() => {});
    const t = setInterval(() => {
      getRecentTransactions(50).then(setTxs).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          <span className="accent">Transactions</span> — UnyKorn L1
        </h2>
        <span className="section-badge">{txs.length} recent · Live from Ledger</span>
      </div>

      <div className="glass">
        <table className="data-table">
          <thead>
            <tr>
              <th>Entry Hash</th>
              <th>Seq</th>
              <th>Type</th>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx) => (
              <tr key={tx.txHash}>
                <td className="mono" style={{ color: "var(--sov-accent-1)" }}>
                  {truncHash(tx.txHash, 6)}
                </td>
                <td>#{tx.blockHeight}</td>
                <td>
                  <span className={`pill ${typeClass(tx.type)}`}>{tx.type}</span>
                </td>
                <td className="mono">{truncHash(tx.from, 6)}</td>
                <td className="mono">{truncHash(tx.to, 6)}</td>
                <td style={{ fontWeight: tx.amount !== "0" ? 600 : 400 }}>
                  {tx.amount !== "0" ? `${tx.amount} ${tx.asset}` : "—"}
                </td>
                <td>
                  <span className={`pill ${tx.status === "committed" ? "pill-success" : "pill-warning"}`}>
                    {tx.status}
                  </span>
                </td>
                <td className="mono">{timeAgo(tx.timestamp)}</td>
              </tr>
            ))}
            {txs.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--sov-text-faint)" }}>
                  No transactions yet — create ledger entries via deposit/transfer/settle
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
    case "transfer": return "pill-info";
    case "deposit": return "pill-success";
    case "withdraw": return "pill-warning";
    case "anchor": return "pill-purple";
    case "settle": return "pill-purple";
    case "escrow_lock": return "pill-warning";
    case "escrow_release": return "pill-success";
    case "reserve": return "pill-info";
    case "channel_open": return "pill-success";
    case "channel_close": return "pill-warning";
    case "credit_deposit": return "pill-success";
    default: return "pill-info";
  }
}
