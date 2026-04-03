/**
 * Pulse — Mesh State Machine + Live Transactions
 *
 * Connects to the mesh-pulse WebSocket at /pulse/stream and shows:
 *  - FSM state transitions in real-time
 *  - Live trade settlement events as they flow through the cascade
 *  - signal stats + asset demand scores
 */

import { useEffect, useRef, useState } from "react";
import {
  getPulseStatus,
  getPulseTransactions,
  getPulseNetwork,
  PULSE_WS_URL,
  type PulseStatus,
  type PulseTransaction,
  type PulseAssetScore,
} from "../api";

// ── types for WebSocket events ────────────────────────────

type WsStateTransition = {
  type: "state_transition";
  data: { from: string; to: string; at: string; reason: string };
};
type WsSignalEvent = {
  type: "signal";
  data: { processed: number; pending: number; state: string; ts: string };
};
type WsTransactionEvent = {
  type: "transaction";
  data: {
    trade_id: string;
    offer_id: string;
    asset_id: string;
    old_value: number;
    new_value: number;
    appreciation_pct: number;
    offerer: string;
    counterparty: string;
    ts: string;
  };
};
type WsWelcome = { type: "welcome"; data: { state: string; ts: string; clients: number } };
type WsEvent = WsStateTransition | WsSignalEvent | WsTransactionEvent | WsWelcome;

// ── state colours ─────────────────────────────────────────
const STATE_COLOR: Record<string, string> = {
  BOOTING:    "#a855f7",
  IDLE:       "#3b82f6",
  SCANNING:   "#f5a623",
  PROCESSING: "#22c55e",
  RESTING:    "#60a5fa",
  ERROR:      "#e84142",
};

function stateColor(s: string) {
  return STATE_COLOR[s] ?? "#707080";
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}

function trunc(s: string, n = 8) {
  if (!s) return "—";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// ── component ─────────────────────────────────────────────

export default function Pulse() {
  const [status, setStatus]       = useState<PulseStatus | null>(null);
  const [liveState, setLiveState] = useState<string>("…");
  const [wsClients, setWsClients] = useState<number>(0);
  const [wsOk, setWsOk]           = useState(false);
  const [transitions, setTransitions] = useState<WsStateTransition["data"][]>([]);
  const [liveTxs, setLiveTxs]     = useState<WsTransactionEvent["data"][]>([]);
  const [dbTxs, setDbTxs]         = useState<PulseTransaction[]>([]);
  const [assets, setAssets]       = useState<PulseAssetScore[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);

  // ── REST poll ──────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [s, txs, net] = await Promise.all([
        getPulseStatus(),
        getPulseTransactions(20),
        getPulseNetwork(),
      ]);
      if (s) { setStatus(s); setLiveState(s.state); }
      setDbTxs(txs);
      setAssets(net);
    };
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  // ── WebSocket ─────────────────────────────────────────
  useEffect(() => {
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(PULSE_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setWsOk(true);
      ws.onclose = () => {
        setWsOk(false);
        retryTimer = setTimeout(connect, 4000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (ev) => {
        try {
          const msg: WsEvent = JSON.parse(ev.data as string);

          if (msg.type === "welcome") {
            setLiveState(msg.data.state);
            setWsClients(msg.data.clients);
          }

          if (msg.type === "state_transition") {
            setLiveState(msg.data.to);
            setTransitions((prev) => [msg.data, ...prev].slice(0, 30));
          }

          if (msg.type === "signal") {
            setLiveState(msg.data.state);
          }

          if (msg.type === "transaction") {
            setLiveTxs((prev) => [msg.data, ...prev].slice(0, 50));
            // scroll live feed to top
            setTimeout(() => {
              liveRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }, 50);
          }
        } catch { /* ignore parse errors */ }
      };
    };

    connect();
    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  // ── render ────────────────────────────────────────────
  const totalSignals = status?.signal_stats?.total_signals ?? 0;
  const pending      = status?.signal_stats?.pending_propagation ?? 0;
  const uptime       = status ? `${Math.floor(status.uptime_seconds / 60)}m ${status.uptime_seconds % 60}s` : "—";

  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero" style={{ marginBottom: "var(--sov-space-6, 24px)" }}>
        <h1 className="hero-title">
          <span className="gradient-text">Mesh Pulse</span>
        </h1>
        <p className="hero-sub">
          Real-time state machine · live trade cascade · WebSocket electricity
        </p>
        <div className="protocol-badges">
          <span className="protocol-badge" style={{ background: wsOk ? "rgba(34,197,94,0.15)" : "rgba(232,65,66,0.15)", border: `1px solid ${wsOk ? "#22c55e" : "#e84142"}`, color: wsOk ? "#22c55e" : "#e84142" }}>
            {wsOk ? "● WS LIVE" : "○ WS OFFLINE"}
          </span>
          <span className="protocol-badge" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}>
            STATE: {liveState}
          </span>
          <span className="protocol-badge" style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)", color: "#a855f7" }}>
            {wsClients} WS client{wsClients !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Stat row ── */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Current State</div>
          <div className="stat-value" style={{ color: stateColor(liveState) }}>{liveState}</div>
          <div className="stat-sub">FSM</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Signals</div>
          <div className="stat-value">{totalSignals.toLocaleString()}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: pending > 0 ? "#f5a623" : "#22c55e" }}>{pending}</div>
          <div className="stat-sub">unprocessed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Uptime</div>
          <div className="stat-value">{uptime}</div>
          <div className="stat-sub">since last restart</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Settled Trades</div>
          <div className="stat-value">{dbTxs.length}</div>
          <div className="stat-sub">last 20</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Assets Tracked</div>
          <div className="stat-value">{assets.length}</div>
          <div className="stat-sub">in demand network</div>
        </div>
      </div>

      {/* ── Three-column live section ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr", gap: 16, marginBottom: 24 }}>

        {/* State machine transitions */}
        <div className="glass" style={{ padding: 20 }}>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <h2 className="section-title">State Machine</h2>
            <span className="section-badge">live</span>
          </div>

          {/* Visual FSM */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {["BOOTING","IDLE","SCANNING","PROCESSING","RESTING"].map((s) => (
              <div key={s} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                background: liveState === s ? `${stateColor(s)}22` : "rgba(255,255,255,0.03)",
                border: `1px solid ${liveState === s ? stateColor(s) : "rgba(255,255,255,0.06)"}`,
                transition: "all 0.3s ease",
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: liveState === s ? stateColor(s) : "rgba(255,255,255,0.15)",
                  boxShadow: liveState === s ? `0 0 8px ${stateColor(s)}` : "none",
                  transition: "all 0.3s ease",
                }} />
                <span style={{ fontSize: 13, fontWeight: liveState === s ? 700 : 400, color: liveState === s ? stateColor(s) : "var(--sov-text-muted)" }}>{s}</span>
              </div>
            ))}
          </div>

          {/* Recent transitions */}
          <div style={{ fontSize: 11, color: "var(--sov-text-muted)", marginBottom: 6 }}>RECENT TRANSITIONS</div>
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {transitions.length === 0 && status?.state_history && status.state_history.slice(-8).reverse().map((t, i) => (
              <div key={i} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: stateColor(t.from), fontWeight: 600 }}>{t.from}</span>
                <span style={{ color: "var(--sov-text-faint)" }}>→</span>
                <span style={{ color: stateColor(t.to), fontWeight: 600 }}>{t.to}</span>
                <span style={{ color: "var(--sov-text-faint)", marginLeft: "auto" }}>{relTime(t.at)}</span>
              </div>
            ))}
            {transitions.map((t, i) => (
              <div key={i} style={{
                fontSize: 11, display: "flex", alignItems: "center", gap: 6,
                animation: i === 0 ? "fadeInDown 0.3s ease" : undefined,
              }}>
                <span style={{ color: stateColor(t.from), fontWeight: 600 }}>{t.from}</span>
                <span style={{ color: "var(--sov-text-faint)" }}>→</span>
                <span style={{ color: stateColor(t.to), fontWeight: 600 }}>{t.to}</span>
                <span style={{ color: "var(--sov-text-faint)", marginLeft: "auto" }}>{relTime(t.at)}</span>
              </div>
            ))}
            {transitions.length === 0 && !status && (
              <div style={{ color: "var(--sov-text-faint)", fontSize: 12 }}>Waiting for transitions…</div>
            )}
          </div>
        </div>

        {/* Live transaction feed */}
        <div className="glass" style={{ padding: 20 }}>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <h2 className="section-title">Live Transactions</h2>
            <span className="section-badge" style={{ background: liveTxs.length > 0 ? "rgba(34,197,94,0.15)" : undefined }}>
              {liveTxs.length > 0 ? `${liveTxs.length} new` : "watching"}
            </span>
          </div>

          {/* WS live feed */}
          <div ref={liveRef} style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {liveTxs.length === 0 && (
              <div style={{ color: "var(--sov-text-faint)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
                Transactions will appear here instantly when a barter trade settles
              </div>
            )}
            {liveTxs.map((tx, i) => (
              <div key={i} style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(34,197,94,0.06)",
                border: "1px solid rgba(34,197,94,0.2)",
                animation: i === 0 ? "fadeInDown 0.3s ease" : undefined,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>SETTLED</span>
                  <span style={{ fontSize: 11, color: "var(--sov-text-faint)" }}>{relTime(tx.ts)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--sov-text)", marginBottom: 4 }}>
                  Asset <span className="mono" style={{ color: "#60a5fa" }}>{trunc(tx.asset_id, 12)}</span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                  <span style={{ color: "var(--sov-text-muted)" }}>
                    {Number(tx.old_value).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDF
                  </span>
                  <span style={{ color: "#f5a623" }}>→</span>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>
                    {Number(tx.new_value).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDF
                  </span>
                  <span style={{ color: "#a855f7", fontWeight: 700, marginLeft: "auto" }}>
                    +{Number(tx.appreciation_pct).toFixed(1)}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--sov-text-faint)", marginTop: 4 }}>
                  {trunc(tx.offerer, 10)} ↔ {trunc(tx.counterparty, 10)}
                </div>
              </div>
            ))}
          </div>

          {/* DB settled trades */}
          {dbTxs.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "var(--sov-text-muted)", marginBottom: 8 }}>SETTLED TRADES (DB)</div>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Old Value</th>
                      <th>New Value</th>
                      <th>+%</th>
                      <th>USDF</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbTxs.map((tx) => (
                      <tr key={tx.trade_id}>
                        <td title={tx.offered_asset_id}>
                          <span style={{ color: "#60a5fa" }}>{tx.offered_asset_name || trunc(tx.offered_asset_id, 12)}</span>
                          <br /><span style={{ color: "var(--sov-text-faint)", fontSize: 11 }}>{tx.offered_asset_category}</span>
                        </td>
                        <td className="mono">{Number(tx.asset_a_old_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="mono" style={{ color: "#22c55e" }}>{Number(tx.asset_a_new_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ color: "#a855f7", fontWeight: 700 }}>+{Number(tx.appreciation_pct).toFixed(1)}%</td>
                        <td className="mono">{Number(tx.settlement_usdf).toFixed(2)}</td>
                        <td style={{ color: "var(--sov-text-muted)" }}>{tx.settled_at ? relTime(tx.settled_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {dbTxs.length === 0 && (
            <div style={{ color: "var(--sov-text-faint)", fontSize: 12, textAlign: "center", padding: "12px 0" }}>
              No settled trades yet — accept a barter offer to see the cascade
            </div>
          )}
        </div>

        {/* Asset demand scores */}
        <div className="glass" style={{ padding: 20 }}>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <h2 className="section-title">Asset Demand</h2>
            <span className="section-badge">{assets.length} tracked</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assets.length === 0 && (
              <div style={{ color: "var(--sov-text-faint)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
                Register assets to see demand scores
              </div>
            )}
            {assets.map((a) => {
              const score = Number(a.demand_score);
              const pct   = Math.min(score * 100, 100);
              return (
                <div key={a.asset_id} style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--sov-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--sov-text)", fontWeight: 600 }}>
                      {a.name || trunc(a.asset_id, 12)}
                    </span>
                    <span style={{ fontSize: 11, color: "#a855f7", fontWeight: 700 }}>
                      {score.toFixed(4)}
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      background: pct > 50 ? "#22c55e" : pct > 10 ? "#f5a623" : "#3b82f6",
                      width: `${Math.max(pct, 1)}%`,
                      transition: "width 0.6s ease",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--sov-text-faint)" }}>{a.category}</span>
                    <span style={{ fontSize: 11, color: "var(--sov-text-faint)" }}>{a.trade_count} trades</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Signal breakdown */}
          {status?.signal_stats?.last_hour && status.signal_stats.last_hour.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: "var(--sov-text-muted)", marginBottom: 8 }}>SIGNALS (LAST HOUR)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {status.signal_stats.last_hour.map((s) => (
                  <div key={s.signal_type} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--sov-text-muted)" }}>{s.signal_type}</span>
                    <span className="mono" style={{ color: "var(--sov-text)" }}>{Number(s.count).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mono { font-family: var(--sov-font-mono, monospace); }
        .gradient-text {
          background: var(--sov-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-title {
          font-size: clamp(2rem, 5vw, 3.5rem);
          font-weight: 800;
          margin: 0 0 8px;
        }
        .hero-sub {
          color: var(--sov-text-muted);
          font-size: 16px;
          margin: 0 0 16px;
        }
        .protocol-badges { display: flex; gap: 8px; flex-wrap: wrap; }
        .protocol-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          font-family: var(--sov-font-mono, monospace);
        }
      `}</style>
    </>
  );
}
