import { useEffect, useState } from "react";
import { getRecentTransactions, truncHash, timeAgo, type Transaction } from "../api";

export default function Transactions() {
  const [txs, setTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    setTxs(getRecentTransactions(30));
    const t = setInterval(() => setTxs(getRecentTransactions(30)), 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          <span className="accent">Transactions</span> — UnyKorn L1
        </h2>
        <span className="section-badge">{txs.length} recent</span>
      </div>

      <div className="glass">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tx Hash</th>
              <th>Block</th>
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
                <td>#{tx.blockHeight.toLocaleString()}</td>
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
          </tbody>
        </table>
      </div>
    </>
  );
}

function typeClass(type: string): string {
  switch (type) {
    case "transfer": return "pill-info";
    case "anchor": return "pill-purple";
    case "channel_open": return "pill-success";
    case "channel_close": return "pill-warning";
    case "credit_deposit": return "pill-success";
    default: return "pill-info";
  }
}
