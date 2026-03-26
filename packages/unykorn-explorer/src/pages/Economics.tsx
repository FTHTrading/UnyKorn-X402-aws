import { useEffect, useState } from "react";
import {
  getEconomicsOverview,
  getAMMState,
  getFlywheelState,
  getGenesisProvenance,
  getCredibilityScore,
  getInfrastructure,
} from "../api";

// ── Helpers ────────────────────────────────────────────────

function fmt(n: string | number | undefined, dec = 2): string {
  if (n === undefined || n === null) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return num.toLocaleString(undefined, { maximumFractionDigits: dec });
}

function fmtBig(n: string | undefined): string {
  if (!n) return "—";
  const num = BigInt(n);
  const decimals = 18n;
  const whole = num / 10n ** decimals;
  return whole.toLocaleString();
}

function ScoreBar({ score, max, label, color }: { score: number; max: number; label: string; color: string }) {
  const pct = Math.min(100, (score / max) * 100);
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
        <span>{label}</span>
        <span style={{ color }}>{score}/{max}</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "0.5rem", height: "0.5rem", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "0.5rem", transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

// ── Economics Page ──────────────────────────────────────────

export default function Economics() {
  const [overview, setOverview] = useState<any>(null);
  const [ammData, setAmmData] = useState<any>(null);
  const [flywheelData, setFlywheelData] = useState<any>(null);
  const [genesisData, setGenesisData] = useState<any>(null);
  const [credData, setCredData] = useState<any>(null);
  const [infraData, setInfraData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getEconomicsOverview().then(setOverview),
      getAMMState().then(setAmmData),
      getFlywheelState().then(setFlywheelData),
      getGenesisProvenance().then(setGenesisData),
      getCredibilityScore().then(setCredData),
      getInfrastructure().then(setInfraData),
    ]).finally(() => setLoading(false));

    const t = setInterval(() => {
      getEconomicsOverview().then(setOverview);
      getAMMState().then(setAmmData);
      getCredibilityScore().then(setCredData);
    }, 15000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <div className="spinner" />
        <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>Loading Economics Engine…</p>
      </div>
    );
  }

  const amm = ammData?.pool;
  const cred = credData?.score;
  const fund = credData?.fundamentals;
  const reserves = credData?.reserves;
  const flywheel = flywheelData?.state;
  const config = flywheelData?.config;
  const genesis = genesisData?.provenance;
  const verification = genesisData?.verification;
  const infra = infraData;

  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero">
        <h1 className="ex-hero-title">
          <span className="gradient">UNY</span> Economics
        </h1>
        <p className="ex-hero-sub">
          AMM price discovery, genesis provenance, revenue flywheel, and credibility scoring.
          Every metric is computed from real infrastructure — transparent by design.
        </p>
      </div>

      {/* ── Credibility Score ── */}
      {cred && (
        <section className="glass glass-glow" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Credibility Score</span>
            <span style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: cred.totalScore >= 70 ? "#22c55e" : cred.totalScore >= 40 ? "#f5a623" : "#ef4444"
            }}>
              {cred.totalScore}/100
            </span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <ScoreBar score={cred.categories?.infrastructure ?? 0} max={25} label="Infrastructure" color="#3b82f6" />
              <ScoreBar score={cred.categories?.tokenomics ?? 0} max={25} label="Tokenomics" color="#a855f7" />
              <ScoreBar score={cred.categories?.revenue ?? 0} max={25} label="Revenue" color="#22c55e" />
              <ScoreBar score={cred.categories?.governance ?? 0} max={25} label="Governance" color="#f5a623" />
            </div>
            <div>
              <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", marginBottom: "0.5rem" }}>Assessment</p>
              <p style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>{cred.assessment}</p>
              {cred.strengths?.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <p style={{ fontSize: "0.8rem", color: "#22c55e", marginBottom: "0.25rem" }}>Strengths</p>
                  {cred.strengths.map((s: string, i: number) => (
                    <span key={i} style={{ display: "inline-block", background: "rgba(34,197,94,0.1)", color: "#22c55e", padding: "0.15rem 0.5rem", borderRadius: "0.5rem", fontSize: "0.75rem", marginRight: "0.35rem", marginBottom: "0.25rem" }}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Stats Grid ── */}
      <div className="stat-grid">
        <div className="stat-card glass glass-glow">
          <div className="stat-label">UNY Price</div>
          <div className="stat-value">${amm ? fmt(amm.priceUNY, 6) : "—"}</div>
          <div className="stat-sub">From AMM pool</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Pool Liquidity</div>
          <div className="stat-value">{amm ? fmtBig(amm.reserveUSDf) : "—"} USD</div>
          <div className="stat-sub">{amm ? fmtBig(amm.reserveUNY) : "—"} UNY</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Total Burned</div>
          <div className="stat-value">{amm ? fmtBig(amm.totalBurned) : "—"} UNY</div>
          <div className="stat-sub">Permanent deflation</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Flywheel Cycles</div>
          <div className="stat-value">{flywheel?.totalCycles ?? "—"}</div>
          <div className="stat-sub">{flywheel ? fmt(flywheel.dailyBurnRateUNY) : "—"} UNY/day burn</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Infrastructure</div>
          <div className="stat-value">{infra?.count ?? "—"}</div>
          <div className="stat-sub">Registered components</div>
        </div>
        <div className="stat-card glass glass-glow">
          <div className="stat-label">Reserve Ratio</div>
          <div className="stat-value">{reserves?.attestation?.reserveRatio ? fmt(reserves.attestation.reserveRatio * 100) + "%" : "—"}</div>
          <div className="stat-sub">Min: 20% (constitutional)</div>
        </div>
      </div>

      {/* ── AMM Pool Details ── */}
      {ammData && (
        <section className="glass" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem" }}>
            <span className="gradient">AMM Pool</span> — UNY/USD
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <div>
              <table className="ex-table">
                <tbody>
                  <tr><td>Fee Rate</td><td>{ammData.pool?.feeRate ?? "0.30%"}</td></tr>
                  <tr><td>Fee Split</td><td>{ammData.pool?.feeSplit ?? "50/50 LP/Protocol"}</td></tr>
                  <tr><td>Cumulative Volume</td><td>{fmtBig(amm?.cumulativeVolumeUSDf)} USD</td></tr>
                  <tr><td>Cumulative Fees</td><td>{fmtBig(amm?.cumulativeFeesUSDf)} USD</td></tr>
                  <tr><td>Protocol Fees (pending burn)</td><td>{ammData.protocolFees ? fmtBig(ammData.protocolFees) : "—"}</td></tr>
                  <tr><td>LP Token Supply</td><td>{amm?.totalLPShares ? fmtBig(amm.totalLPShares) : "—"}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <h3 style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", margin: "0 0 0.5rem" }}>External LP (Production)</h3>
              <table className="ex-table">
                <tbody>
                  <tr><td>Platform</td><td>{ammData.externalLP?.platform}</td></tr>
                  <tr><td>Chain</td><td>{ammData.externalLP?.chain}</td></tr>
                  <tr><td>Pools</td><td>{ammData.externalLP?.pools?.join(", ")}</td></tr>
                  <tr><td>Contract</td><td>{ammData.externalLP?.contract}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Revenue Flywheel ── */}
      {flywheel && (
        <section className="glass" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem" }}>
            <span className="gradient">Revenue Flywheel</span>
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", marginBottom: "1rem" }}>
            x402 payments → 40% burn + 30% LP + 20% treasury + 10% staking
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1rem" }}>
            {[
              { label: "Burn", pct: config?.burnShareBps ? config.burnShareBps / 100 : 40, color: "#ef4444", val: flywheel.totalBurnedUNY },
              { label: "LP", pct: config?.lpShareBps ? config.lpShareBps / 100 : 30, color: "#3b82f6", val: flywheel.totalLPProvidedUNY },
              { label: "Treasury", pct: config?.treasuryShareBps ? config.treasuryShareBps / 100 : 20, color: "#f5a623", val: flywheel.totalTreasuryUNY },
              { label: "Staking", pct: config?.stakingShareBps ? config.stakingShareBps / 100 : 10, color: "#a855f7", val: flywheel.totalStakingUNY },
            ].map(({ label, pct, color, val }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{pct}%</div>
                <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>{label}</div>
                <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>{fmt(val)} UNY</div>
              </div>
            ))}
          </div>
          <table className="ex-table">
            <tbody>
              <tr><td>Total Revenue Collected</td><td>{fmt(flywheel.totalRevenueCollectedUNY)} UNY</td></tr>
              <tr><td>Total Cycles</td><td>{flywheel.totalCycles}</td></tr>
              <tr><td>Avg Revenue per Cycle</td><td>{fmt(flywheel.avgRevenuePerCycleUNY)} UNY</td></tr>
              <tr><td>Pending Revenue</td><td>{fmt(flywheel.pendingRevenueUNY)} UNY</td></tr>
            </tbody>
          </table>

          {/* Flywheel Mechanism */}
          {flywheelData?.howItWorks && (
            <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(255,255,255,0.03)", borderRadius: "0.75rem" }}>
              <h3 style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", margin: "0 0 0.5rem" }}>How It Works</h3>
              <ol style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8rem", lineHeight: 1.8, color: "rgba(255,255,255,0.7)" }}>
                {Object.values(flywheelData.howItWorks).map((step: any, i: number) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* ── Token Fundamentals ── */}
      {fund && (
        <section className="glass" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem" }}>
            <span className="gradient">Token Fundamentals</span>
          </h2>
          <div className="stat-grid">
            <div className="stat-card glass">
              <div className="stat-label">Genesis Supply</div>
              <div className="stat-value">{fund.genesisSupply}</div>
            </div>
            <div className="stat-card glass">
              <div className="stat-label">Current Supply</div>
              <div className="stat-value">{fund.currentSupply}</div>
            </div>
            <div className="stat-card glass">
              <div className="stat-label">Market Cap</div>
              <div className="stat-value">${fund.marketCapUSDf ?? fund.marketCapUSD}</div>
            </div>
            <div className="stat-card glass">
              <div className="stat-label">FDV</div>
              <div className="stat-value">${fund.fdvUSDf ?? fund.fdvUSD}</div>
            </div>
            <div className="stat-card glass">
              <div className="stat-label">Burn Rate</div>
              <div className="stat-value">{fmt(fund.burnRatePercent, 4)}%</div>
            </div>
            <div className="stat-card glass">
              <div className="stat-label">Active Chains</div>
              <div className="stat-value">{fund.activeChains}</div>
            </div>
          </div>
        </section>
      )}

      {/* ── Genesis Provenance ── */}
      {genesis && (
        <section className="glass" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span><span className="gradient">Genesis Provenance</span></span>
            <span style={{
              fontSize: "0.8rem",
              padding: "0.25rem 0.75rem",
              borderRadius: "1rem",
              background: verification?.chainHashValid ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              color: verification?.chainHashValid ? "#22c55e" : "#ef4444",
            }}>
              {verification?.chainHashValid ? "✓ Chain Hash Valid" : "✗ Invalid"}
            </span>
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <div>
              <h3 style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", margin: "0 0 0.5rem" }}>Genesis Proof</h3>
              <table className="ex-table">
                <tbody>
                  <tr><td>Chain</td><td>{genesis.genesis?.chainName ?? "UnyKorn L1"} ({genesis.genesis?.chainId})</td></tr>
                  <tr><td>Token</td><td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{genesis.genesis?.tokenContract}</td></tr>
                  <tr><td>Standard</td><td>{genesis.genesis?.standard}</td></tr>
                  <tr>
                    <td>Seed Hash</td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.7rem", wordBreak: "break-all" }}>
                      {verification?.seedHash?.slice(0, 32)}…
                    </td>
                  </tr>
                </tbody>
              </table>

              <h3 style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", margin: "1rem 0 0.5rem" }}>Constitutional Invariants</h3>
              <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8rem", lineHeight: 1.8, color: "rgba(255,255,255,0.7)" }}>
                {genesis.genesis?.constitutionalInvariants?.map((inv: string, i: number) => (
                  <li key={i}>{inv}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", margin: "0 0 0.5rem" }}>
                Cross-Chain Verification ({verification?.crossChainLinks ?? 0} links)
              </h3>
              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                {genesis.genesis?.verificationLinks?.map((link: any, i: number) => (
                  <div key={i} style={{
                    padding: "0.5rem 0.75rem",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    fontSize: "0.8rem",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600 }}>{link.name}</span>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>{link.chain}</span>
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", marginTop: "0.15rem" }}>
                      {link.address}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {genesisData?.whyThisMatters && (
            <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(59,130,246,0.05)", borderRadius: "0.75rem", border: "1px solid rgba(59,130,246,0.1)" }}>
              <h3 style={{ fontSize: "0.85rem", color: "#3b82f6", margin: "0 0 0.5rem" }}>Why This Matters</h3>
              <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8rem", lineHeight: 1.8, color: "rgba(255,255,255,0.6)" }}>
                {genesisData.whyThisMatters.map((reason: string, i: number) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Infrastructure ── */}
      {infra && (
        <section className="glass" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem" }}>
            <span className="gradient">Infrastructure</span> — {infra.count} Components
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {infra.categories && Object.entries(infra.categories).map(([cat, count]: [string, any]) => (
              <span key={cat} style={{
                padding: "0.25rem 0.75rem",
                background: "rgba(255,255,255,0.06)",
                borderRadius: "1rem",
                fontSize: "0.8rem",
              }}>
                {cat}: {count}
              </span>
            ))}
          </div>
          <table className="ex-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Type</th>
                <th>Chain/Platform</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {infra.components?.map((c: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span className="proto-badge" style={{ fontSize: "0.7rem" }}>{c.type}</span></td>
                  <td style={{ fontSize: "0.8rem" }}>{c.chain}</td>
                  <td style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>{c.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── No Data Fallback ── */}
      {!overview && !ammData && !flywheelData && !genesisData && !credData && (
        <div className="glass" style={{ padding: "2rem", textAlign: "center" }}>
          <h2 style={{ color: "rgba(255,255,255,0.5)" }}>Economics Engine Offline</h2>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
            The economics engine is not responding. Make sure the Facilitator is running on port 3100.
          </p>
        </div>
      )}
    </>
  );
}
