import { useState, useEffect } from "react";

// ── Countdown Timer ───────────────────────────────────────

function useCountdown(targetDate: Date) {
  const [timeLeft, setTimeLeft] = useState(getTime(targetDate));

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(getTime(targetDate)), 1000);
    return () => clearInterval(t);
  }, [targetDate]);

  return timeLeft;
}

function getTime(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

// ── ICO Data ──────────────────────────────────────────────

const ICO = {
  name: "UnyKorn Token",
  symbol: "UNY",
  totalSupply: "1,000,000,000",
  icoAllocation: "200,000,000",
  icoPercent: 20,
  price: "$0.008",
  softCap: "$500,000",
  hardCap: "$5,000,000",
  raised: 0,
  hardCapNum: 5_000_000,
  startDate: new Date("2026-04-15T00:00:00Z"),
  endDate: new Date("2026-06-15T00:00:00Z"),
  chains: [
    { name: "UnyKorn L1", color: "#3b82f6", contract: "Chain 7331 · Native Token" },
  ],
  tiers: [
    { name: "Seed", price: "$0.005", bonus: "+60% Bonus", min: "$100", max: "$25,000", alloc: "50,000,000 UNY", status: "COMING SOON", featured: false },
    { name: "Private Sale", price: "$0.008", bonus: "+30% Bonus", min: "$500", max: "$100,000", alloc: "80,000,000 UNY", status: "COMING SOON", featured: true },
    { name: "Public Sale", price: "$0.012", bonus: "+10% Bonus", min: "$50", max: "$50,000", alloc: "70,000,000 UNY", status: "UPCOMING", featured: false },
  ],
  tokenomics: [
    { label: "Infrastructure & Validators", pct: 35, color: "#22c55e" },
    { label: "ICO Sale", pct: 20, color: "#3b82f6" },
    { label: "Protocol Treasury", pct: 15, color: "#f5a623" },
    { label: "AI Compute Subsidies", pct: 10, color: "#a855f7" },
    { label: "Ecosystem Grants", pct: 10, color: "#22d3ee" },
    { label: "Team & Advisors", pct: 10, color: "#ec4899" },
  ],
  roadmap: [
    { date: "Q3 2025", title: "Genesis & Foundation", desc: "UNY token created at genesis for AI-to-AI x402 protocol. FTH Trading entity formed. Smart contract architecture designed. x402 protocol research begins.", active: true },
    { date: "Q4 2025", title: "Infrastructure Build", desc: "UnyKorn L1 consensus (Trinity) launched. Chain 7331 live with native UNY gas. A2A agent framework with 12 autonomous agents across 3 operational planes.", active: true },
    { date: "Q1 2026", title: "x402 Protocol Launch", desc: "Payment facilitator, treasury, guardian services live. Cloudflare gateway. 9 premium API routes monetized. Economics engine.", active: true },
    { date: "Q2 2026", title: "ICO & Exchange Listings", desc: "Token sale at ico.unykorn.org. CoinGecko & CMC API integration. Listing applications for Binance, Coinbase, Kraken, OKX, and 9 more.", active: false },
    { date: "Q3 2026", title: "DEX Launch & DeFi", desc: "UnyKorn DEX with native AMM pools. Staking vault with real yield from x402 revenue. LP rewards program. 100+ A2A agents.", active: false },
    { date: "Q4 2026", title: "Enterprise & Scale", desc: "CEX listings go live. Enterprise trade finance API. 1M+ x402 transactions/month. UnyKorn L1 mainnet upgrade.", active: false },
  ],
};

// ── Components ────────────────────────────────────────────

function Nav() {
  return (
    <nav className="nav">
      <div className="nav-logo">
        <div className="nav-logo-icon">U</div>
        <span>UnyKorn</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>ICO</span>
      </div>
      <div className="nav-links">
        <a href="#sale">Token Sale</a>
        <a href="#about">About</a>
        <a href="#tokenomics">Tokenomics</a>
        <a href="#tiers">Tiers</a>
        <a href="#exchanges">Exchanges</a>
        <a href="#roadmap">Roadmap</a>
        <a href="https://main.unykorn-explorer.pages.dev" target="_blank" rel="noreferrer">Explorer</a>
        <a href="https://github.com/FTHTrading/UnyKorn-X402-aws/blob/main/docs/WHITEPAPER.md" target="_blank" rel="noreferrer">Whitepaper</a>
      </div>
      <a href="#sale" className="nav-cta">Join Sale</a>
    </nav>
  );
}

function Hero() {
  const countdown = useCountdown(ICO.startDate);
  const pct = Math.min(100, (ICO.raised / ICO.hardCapNum) * 100);

  return (
    <section className="hero" id="top">
      <div className="hero-badge">
        <span className="dot" />
        Private Sale — Live Now
      </div>

      <h1>
        <span className="grad-text">UnyKorn</span><br />
        Token Sale
      </h1>

      <p className="hero-sub">
        The AI infrastructure payment protocol. x402 settlements, sub-second finality,
        A2A agent commerce — all powered by <strong>UNY</strong>.
      </p>

      <div className="hero-actions">
        <a href="#sale" className="btn-primary">Participate Now</a>
        <a href="#about" className="btn-outline">Learn More</a>
      </div>

      {/* Sale Card */}
      <div className="glass-glow sale-card fade-in" style={{ marginTop: 64 }} id="sale">
        <div className="timer-grid">
          {[
            { val: countdown.days, label: "Days" },
            { val: countdown.hours, label: "Hours" },
            { val: countdown.minutes, label: "Mins" },
            { val: countdown.seconds, label: "Secs" },
          ].map((t) => (
            <div className="timer-unit" key={t.label}>
              <div className="timer-num grad-text">{String(t.val).padStart(2, "0")}</div>
              <div className="timer-label">{t.label}</div>
            </div>
          ))}
        </div>

        <div className="progress-wrap">
          <div className="progress-header">
            <span style={{ color: "var(--text-muted)" }}>Raised</span>
            <span style={{ fontWeight: 700 }}>${(ICO.raised / 1_000_000).toFixed(2)}M / $5M</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-header" style={{ marginTop: 6 }}>
            <span style={{ color: "var(--green)", fontSize: 13, fontWeight: 600 }}>{pct.toFixed(1)}% filled</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Hard Cap: {ICO.hardCap}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <a href="#tiers" className="btn-primary" style={{ textAlign: "center", padding: "14px 20px", fontSize: 15 }}>
            Buy UNY @ {ICO.price}
          </a>
          <a href="#tokenomics" className="btn-outline" style={{ textAlign: "center", padding: "14px 20px", fontSize: 15 }}>
            View Tokenomics
          </a>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { value: "1B", label: "Total Supply" },
    { value: "$0.008", label: "Current Price" },
    { value: "1", label: "Native Chain" },
    { value: "88%", label: "Listing Ready" },
    { value: "30", label: "Compliance Checks" },
    { value: "13", label: "Exchange Targets" },
  ];

  return (
    <section className="section" id="about">
      <div className="container">
        <div className="sec-header">
          <h2>Built <span className="grad-text">Different</span></h2>
          <p>
            Not another memecoin. UNY is the settlement layer for AI-powered commerce,
            backed by real infrastructure shipping today.
          </p>
        </div>

        <div className="stats-grid">
          {stats.map((s, i) => (
            <div className={`glass stat-card fade-in fade-in-d${i % 4 + 1}`} key={s.label}>
              <div className="stat-value grad-text">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Chain badges */}
        <div style={{ marginTop: 48, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Deployed On
          </div>
          <div className="chain-row">
            {ICO.chains.map((c) => (
              <div className="glass chain-badge" key={c.name} style={{ borderColor: `${c.color}44` }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
                {c.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WhatWeBuilt() {
  const items = [
    { icon: "⚡", title: "x402 Payment Protocol", desc: "HTTP 402 standard for machine-to-machine payments. Sub-second settlement. 9 premium API routes monetized and live.", bg: "rgba(59,130,246,0.1)" },
    { icon: "🏗️", title: "UnyKorn L1 Blockchain", desc: "Chain ID 7331. Trinity Consensus with ~1s finality. Native UNY gas. Purpose-built for AI infrastructure transactions.", bg: "rgba(168,85,247,0.1)" },
    { icon: "🤖", title: "A2A Agent Framework", desc: "12 AI agents across 3 operational planes. Google A2A protocol support. Agent-to-agent commerce with x402 payments.", bg: "rgba(34,211,238,0.1)" },
    { icon: "🏦", title: "Treasury & Settlement", desc: "Auto-refill treasury service, multi-tier balance management, and real-time invoice settlement for x402 payments.", bg: "rgba(245,166,35,0.1)" },
    { icon: "📊", title: "Economics Engine", desc: "On-chain AMM pricing. Genesis provenance tracking. Revenue flywheel. Credibility scoring system. All transparent.", bg: "rgba(34,197,94,0.1)" },
    { icon: "🏛️", title: "Exchange Listing Ready", desc: "CoinGecko & CMC standard APIs. Proof of Reserves with Merkle tree. 30-point compliance engine. Applications for 9 exchanges.", bg: "rgba(236,72,153,0.1)" },
  ];

  return (
    <section className="section" style={{ background: "var(--bg-alt)" }}>
      <div className="container">
        <div className="sec-header">
          <h2>What We've <span className="grad-text">Built</span></h2>
          <p>Production infrastructure shipping today — not promises on a whitepaper.</p>
        </div>
        <div className="info-grid">
          {items.map((item) => (
            <div className="glass info-card" key={item.title}>
              <h3>
                <span className="info-icon" style={{ background: item.bg }}>{item.icon}</span>
                {item.title}
              </h3>
              <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Tokenomics() {
  return (
    <section className="section" id="tokenomics">
      <div className="container">
        <div className="sec-header">
          <h2>Token<span className="grad-text">omics</span></h2>
          <p>Fixed supply. No hidden mints. Deflationary burn mechanism. Transparent allocation.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
          {/* Distribution */}
          <div className="glass-solid" style={{ padding: 32, borderRadius: "var(--r-lg)" }}>
            <h3 style={{ marginBottom: 24, fontSize: 18, fontWeight: 700 }}>Distribution</h3>
            {ICO.tokenomics.map((t) => (
              <div key={t.label} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color }} />
                    {t.label}
                  </span>
                  <span style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{t.pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${t.pct}%`, height: "100%", background: t.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Key Facts */}
          <div className="glass-solid" style={{ padding: 32, borderRadius: "var(--r-lg)" }}>
            <h3 style={{ marginBottom: 24, fontSize: 18, fontWeight: 700 }}>Key Facts</h3>
            {[
              ["Token Name", "UnyKorn Token (UNY)"],
              ["Standard", "Native L1 + Burnable"],
              ["Max Supply", "1,000,000,000"],
              ["Mintable", "No ✓"],
              ["Burnable", "Yes — Deflationary ✓"],
              ["Pause/Freeze", "No — Fully Decentralized ✓"],
              ["ICO Price", "$0.008"],
              ["Soft Cap", "$500,000"],
              ["Hard Cap", "$5,000,000"],
              ["Vesting", "Team: 12mo cliff + 36mo linear"],
              ["Treasury Lock", "6-month timelock (multi-sig planned)"],
            ].map(([k, v]) => (
              <div className="info-row" key={k}>
                <span className="label">{k}</span>
                <span className="value" style={{ fontSize: 13 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Tiers() {
  return (
    <section className="section" id="tiers" style={{ background: "var(--bg-alt)" }}>
      <div className="container">
        <div className="sec-header">
          <h2>Sale <span className="grad-text">Tiers</span></h2>
          <p>Three phases with increasing price and decreasing bonus. Early supporters get the best deal.</p>
        </div>

        <div className="tier-grid">
          {ICO.tiers.map((tier) => (
            <div className={`glass tier-card ${tier.featured ? "featured" : ""}`} key={tier.name}>
              <div className="tier-name">{tier.name}</div>
              <div className="tier-price grad-text">{tier.price}</div>
              <div className="tier-bonus">{tier.bonus}</div>
              <ul className="tier-details">
                <li>Allocation: {tier.alloc}</li>
                <li>Minimum: {tier.min}</li>
                <li>Maximum: {tier.max}</li>
                <li>Status: {tier.status}</li>
                <li>UnyKorn L1 settlement</li>
                <li>Immediate token delivery</li>
              </ul>
              <button
                className={`tier-btn ${tier.featured ? "tier-btn-primary" : "tier-btn-outline"}`}
                disabled={tier.status === "SOLD OUT"}
                style={tier.status === "SOLD OUT" ? { opacity: 0.5, cursor: "not-allowed" } : {}}
              >
                {tier.status === "SOLD OUT" ? "Sold Out" : tier.status === "LIVE NOW" ? "Buy Now" : "Coming Soon"}
              </button>
            </div>
          ))}
        </div>

        {/* Accepted Payments */}
        <div style={{ marginTop: 48, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Accepted Payments
          </div>
          <div className="chain-row">
            {["USDT", "USDC", "ETH", "BTC"].map((c) => (
              <div className="glass chain-badge" key={c} style={{ fontSize: 13 }}>
                {c}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Roadmap() {
  return (
    <section className="section" id="roadmap">
      <div className="container">
        <div className="sec-header">
          <h2>Road<span className="grad-text">map</span></h2>
          <p>From genesis to global exchange listings — every milestone backed by shipped code.</p>
        </div>

        <div className="roadmap">
          {ICO.roadmap.map((item) => (
            <div className="roadmap-item" key={item.date}>
              <div className={`roadmap-dot ${item.active ? "active" : ""}`} />
              <div className="roadmap-date">{item.date}</div>
              <div className="roadmap-title">{item.title}</div>
              <div className="roadmap-desc">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contracts() {
  return (
    <section className="section" style={{ background: "var(--bg-alt)" }}>
      <div className="container">
        <div className="sec-header">
          <h2>Smart <span className="grad-text">Contracts</span></h2>
          <p>All contracts verified on-chain. No proxy patterns. No hidden admin functions.</p>
        </div>

        <div className="info-grid">
          {ICO.chains.map((c) => (
            <div className="glass info-card" key={c.name}>
              <h3>
                <span className="info-icon" style={{ background: `${c.color}22` }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", background: c.color, display: "block" }} />
                </span>
                {c.name}
              </h3>
              <div style={{
                fontFamily: "var(--mono)",
                fontSize: 12,
                padding: "12px 16px",
                borderRadius: "var(--r-sm)",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--glass-border)",
                wordBreak: "break-all",
                color: "var(--text-muted)",
                lineHeight: 1.8,
              }}>
                {c.contract}
              </div>
            </div>
          ))}
        </div>

        {/* Verification Links */}
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <div className="chain-row">
            {[
              { label: "UnyKorn Explorer", url: "https://main.unykorn-explorer.pages.dev" },
              { label: "GitHub", url: "https://github.com/FTHTrading/UnyKorn-X402-aws" },
            ].map((v) => (
              <a href={v.url} target="_blank" rel="noreferrer" className="glass chain-badge" key={v.label}
                style={{ fontSize: 13, color: "var(--blue)" }}>
                {v.label} ↗
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ExchangeReadiness() {
  const exchanges = [
    { name: "KuCoin", score: 100, status: "ready" },
    { name: "MEXC", score: 100, status: "ready" },
    { name: "Bitget", score: 100, status: "ready" },
    { name: "Crypto.com", score: 100, status: "ready" },
    { name: "HTX", score: 100, status: "ready" },
    { name: "CoinGecko", score: 100, status: "ready" },
    { name: "CMC", score: 100, status: "ready" },
    { name: "OKX", score: 89, status: "nearly-ready" },
    { name: "Gate", score: 89, status: "nearly-ready" },
    { name: "Bybit", score: 85, status: "nearly-ready" },
    { name: "Binance", score: 77, status: "nearly-ready" },
    { name: "Coinbase", score: 77, status: "nearly-ready" },
    { name: "Kraken", score: 74, status: "in-progress" },
  ];

  return (
    <section className="section" id="exchanges">
      <div className="container">
        <div className="sec-header">
          <h2>Exchange <span className="grad-text">Readiness</span></h2>
          <p>88% overall compliance score. 7 exchanges at 100% readiness. Built for the big boys.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
          {exchanges.map((ex) => {
            const color = ex.score >= 100 ? "var(--green)" : ex.score >= 85 ? "var(--gold)" : "var(--blue)";
            return (
              <div className="glass" key={ex.name} style={{ padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--mono)", color, marginBottom: 4 }}>
                  {ex.score}%
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{ex.name}</div>
                <div style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: "var(--r-full)",
                  fontSize: 11,
                  fontWeight: 600,
                  background: `${color}18`,
                  color,
                  border: `1px solid ${color}33`,
                  textTransform: "uppercase",
                }}>
                  {ex.status}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-links">
        <a href="https://main.unykorn-explorer.pages.dev" target="_blank" rel="noreferrer">Explorer</a>
        <a href="https://github.com/FTHTrading/UnyKorn-X402-aws" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://github.com/FTHTrading/UnyKorn-X402-aws/blob/main/docs/WHITEPAPER.md" target="_blank" rel="noreferrer">Whitepaper</a>
        <a href="https://github.com/FTHTrading/UnyKorn-X402-aws/blob/main/docs/TOKENOMICS.md" target="_blank" rel="noreferrer">Tokenomics</a>
        <a href="mailto:listing@unykorn.org">Contact</a>
      </div>
      <p>© 2025–2026 FTH Trading · UnyKorn Protocol · All rights reserved.</p>
      <p style={{ marginTop: 8, fontSize: 11, color: "var(--text-faint)" }}>
        This is not financial advice. Cryptocurrency investments carry risk. DYOR.
      </p>
    </footer>
  );
}

// ── App ───────────────────────────────────────────────────

export default function App() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      {/* Animated background orbs */}
      <div className="bg-mesh" />
      <div className="bg-orb-1" />
      <div className="bg-orb-2" />
      <div className="bg-orb-3" />

      <Nav />
      <Hero />
      <Stats />
      <WhatWeBuilt />
      <Tokenomics />
      <Tiers />
      <ExchangeReadiness />
      <Roadmap />
      <Contracts />
      <Footer />
    </>
  );
}
