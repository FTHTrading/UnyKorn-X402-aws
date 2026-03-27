import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelOrder,
  getLeaderboard,
  getMarketSummary,
  getOHLCV,
  getOrderBook,
  getPortfolio,
  getRecentTrades,
  getTicker,
  getVesting,
  getWalletOrders,
  claimVesting,
  generateReferral,
  placeOrder,
  type ExchangeOrder,
  type Leaderboard,
  type MarketSummary,
  type OHLCV,
  type OrderBook,
  type PortfolioSummary,
  type ReferralRecord,
  type Ticker,
  type Trade,
  type VestingSchedule,
} from "./exchangeApi";

// ── Market Ticker Strip ──────────────────────────────────────

export function MarketTicker() {
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [summary, setSummary] = useState<MarketSummary | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [tickers, mkt] = await Promise.all([getTicker(), getMarketSummary()]);
        setTicker(tickers[0] ?? null);
        setSummary(mkt);
      } catch { /* silent */ }
    }
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (!ticker || !summary) return null;

  const positive = parseFloat(ticker.change24h) >= 0;

  return (
    <div className="ex-ticker-strip">
      <div className="ex-ticker-item">
        <span className="ex-ticker-label">UNY/USDF</span>
        <span className="ex-ticker-price grad-text">${ticker.lastPrice}</span>
      </div>
      <div className="ex-ticker-item">
        <span className="ex-ticker-label">24h Change</span>
        <span className={positive ? "ex-ticker-green" : "ex-ticker-red"}>
          {positive ? "+" : ""}{ticker.changePercent24h}%
        </span>
      </div>
      <div className="ex-ticker-item">
        <span className="ex-ticker-label">24h High</span>
        <span>${ticker.high24h}</span>
      </div>
      <div className="ex-ticker-item">
        <span className="ex-ticker-label">24h Low</span>
        <span>${ticker.low24h}</span>
      </div>
      <div className="ex-ticker-item">
        <span className="ex-ticker-label">24h Volume</span>
        <span>${Number(ticker.volume24h).toLocaleString()}</span>
      </div>
      <div className="ex-ticker-item">
        <span className="ex-ticker-label">Market Cap</span>
        <span>${(summary.marketCap / 1e6).toFixed(2)}M</span>
      </div>
      <div className="ex-ticker-item">
        <span className="ex-ticker-label">Circulating</span>
        <span>{(summary.circulatingSupply / 1e6).toFixed(0)}M</span>
      </div>
    </div>
  );
}

// ── Mini Price Chart (Canvas) ────────────────────────────────

function MiniChart({ candles }: { candles: OHLCV[] }) {
  const svgPath = useMemo(() => {
    if (candles.length < 2) return "";
    const prices = candles.map(c => c.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const w = 600;
    const h = 120;
    const step = w / (prices.length - 1);

    return prices.map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / range) * (h - 10) - 5;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [candles]);

  if (!svgPath) return null;

  const isUp = candles.length >= 2 && candles[candles.length - 1].close >= candles[0].close;

  return (
    <svg viewBox="0 0 600 120" className="ex-mini-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${svgPath} L600,120 L0,120 Z`} fill="url(#chartGrad)" />
      <path d={svgPath} fill="none" stroke={isUp ? "#22c55e" : "#ef4444"} strokeWidth="2" />
    </svg>
  );
}

// ── Exchange Terminal ────────────────────────────────────────

export function ExchangeTerminal() {
  const [wallet, setWallet] = useState("");
  const [book, setBook] = useState<OrderBook | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [candles, setCandles] = useState<OHLCV[]>([]);
  const [myOrders, setMyOrders] = useState<ExchangeOrder[]>([]);
  const [orderForm, setOrderForm] = useState({ side: "buy" as "buy" | "sell", type: "limit" as "limit" | "market", price: "0.008", amount: "10000" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"book" | "trades" | "orders">("book");

  useEffect(() => {
    const savedWallet = typeof window !== "undefined" ? window.localStorage.getItem("unykorn.ico.lastWallet") : null;
    if (savedWallet) setWallet(savedWallet);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [b, t, c] = await Promise.all([getOrderBook(), getRecentTrades(), getOHLCV()]);
      setBook(b);
      setTrades(t);
      setCandles(c);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, [loadData]);

  useEffect(() => {
    if (!wallet) return;
    getWalletOrders(wallet).then(setMyOrders).catch(() => undefined);
  }, [wallet]);

  async function handleSubmit() {
    if (!wallet.trim()) { setMsg("Enter your wallet address"); return; }
    setSubmitting(true);
    setMsg(null);
    try {
      const result = await placeOrder(
        wallet,
        orderForm.side,
        "UNY/USDF",
        parseFloat(orderForm.price),
        parseFloat(orderForm.amount),
        orderForm.type,
      );
      setMsg(`Order placed: ${result.order.id} (${result.matched} fills)`);
      await loadData();
      const orders = await getWalletOrders(wallet);
      setMyOrders(orders);
    } catch (e: any) {
      setMsg(e.message ?? "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(orderId: string) {
    try {
      await cancelOrder(orderId, wallet);
      setMsg("Order cancelled");
      const orders = await getWalletOrders(wallet);
      setMyOrders(orders);
    } catch (e: any) {
      setMsg(e.message ?? "Cancel failed");
    }
  }

  const total = useMemo(() => {
    const p = parseFloat(orderForm.price) || 0;
    const a = parseFloat(orderForm.amount) || 0;
    return (p * a).toFixed(2);
  }, [orderForm.price, orderForm.amount]);

  return (
    <section className="section" id="exchange" style={{ background: "var(--bg)" }}>
      <div className="container">
        <div className="sec-header">
          <h2>UnyKorn <span className="grad-text">Exchange</span></h2>
          <p>OTC order book. Limit & market orders. Real-time matching engine. Direct wallet settlement.</p>
        </div>

        {/* Price Chart */}
        <div className="glass-solid ex-chart-wrap">
          <div className="ex-chart-header">
            <div>
              <span className="ex-chart-pair">UNY / USDF</span>
              <span className="ex-chart-price grad-text">$0.008000</span>
            </div>
            <div className="ex-chart-stats">
              {book && <span>Spread: {book.spread}</span>}
              <span>24h Vol: ${(847500).toLocaleString()}</span>
            </div>
          </div>
          <MiniChart candles={candles} />
        </div>

        <div className="ex-terminal-grid">
          {/* Order Book */}
          <div className="glass-solid ex-panel">
            <div className="ex-panel-tabs">
              <button className={activeTab === "book" ? "ex-tab-active" : ""} onClick={() => setActiveTab("book")}>Order Book</button>
              <button className={activeTab === "trades" ? "ex-tab-active" : ""} onClick={() => setActiveTab("trades")}>Trades</button>
              <button className={activeTab === "orders" ? "ex-tab-active" : ""} onClick={() => setActiveTab("orders")}>My Orders</button>
            </div>

            {activeTab === "book" && book && (
              <div className="ex-book">
                <div className="ex-book-header">
                  <span>Price (USDF)</span><span>Amount (UNY)</span>
                </div>
                <div className="ex-book-asks">
                  {book.asks.slice(0, 8).reverse().map((level, i) => (
                    <div key={`a${i}`} className="ex-book-row ex-ask">
                      <span>{level.price}</span>
                      <span>{Number(level.amount).toLocaleString()}</span>
                      <div className="ex-book-bar ex-bar-red" style={{ width: `${Math.min(100, Number(level.amount) / 500)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="ex-book-mid">
                  <span className="ex-book-spread">Spread: {book.spread}</span>
                </div>
                <div className="ex-book-bids">
                  {book.bids.slice(0, 8).map((level, i) => (
                    <div key={`b${i}`} className="ex-book-row ex-bid">
                      <span>{level.price}</span>
                      <span>{Number(level.amount).toLocaleString()}</span>
                      <div className="ex-book-bar ex-bar-green" style={{ width: `${Math.min(100, Number(level.amount) / 500)}%` }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "trades" && (
              <div className="ex-trades">
                <div className="ex-book-header">
                  <span>Price</span><span>Amount</span><span>Time</span>
                </div>
                {trades.slice(0, 15).map((t) => (
                  <div key={t.id} className="ex-trade-row">
                    <span className={parseFloat(t.price) >= 0.008 ? "ex-ticker-green" : "ex-ticker-red"}>{t.price}</span>
                    <span>{Number(t.amount).toLocaleString()}</span>
                    <span className="ex-trade-time">{new Date(t.createdAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "orders" && (
              <div className="ex-my-orders">
                {myOrders.length === 0 ? (
                  <div className="ex-empty">No orders yet. Place your first order below.</div>
                ) : (
                  myOrders.slice(0, 20).map((o) => (
                    <div key={o.id} className="ex-order-row">
                      <span className={o.side === "buy" ? "ex-ticker-green" : "ex-ticker-red"}>{o.side.toUpperCase()}</span>
                      <span>{o.price}</span>
                      <span>{o.remaining}/{o.amount}</span>
                      <span className={`ex-status-${o.status}`}>{o.status}</span>
                      {(o.status === "open" || o.status === "partial") && (
                        <button className="ex-cancel-btn" onClick={() => handleCancel(o.id)}>✕</button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Order Form */}
          <div className="glass-solid ex-panel ex-order-form">
            <h4>Place Order</h4>

            <div className="ex-side-toggle">
              <button className={orderForm.side === "buy" ? "ex-side-buy active" : "ex-side-buy"} onClick={() => setOrderForm(f => ({ ...f, side: "buy" }))}>Buy</button>
              <button className={orderForm.side === "sell" ? "ex-side-sell active" : "ex-side-sell"} onClick={() => setOrderForm(f => ({ ...f, side: "sell" }))}>Sell</button>
            </div>

            <div className="ex-type-toggle">
              <button className={orderForm.type === "limit" ? "active" : ""} onClick={() => setOrderForm(f => ({ ...f, type: "limit" }))}>Limit</button>
              <button className={orderForm.type === "market" ? "active" : ""} onClick={() => setOrderForm(f => ({ ...f, type: "market" }))}>Market</button>
            </div>

            <label className="sale-field">
              <span>Wallet</span>
              <input value={wallet} onChange={e => setWallet(e.target.value)} placeholder="uny1_... or 0x..." />
            </label>

            {orderForm.type === "limit" && (
              <label className="sale-field">
                <span>Price (USDF)</span>
                <input type="number" step="0.000001" value={orderForm.price} onChange={e => setOrderForm(f => ({ ...f, price: e.target.value }))} />
              </label>
            )}

            <label className="sale-field">
              <span>Amount (UNY)</span>
              <input type="number" step="100" value={orderForm.amount} onChange={e => setOrderForm(f => ({ ...f, amount: e.target.value }))} />
            </label>

            <div className="ex-order-total">
              <span>Total</span>
              <strong>{total} USDF</strong>
            </div>

            <button className={`btn-primary ex-submit-btn ${orderForm.side === "sell" ? "ex-submit-sell" : ""}`} onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Placing…" : `${orderForm.side === "buy" ? "Buy" : "Sell"} UNY`}
            </button>

            {msg && <div className="sale-helper-text">{msg}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Portfolio Dashboard ──────────────────────────────────────

export function PortfolioDashboard() {
  const [wallet, setWallet] = useState("");
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("unykorn.ico.lastWallet") : null;
    if (saved) {
      setWallet(saved);
      loadPortfolio(saved);
    }
  }, []);

  async function loadPortfolio(w: string) {
    if (!w.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const p = await getPortfolio(w.trim());
      setPortfolio(p);
    } catch (e: any) {
      setError(e.message ?? "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }

  const pnlPositive = portfolio ? parseFloat(portfolio.unrealizedPnl) >= 0 : true;

  return (
    <section className="section" id="portfolio" style={{ background: "var(--bg-alt)" }}>
      <div className="container">
        <div className="sec-header">
          <h2>Portfolio <span className="grad-text">Dashboard</span></h2>
          <p>Track your holdings, P&L, vesting status, and referral rewards in one place.</p>
        </div>

        <div className="ex-portfolio-lookup glass-solid">
          <label className="sale-field sale-field-wide">
            <span>Wallet Address</span>
            <input value={wallet} onChange={e => setWallet(e.target.value)} placeholder="uny1_... or 0x..." />
          </label>
          <button className="btn-primary" onClick={() => loadPortfolio(wallet)} disabled={loading || !wallet.trim()}>
            {loading ? "Loading…" : "Load Portfolio"}
          </button>
        </div>

        {error && <div className="sale-error-text">{error}</div>}

        {portfolio && (
          <div className="ex-portfolio-grid">
            <div className="glass-solid ex-portfolio-card ex-portfolio-hero">
              <div className="ex-portfolio-label">Total Portfolio Value</div>
              <div className="ex-portfolio-big grad-text">${Number(portfolio.totalValueUsd).toLocaleString()}</div>
              <div className="ex-portfolio-sub">
                <span>{Number(portfolio.totalUnyHeld).toLocaleString()} UNY</span>
                <span>·</span>
                <span>{portfolio.allocations} allocation{portfolio.allocations !== 1 ? "s" : ""}</span>
              </div>
            </div>

            <div className="glass-solid ex-portfolio-card">
              <div className="ex-portfolio-label">Unrealized P&L</div>
              <div className={`ex-portfolio-pnl ${pnlPositive ? "ex-pnl-positive" : "ex-pnl-negative"}`}>
                {pnlPositive ? "+" : ""}{portfolio.unrealizedPnl} ({pnlPositive ? "+" : ""}{portfolio.unrealizedPnlPct}%)
              </div>
              <div className="ex-portfolio-label" style={{ marginTop: 8 }}>Avg Buy Price</div>
              <div className="ex-portfolio-value">${portfolio.averageBuyPrice}</div>
            </div>

            <div className="glass-solid ex-portfolio-card">
              <div className="ex-portfolio-label">Vesting</div>
              <div className="ex-portfolio-value">{Number(portfolio.vestingClaimable).toLocaleString()} UNY claimable</div>
              <div className="ex-portfolio-sub">
                <span>{Number(portfolio.vestingLocked).toLocaleString()} UNY locked</span>
              </div>
            </div>

            <div className="glass-solid ex-portfolio-card">
              <div className="ex-portfolio-label">Referral Bonus</div>
              <div className="ex-portfolio-value">${portfolio.referralBonus}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Vesting Schedule ─────────────────────────────────────────

export function VestingPanel() {
  const [wallet, setWallet] = useState("");
  const [schedules, setSchedules] = useState<VestingSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("unykorn.ico.lastWallet") : null;
    if (saved) { setWallet(saved); loadVesting(saved); }
  }, []);

  async function loadVesting(w: string) {
    if (!w.trim()) return;
    setLoading(true);
    try {
      const s = await getVesting(w.trim());
      setSchedules(s);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function handleClaim(scheduleId: string, trancheId: string) {
    setClaiming(trancheId);
    setMsg(null);
    try {
      await claimVesting(wallet.trim(), scheduleId, trancheId);
      setMsg("Tranche claimed successfully!");
      await loadVesting(wallet);
    } catch (e: any) {
      setMsg(e.message ?? "Claim failed");
    } finally {
      setClaiming(null);
    }
  }

  return (
    <section className="section" id="vesting" style={{ background: "var(--bg)" }}>
      <div className="container">
        <div className="sec-header">
          <h2>Vesting <span className="grad-text">Schedule</span></h2>
          <p>Token unlock schedule: 25% immediate, 25% at 3 months, 25% at 6 months, 25% at 12 months.</p>
        </div>

        <div className="ex-portfolio-lookup glass-solid">
          <label className="sale-field sale-field-wide">
            <span>Wallet Address</span>
            <input value={wallet} onChange={e => setWallet(e.target.value)} placeholder="uny1_... or 0x..." />
          </label>
          <button className="btn-primary" onClick={() => loadVesting(wallet)} disabled={loading || !wallet.trim()}>
            {loading ? "Loading…" : "Load Vesting"}
          </button>
        </div>

        {msg && <div className="sale-helper-text">{msg}</div>}

        {schedules.length > 0 && schedules.map((schedule) => (
          <div key={schedule.id} className="glass-solid ex-vesting-card">
            <div className="ex-vesting-header">
              <div>
                <strong>Allocation: {schedule.allocationId}</strong>
                <span className="ex-vesting-total">{Number(schedule.totalUny).toLocaleString()} UNY</span>
              </div>
              <div className="ex-vesting-progress">
                <span>{Number(schedule.claimedUny).toLocaleString()} / {Number(schedule.totalUny).toLocaleString()} claimed</span>
                <div className="sale-order-health-bar">
                  <div className="sale-order-health-fill" style={{ width: `${(parseFloat(schedule.claimedUny) / parseFloat(schedule.totalUny)) * 100}%`, background: "var(--grad)" }} />
                </div>
              </div>
            </div>

            <div className="ex-vesting-tranches">
              {schedule.tranches.map((tranche, idx) => {
                const unlockDate = new Date(tranche.unlockAt);
                const isUnlocked = Date.now() >= unlockDate.getTime();
                return (
                  <div key={tranche.id} className={`ex-vesting-tranche ${tranche.status}`}>
                    <div className="ex-vesting-tranche-head">
                      <span className="ex-vesting-tranche-label">Tranche {idx + 1}</span>
                      <span className={`ex-vesting-badge ex-vesting-badge-${tranche.status}`}>{tranche.status}</span>
                    </div>
                    <div className="ex-vesting-tranche-amount">{Number(tranche.amount).toLocaleString()} UNY</div>
                    <div className="ex-vesting-tranche-date">
                      {tranche.status === "claimed" ? `Claimed ${new Date(tranche.claimedAt!).toLocaleDateString()}` : (isUnlocked ? "Unlocked" : `Unlocks ${unlockDate.toLocaleDateString()}`)}
                    </div>
                    {tranche.status !== "claimed" && isUnlocked && (
                      <button className="btn-primary ex-claim-btn" onClick={() => handleClaim(schedule.id, tranche.id)} disabled={claiming === tranche.id}>
                        {claiming === tranche.id ? "Claiming…" : "Claim"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!loading && schedules.length === 0 && wallet && (
          <div className="glass-solid ex-empty-card">No vesting schedules found. Purchase UNY tokens to see your vesting schedule.</div>
        )}
      </div>
    </section>
  );
}

// ── Referral System ──────────────────────────────────────────

export function ReferralPanel() {
  const [wallet, setWallet] = useState("");
  const [referral, setReferral] = useState<ReferralRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("unykorn.ico.lastWallet") : null;
    if (saved) setWallet(saved);
  }, []);

  async function handleGenerate() {
    if (!wallet.trim()) return;
    setLoading(true);
    setMsg(null);
    try {
      const record = await generateReferral(wallet.trim());
      setReferral(record);
    } catch (e: any) {
      setMsg(e.message ?? "Failed to generate code");
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.code);
      setMsg("Referral code copied!");
    } catch { setMsg("Copy manually: " + referral.code); }
  }

  async function copyLink() {
    if (!referral) return;
    const link = `${window.location.origin}${window.location.pathname}?ref=${referral.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setMsg("Referral link copied!");
    } catch { setMsg("Copy manually"); }
  }

  const tierColors = { bronze: "#cd7f32", silver: "#c0c0c0", gold: "#ffd700", platinum: "#e5e4e2" };

  return (
    <section className="section" id="referral" style={{ background: "var(--bg-alt)" }}>
      <div className="container">
        <div className="sec-header">
          <h2>Referral <span className="grad-text">Program</span></h2>
          <p>Earn bonus UNY for every investor you refer. Higher tiers unlock bigger rewards.</p>
        </div>

        {/* Tier cards */}
        <div className="ex-referral-tiers">
          {[
            { tier: "Bronze", pct: "2%", min: "0 referrals", color: "#cd7f32" },
            { tier: "Silver", pct: "5%", min: "5+ referrals", color: "#c0c0c0" },
            { tier: "Gold", pct: "8%", min: "15+ referrals", color: "#ffd700" },
            { tier: "Platinum", pct: "12%", min: "50+ referrals", color: "#e5e4e2" },
          ].map((t) => (
            <div key={t.tier} className="glass ex-referral-tier-card" style={{ borderColor: `${t.color}44` }}>
              <div className="ex-referral-tier-name" style={{ color: t.color }}>{t.tier}</div>
              <div className="ex-referral-tier-pct grad-text">{t.pct}</div>
              <div className="ex-referral-tier-min">{t.min}</div>
            </div>
          ))}
        </div>

        <div className="ex-portfolio-lookup glass-solid">
          <label className="sale-field sale-field-wide">
            <span>Your Wallet</span>
            <input value={wallet} onChange={e => setWallet(e.target.value)} placeholder="uny1_... or 0x..." />
          </label>
          <button className="btn-primary" onClick={handleGenerate} disabled={loading || !wallet.trim()}>
            {loading ? "Generating…" : referral ? "Refresh Code" : "Generate Referral Code"}
          </button>
        </div>

        {msg && <div className="sale-helper-text">{msg}</div>}

        {referral && (
          <div className="glass-solid ex-referral-result">
            <div className="ex-referral-code-display">
              <span className="ex-referral-label">Your Referral Code</span>
              <span className="ex-referral-code grad-text">{referral.code}</span>
            </div>
            <div className="ex-referral-stats">
              <div>
                <span>Tier</span>
                <strong style={{ color: tierColors[referral.tier] }}>{referral.tier.toUpperCase()}</strong>
              </div>
              <div>
                <span>Referrals</span>
                <strong>{referral.referrals.length}</strong>
              </div>
              <div>
                <span>Total Earned</span>
                <strong>${referral.totalBonus}</strong>
              </div>
            </div>
            <div className="ex-referral-actions">
              <button className="btn-outline sale-mini-btn" onClick={copyCode}>Copy Code</button>
              <button className="btn-outline sale-mini-btn" onClick={copyLink}>Copy Referral Link</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Leaderboard ──────────────────────────────────────────────

export function LeaderboardPanel() {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [tab, setTab] = useState<"holders" | "referrers" | "trades">("holders");

  useEffect(() => {
    getLeaderboard().then(setBoard).catch(() => undefined);
  }, []);

  return (
    <section className="section" id="leaderboard" style={{ background: "var(--bg)" }}>
      <div className="container">
        <div className="sec-header">
          <h2>Leader<span className="grad-text">board</span></h2>
          <p>Top holders, referrers, and recent trading activity.</p>
        </div>

        {board && (
          <div className="glass-solid ex-leaderboard">
            <div className="ex-panel-tabs">
              <button className={tab === "holders" ? "ex-tab-active" : ""} onClick={() => setTab("holders")}>Top Holders</button>
              <button className={tab === "referrers" ? "ex-tab-active" : ""} onClick={() => setTab("referrers")}>Top Referrers</button>
              <button className={tab === "trades" ? "ex-tab-active" : ""} onClick={() => setTab("trades")}>Recent Trades</button>
            </div>

            {tab === "holders" && (
              <div className="ex-lb-table">
                <div className="ex-lb-header">
                  <span>#</span><span>Wallet</span><span>Balance</span><span>% Supply</span>
                </div>
                {board.topHolders.map((h) => (
                  <div key={h.rank} className="ex-lb-row">
                    <span className="ex-lb-rank">{h.rank}</span>
                    <span className="sale-mono">{h.wallet}</span>
                    <span>{h.balance} UNY</span>
                    <span>{h.pct}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === "referrers" && (
              <div className="ex-lb-table">
                <div className="ex-lb-header">
                  <span>#</span><span>Code</span><span>Referrals</span><span>Earned</span><span>Tier</span>
                </div>
                {board.topReferrers.map((r) => (
                  <div key={r.rank} className="ex-lb-row">
                    <span className="ex-lb-rank">{r.rank}</span>
                    <span className="sale-mono">{r.code}</span>
                    <span>{r.referrals}</span>
                    <span>{r.bonus}</span>
                    <span className="ex-lb-tier">{r.tier}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === "trades" && (
              <div className="ex-lb-table">
                <div className="ex-lb-header">
                  <span>Pair</span><span>Price</span><span>Amount</span><span>Total</span><span>Time</span>
                </div>
                {board.recentTrades.slice(0, 10).map((t) => (
                  <div key={t.id} className="ex-lb-row">
                    <span>{t.pair}</span>
                    <span>${t.price}</span>
                    <span>{Number(t.amount).toLocaleString()}</span>
                    <span>${Number(t.total).toLocaleString()}</span>
                    <span className="ex-trade-time">{new Date(t.createdAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
