import { useEffect, useState } from "react";
import {
  getListingOverview,
  getListingReadiness,
  getListingTickers,
  getProofOfReserves,
  getTokenAssetInfo,
  getListingContracts,
} from "../api";

// ── Helpers ────────────────────────────────────────────────

function fmt(n: string | number | undefined, dec = 2): string {
  if (n === undefined || n === null) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return num.toLocaleString(undefined, { maximumFractionDigits: dec });
}

function ScoreBar({ score, max, label, color }: { score: number; max: number; label: string; color: string }) {
  const pct = Math.min(100, (score / max) * 100);
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
        <span>{label}</span>
        <span style={{ color }}>{fmt(score)}/{max}</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "0.5rem", height: "0.5rem", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "0.5rem", transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: "#22c55e",
    "listing-ready": "#22c55e",
    "mostly-ready": "#eab308",
    "needs-work": "#ef4444",
    pass: "#22c55e",
    partial: "#eab308",
    fail: "#ef4444",
  };
  const bg = colors[status] ?? "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.6rem",
        borderRadius: "1rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: `${bg}22`,
        color: bg,
        border: `1px solid ${bg}44`,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

// ── Listing Readiness Page ──────────────────────────────────

export default function Listing() {
  const [overview, setOverview] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [tickers, setTickers] = useState<any[]>([]);
  const [por, setPor] = useState<any>(null);
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [contracts, setContracts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getListingOverview().then(setOverview),
      getListingReadiness().then(setReadiness),
      getListingTickers().then((d) => setTickers(d || [])),
      getProofOfReserves().then(setPor),
      getTokenAssetInfo().then(setTokenInfo),
      getListingContracts().then(setContracts),
    ]).finally(() => setLoading(false));

    const t = setInterval(() => {
      getListingOverview().then(setOverview);
      getListingTickers().then((d) => setTickers(d || []));
    }, 15000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <div className="spinner" />
        <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>Loading Exchange Listing Readiness…</p>
      </div>
    );
  }

  const overallScore = readiness?.overallScore ?? overview?.readiness?.overallScore ?? 0;
  const categories = readiness?.categories ?? {};
  const exchanges = readiness?.exchangeReadiness ?? overview?.exchangeReadiness ?? [];

  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero">
        <h1 className="ex-hero-title">
          <span className="gradient">Exchange</span> Listing
        </h1>
        <p className="ex-hero-sub">
          Full CoinGecko & CMC API compliance, proof of reserves, 30-point readiness audit,
          and pre-filled listing applications for every major exchange.
        </p>
      </div>

      {/* ── Overall Score ── */}
      <div className="ex-grid-3">
        <div className="ex-card">
          <div className="ex-card-label">Overall Readiness</div>
          <div className="ex-card-value gradient" style={{ fontSize: "2.5rem" }}>
            {fmt(overallScore)}<span style={{ fontSize: '1.2rem', opacity: 0.6 }}>/100</span>
          </div>
          <StatusBadge status={readiness?.overallStatus ?? "—"} />
        </div>
        <div className="ex-card">
          <div className="ex-card-label">Proof of Reserves</div>
          <div className="ex-card-value" style={{ color: por?.isSurplus ? "#22c55e" : "#ef4444" }}>
            {fmt(por?.reserveRatio)}×
          </div>
          <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>
            ${fmt(por?.totalReservesUSD)} reserves · ${fmt(por?.totalLiabilitiesUSD)} liabilities
          </div>
        </div>
        <div className="ex-card">
          <div className="ex-card-label">Market Pairs</div>
          <div className="ex-card-value gradient">{tickers.length}</div>
          <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>
            {contracts?.totalChains ?? 0} chains · {contracts?.standard ?? "ERC-20"}
          </div>
        </div>
      </div>

      {/* ── Token Info ── */}
      {tokenInfo && (
        <section className="ex-section">
          <h2 className="ex-section-title">Token Information</h2>
          <div className="ex-grid-2">
            <div className="ex-card">
              <table className="ex-table">
                <tbody>
                  <tr><td>Name</td><td>{tokenInfo.name}</td></tr>
                  <tr><td>Symbol</td><td><strong>{tokenInfo.symbol}</strong></td></tr>
                  <tr><td>Standard</td><td>{tokenInfo.standard}</td></tr>
                  <tr><td>Max Supply</td><td>{fmt(parseFloat(tokenInfo.maxSupply))}</td></tr>
                  <tr><td>Decimals</td><td>{tokenInfo.decimals}</td></tr>
                  <tr><td>Mintable</td><td>{tokenInfo.isMintable ? "Yes" : "No ✓"}</td></tr>
                  <tr><td>Burnable</td><td>{tokenInfo.isBurnable ? "Yes ✓" : "No"}</td></tr>
                  <tr><td>Info Hash</td><td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{tokenInfo._hash?.slice(0, 24)}…</td></tr>
                </tbody>
              </table>
            </div>
            <div className="ex-card">
              <div className="ex-card-label">Contract Deployments</div>
              {contracts?.contracts?.map((c: any, i: number) => (
                <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0.5rem 0" }}>
                  <div style={{ fontWeight: 600 }}>{c.chain} (Chain {c.chainId})</div>
                  <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}>
                    {c.address}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#a855f7" }}>{c.role}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Category Scores ── */}
      <section className="ex-section">
        <h2 className="ex-section-title">Readiness by Category</h2>
        <div className="ex-grid-2">
          {Object.entries(categories).map(([cat, data]: [string, any]) => (
            <div className="ex-card" key={cat}>
              <div className="ex-card-label">{cat}</div>
              <ScoreBar
                score={data.score}
                max={data.maxScore}
                label={`${data.pass} pass / ${data.total} checks`}
                color={data.score / data.maxScore > 0.8 ? "#22c55e" : data.score / data.maxScore > 0.5 ? "#eab308" : "#ef4444"}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Exchange Grid ── */}
      <section className="ex-section">
        <h2 className="ex-section-title">Per-Exchange Readiness</h2>
        <div className="ex-card" style={{ overflowX: "auto" }}>
          <table className="ex-table">
            <thead>
              <tr>
                <th>Exchange</th>
                <th>Score</th>
                <th>Status</th>
                <th>Required Checks</th>
                <th>Missing</th>
              </tr>
            </thead>
            <tbody>
              {exchanges.map((ex: any) => (
                <tr key={ex.exchange}>
                  <td style={{ fontWeight: 600 }}>{ex.exchange}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{
                        width: "3rem",
                        height: "0.4rem",
                        borderRadius: "0.25rem",
                        background: "rgba(255,255,255,0.06)",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${ex.readinessScore}%`,
                          height: "100%",
                          borderRadius: "0.25rem",
                          background: ex.readinessScore >= 90 ? "#22c55e" : ex.readinessScore >= 70 ? "#eab308" : "#ef4444",
                        }} />
                      </div>
                      <span>{fmt(ex.readinessScore)}%</span>
                    </div>
                  </td>
                  <td><StatusBadge status={ex.status} /></td>
                  <td>{ex.totalRequired}</td>
                  <td style={{ color: ex.failingChecks > 0 ? "#ef4444" : "rgba(255,255,255,0.5)" }}>
                    {ex.failingChecks > 0 ? ex.failingChecks : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Market Tickers ── */}
      {tickers.length > 0 && (
        <section className="ex-section">
          <h2 className="ex-section-title">CoinGecko Tickers (Live)</h2>
          <div className="ex-card" style={{ overflowX: "auto" }}>
            <table className="ex-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Last Price</th>
                  <th>Bid</th>
                  <th>Ask</th>
                  <th>24h Volume (Base)</th>
                  <th>24h High</th>
                  <th>24h Low</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((t: any) => (
                  <tr key={t.ticker_id}>
                    <td style={{ fontWeight: 600 }}>{t.ticker_id}</td>
                    <td>{t.last_price}</td>
                    <td style={{ color: "#22c55e" }}>{t.bid}</td>
                    <td style={{ color: "#ef4444" }}>{t.ask}</td>
                    <td>{fmt(t.base_volume)}</td>
                    <td>{t.high}</td>
                    <td>{t.low}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Proof of Reserves ── */}
      {por && (
        <section className="ex-section">
          <h2 className="ex-section-title">Proof of Reserves</h2>
          <div className="ex-grid-3">
            <div className="ex-card">
              <div className="ex-card-label">Merkle Root</div>
              <div style={{ fontFamily: "monospace", fontSize: "0.7rem", wordBreak: "break-all", color: "#a855f7" }}>
                {por.merkleRoot}
              </div>
            </div>
            <div className="ex-card">
              <div className="ex-card-label">Reserve Ratio</div>
              <div className="ex-card-value" style={{ color: "#22c55e" }}>{fmt(por.reserveRatio)}×</div>
              <div style={{ fontSize: "0.85rem" }}>Surplus: ${fmt(por.surplusUSD)}</div>
            </div>
            <div className="ex-card">
              <div className="ex-card-label">Block Heights</div>
              {por.blockHeights && Object.entries(por.blockHeights).map(([chain, height]: [string, any]) => (
                <div key={chain} style={{ fontSize: "0.85rem", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>{chain}</span>
                  <span>#{fmt(height, 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {por.reserves && (
            <div className="ex-card" style={{ marginTop: "1rem", overflowX: "auto" }}>
              <div className="ex-card-label">Reserve Assets</div>
              <table className="ex-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Chain</th>
                    <th>Balance</th>
                    <th>Value (USD)</th>
                    <th>Address</th>
                  </tr>
                </thead>
                <tbody>
                  {por.reserves.map((r: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.asset}</td>
                      <td>{r.chain}</td>
                      <td>{fmt(r.balance)}</td>
                      <td>${fmt(r.balanceUSD)}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                        {r.address?.slice(0, 16)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Compliance Checks Detail ── */}
      {readiness?.checks && (
        <section className="ex-section">
          <h2 className="ex-section-title">All Compliance Checks ({readiness.checks.length})</h2>
          <div className="ex-card" style={{ overflowX: "auto" }}>
            <table className="ex-table">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Details</th>
                  <th>Required By</th>
                </tr>
              </thead>
              <tbody>
                {readiness.checks.map((c: any) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, minWidth: "10rem" }}>{c.requirement}</td>
                    <td style={{ fontSize: "0.8rem" }}>{c.category}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td style={{ fontSize: "0.8rem", maxWidth: "20rem" }}>{c.details}</td>
                    <td style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>
                      {c.requiredBy?.slice(0, 3).join(", ")}
                      {c.requiredBy?.length > 3 && ` +${c.requiredBy.length - 3}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── API Reference ── */}
      <section className="ex-section">
        <h2 className="ex-section-title">Exchange Integration API</h2>
        <div className="ex-grid-2">
          <div className="ex-card">
            <div className="ex-card-label">CoinGecko Standard</div>
            {["/listing/v1/pairs", "/listing/v1/tickers", "/listing/v1/orderbook?ticker_id=UNY_USDT", "/listing/v1/historical_trades?ticker_id=UNY_USDT"].map((ep) => (
              <div key={ep} style={{ fontFamily: "monospace", fontSize: "0.8rem", padding: "0.25rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                GET {ep}
              </div>
            ))}
          </div>
          <div className="ex-card">
            <div className="ex-card-label">CoinMarketCap Standard</div>
            {["/listing/v1/summary", "/listing/v1/assets"].map((ep) => (
              <div key={ep} style={{ fontFamily: "monospace", fontSize: "0.8rem", padding: "0.25rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                GET {ep}
              </div>
            ))}
            <div className="ex-card-label" style={{ marginTop: "1rem" }}>Metadata & Reserves</div>
            {["/listing/v1/asset-info", "/listing/v1/contracts", "/listing/v1/proof-of-reserves", "/listing/v1/readiness"].map((ep) => (
              <div key={ep} style={{ fontFamily: "monospace", fontSize: "0.8rem", padding: "0.25rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                GET {ep}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
