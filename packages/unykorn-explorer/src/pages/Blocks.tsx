import { useEffect, useState } from "react";
import { getRecentBlocks, truncHash, timeAgo, type Block } from "../api";

export default function Blocks() {
  const [blocks, setBlocks] = useState<Block[]>([]);

  useEffect(() => {
    setBlocks(getRecentBlocks(25));
    const t = setInterval(() => setBlocks(getRecentBlocks(25)), 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          <span className="accent">Blocks</span> — UnyKorn L1
        </h2>
        <span className="section-badge">{blocks.length} shown · ~6s finality</span>
      </div>

      <div className="glass">
        <table className="data-table">
          <thead>
            <tr>
              <th>Height</th>
              <th>Block Hash</th>
              <th>Transactions</th>
              <th>Anchors</th>
              <th>Gas Used</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b.height}>
                <td style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>
                  #{b.height.toLocaleString()}
                </td>
                <td className="mono">{truncHash(b.hash, 10)}</td>
                <td>{b.txCount}</td>
                <td>
                  {b.anchorCount > 0 ? (
                    <span className="pill pill-purple">⚓ {b.anchorCount}</span>
                  ) : (
                    <span style={{ color: "var(--sov-text-faint)" }}>—</span>
                  )}
                </td>
                <td className="mono">{b.gasUsed}</td>
                <td className="mono">{timeAgo(b.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
