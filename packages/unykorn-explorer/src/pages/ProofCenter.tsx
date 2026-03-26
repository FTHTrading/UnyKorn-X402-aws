import { useState } from "react";

// ── Types ──────────────────────────────────────────────────

interface AdminPower {
  id: string;
  name: string;
  description: string;
  exists: boolean;
  holder: string;
  controlMethod: string;
  riskLevel: string;
  plannedMitigation: string | null;
  mitigationStatus: string;
  canRugUsers: boolean;
}

interface VestingSchedule {
  id: string;
  beneficiary: string;
  totalAmount: string;
  releasedAmount: string;
  remainingAmount: string;
  cliffDate: string;
  vestingEnd: string;
  vestingType: string;
  contractEnforced: boolean;
  status: string;
}

interface TreasuryWallet {
  label: string;
  chain: string;
  balanceUNY: string;
  balanceUSD: string;
  purpose: string;
  controller: string;
  isMultiSig: boolean;
}

interface RiskFlag {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  exchangeQuestion: string;
  currentAnswer: string;
  mitigation: string;
  mitigationStatus: string;
}

interface SlaTarget {
  metric: string;
  target: string;
  current: string;
  met: boolean;
}

// ── Helpers ────────────────────────────────────────────────

function fmt(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return num.toLocaleString();
}

function StatusBadge({ status, color }: { status: string; color?: string }) {
  const colors: Record<string, string> = {
    pass: "#22c55e", implemented: "#22c55e", completed: "#22c55e", operational: "#22c55e",
    partial: "#eab308", "in-progress": "#eab308", "in-cliff": "#eab308", planned: "#3b82f6",
    fail: "#ef4444", "not-started": "#6b7280", none: "#22c55e",
    critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", info: "#6b7280",
  };
  const bg = color ?? colors[status] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block", padding: "0.15rem 0.6rem", borderRadius: "1rem",
      fontSize: "0.7rem", fontWeight: 600, background: `${bg}22`, color: bg,
      border: `1px solid ${bg}44`, textTransform: "uppercase",
    }}>{status}</span>
  );
}

function SectionCard({ title, children, icon }: { title: string; children: React.ReactNode; icon: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "1rem", padding: "1.5rem", marginBottom: "1.5rem",
    }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "1.4rem" }}>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

// ── Supply Data ────────────────────────────────────────────

const SUPPLY = {
  totalSupply: "1000000000", maxSupply: "1000000000", circulatingSupply: "50000000",
  lockedSupply: "350000000", treasurySupply: "400000000", burnedSupply: "0",
  stakedSupply: "0", lpSupply: "100000000", verificationMethod: "self-attested" as const,
};

const SUPPLY_BREAKDOWN = [
  { label: "Circulating", amount: "50,000,000", pct: 5, color: "#22c55e" },
  { label: "Treasury", amount: "400,000,000", pct: 40, color: "#3b82f6" },
  { label: "Locked (Vesting)", amount: "350,000,000", pct: 35, color: "#8b5cf6" },
  { label: "Liquidity Pool", amount: "100,000,000", pct: 10, color: "#06b6d4" },
  { label: "Burned", amount: "0", pct: 0, color: "#ef4444" },
  { label: "Staked", amount: "0", pct: 0, color: "#eab308" },
];

const VESTING: VestingSchedule[] = [
  { id: "vest-team", beneficiary: "Team & Founders", totalAmount: "150000000", releasedAmount: "0", remainingAmount: "150000000", cliffDate: "2026-07-01", vestingEnd: "2029-07-01", vestingType: "cliff-then-linear", contractEnforced: false, status: "in-cliff" },
  { id: "vest-ecosystem", beneficiary: "Ecosystem Fund", totalAmount: "200000000", releasedAmount: "0", remainingAmount: "200000000", cliffDate: "2025-10-01", vestingEnd: "2030-07-01", vestingType: "milestone", contractEnforced: false, status: "in-cliff" },
  { id: "vest-ico", beneficiary: "ICO Participants", totalAmount: "50000000", releasedAmount: "0", remainingAmount: "50000000", cliffDate: "2026-04-01", vestingEnd: "2026-10-01", vestingType: "linear", contractEnforced: false, status: "not-started" },
  { id: "vest-advisors", beneficiary: "Advisors & Partners", totalAmount: "50000000", releasedAmount: "0", remainingAmount: "50000000", cliffDate: "2026-07-01", vestingEnd: "2028-07-01", vestingType: "cliff-then-linear", contractEnforced: false, status: "not-started" },
];

const TREASURY: TreasuryWallet[] = [
  { label: "Main Treasury", chain: "UnyKorn L1 (7331)", balanceUNY: "400000000", balanceUSD: "4000000", purpose: "Development, grants, exchange liquidity, ops", controller: "Deployer key (single)", isMultiSig: false },
  { label: "LP Reserve", chain: "UnyKorn L1 (7331)", balanceUNY: "100000000", balanceUSD: "1000000", purpose: "DEX AMM / CEX listing liquidity", controller: "Deployer key (single)", isMultiSig: false },
];

const ADMIN_POWERS: AdminPower[] = [
  { id: "mint", name: "Mint New Tokens", description: "Create tokens beyond genesis supply", exists: false, holder: "N/A", controlMethod: "No mint function", riskLevel: "none", plannedMitigation: null, mitigationStatus: "implemented", canRugUsers: false },
  { id: "pause", name: "Pause Transfers", description: "Halt all token transfers", exists: false, holder: "N/A", controlMethod: "No pause function", riskLevel: "none", plannedMitigation: null, mitigationStatus: "implemented", canRugUsers: false },
  { id: "freeze", name: "Freeze Accounts", description: "Freeze/blacklist accounts", exists: false, holder: "N/A", controlMethod: "No freeze function", riskLevel: "none", plannedMitigation: null, mitigationStatus: "implemented", canRugUsers: false },
  { id: "upgrade", name: "Upgrade Contract", description: "Change contract logic", exists: false, holder: "N/A", controlMethod: "Immutable, no proxy", riskLevel: "none", plannedMitigation: null, mitigationStatus: "implemented", canRugUsers: false },
  { id: "burn", name: "Burn Tokens", description: "Burn own tokens", exists: true, holder: "Any holder", controlMethod: "ERC20Burnable (own tokens only)", riskLevel: "low", plannedMitigation: null, mitigationStatus: "implemented", canRugUsers: false },
  { id: "treasury", name: "Treasury Control", description: "Control treasury wallet", exists: true, holder: "Deployer key", controlMethod: "Single key", riskLevel: "critical", plannedMitigation: "Multi-sig 3-of-5 + 48h timelock", mitigationStatus: "planned", canRugUsers: true },
  { id: "pricing", name: "Gateway Pricing", description: "Set x402 API prices", exists: true, holder: "Founding team", controlMethod: "Code config", riskLevel: "medium", plannedMitigation: "On-chain governance", mitigationStatus: "planned", canRugUsers: false },
  { id: "validator", name: "Validator Set", description: "Control block validators", exists: true, holder: "Founding team", controlMethod: "Single-operator devnet", riskLevel: "high", plannedMitigation: "Open validator program", mitigationStatus: "planned", canRugUsers: false },
];

const RISK_FLAGS: RiskFlag[] = [
  { id: "r1", category: "security", severity: "critical", title: "No independent smart contract audit", description: "Token contract not audited by third party", exchangeQuestion: "Provide audit report", currentAnswer: "Planned. Using OpenZeppelin base.", mitigation: "Engage audit firm", mitigationStatus: "planned" },
  { id: "r2", category: "governance", severity: "critical", title: "Treasury — single deployer key", description: "400M UNY in single-key wallet", exchangeQuestion: "Is treasury multi-sig?", currentAnswer: "Not yet. Migration planned.", mitigation: "Multi-sig wallet", mitigationStatus: "planned" },
  { id: "r3", category: "legal", severity: "high", title: "No legal counsel", description: "No crypto counsel engaged", exchangeQuestion: "Who is your legal counsel?", currentAnswer: "Not yet engaged", mitigation: "Engage crypto counsel", mitigationStatus: "planned" },
  { id: "r4", category: "legal", severity: "high", title: "Token unclassified", description: "No formal token classification", exchangeQuestion: "Is your token a security?", currentAnswer: "Designed as utility. No legal opinion.", mitigation: "Token classification memo", mitigationStatus: "planned" },
  { id: "r5", category: "technical", severity: "high", title: "No public RPC endpoint", description: "No RPC for exchange integration", exchangeQuestion: "RPC endpoint?", currentAnswer: "Requires mainnet launch", mitigation: "Launch public mainnet", mitigationStatus: "planned" },
  { id: "r6", category: "technical", severity: "high", title: "Single validator", description: "Network has 1 validator", exchangeQuestion: "How many validators?", currentAnswer: "1 (controlled devnet)", mitigation: "Open validator program", mitigationStatus: "planned" },
  { id: "r7", category: "market", severity: "high", title: "No market maker", description: "No market maker arrangement", exchangeQuestion: "Who is your market maker?", currentAnswer: "Not yet engaged", mitigation: "Engage professional MM", mitigationStatus: "planned" },
  { id: "r8", category: "security", severity: "medium", title: "No bug bounty", description: "No responsible disclosure program", exchangeQuestion: "Bug bounty?", currentAnswer: "Planned", mitigation: "Launch on Immunefi", mitigationStatus: "planned" },
  { id: "r9", category: "governance", severity: "medium", title: "Vesting not on-chain", description: "Vesting relies on manual compliance", exchangeQuestion: "On-chain vesting?", currentAnswer: "No. Documented only.", mitigation: "Deploy vesting contracts", mitigationStatus: "planned" },
  { id: "r10", category: "operational", severity: "medium", title: "No status page", description: "No public uptime dashboard", exchangeQuestion: "Status page?", currentAnswer: "Internal monitoring only", mitigation: "Deploy public status page", mitigationStatus: "planned" },
  { id: "r11", category: "legal", severity: "medium", title: "No geo restrictions", description: "No jurisdictions blocked", exchangeQuestion: "Restricted jurisdictions?", currentAnswer: "None. Pending legal analysis.", mitigation: "Define blocked jurisdictions", mitigationStatus: "planned" },
];

const SLA_TARGETS: SlaTarget[] = [
  { metric: "Block time", target: "≤ 1s", current: "~1s (devnet)", met: true },
  { metric: "Gateway uptime", target: "99.9%", current: "99.9% (staging)", met: true },
  { metric: "Finality", target: "≤ 2s", current: "~1s (unverified)", met: false },
  { metric: "RPC availability", target: "99.5%", current: "Not public", met: false },
];

const EXCHANGE_SCORES = [
  { exchange: "CoinGecko", score: 65, status: "in-progress" },
  { exchange: "CMC", score: 60, status: "in-progress" },
  { exchange: "MEXC", score: 35, status: "in-progress" },
  { exchange: "KuCoin", score: 35, status: "in-progress" },
  { exchange: "Coinbase", score: 30, status: "not-ready" },
  { exchange: "Kraken", score: 30, status: "not-ready" },
  { exchange: "OKX", score: 25, status: "not-ready" },
  { exchange: "Binance", score: 20, status: "not-ready" },
];

// ── Tabs ───────────────────────────────────────────────────

type ProofTab = "supply" | "vesting" | "treasury" | "admin" | "risks" | "ops" | "exchanges";

const TABS: { key: ProofTab; label: string; icon: string }[] = [
  { key: "supply", label: "Supply", icon: "📊" },
  { key: "vesting", label: "Vesting", icon: "🔒" },
  { key: "treasury", label: "Treasury", icon: "🏦" },
  { key: "admin", label: "Admin Powers", icon: "🔑" },
  { key: "risks", label: "Risk Flags", icon: "⚠️" },
  { key: "ops", label: "Operations", icon: "🖥️" },
  { key: "exchanges", label: "Exchanges", icon: "📈" },
];

// ── Main Component ─────────────────────────────────────────

export default function ProofCenter() {
  const [tab, setTab] = useState<ProofTab>("supply");

  const criticals = RISK_FLAGS.filter(f => f.severity === "critical").length;
  const highs = RISK_FLAGS.filter(f => f.severity === "high").length;
  const mediums = RISK_FLAGS.filter(f => f.severity === "medium").length;
  const overallScore = Math.max(0, 100 - (criticals * 15) - (highs * 8) - (mediums * 3));

  return (
    <>
      {/* Hero */}
      <div className="ex-hero">
        <h1 className="ex-hero-title">
          <span className="gradient">Proof</span> Center
        </h1>
        <p className="ex-hero-sub">
          Complete transparency dashboard — supply math, vesting schedules, treasury wallets,
          admin powers disclosure, risk flags, and exchange readiness scores. Every claim is verifiable.
        </p>
      </div>

      {/* Readiness Score Banner */}
      <div className="ex-grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Exchange Readiness</div>
          <div className="ex-stat-value" style={{ color: overallScore > 60 ? "#22c55e" : overallScore > 30 ? "#eab308" : "#ef4444" }}>
            {overallScore}%
          </div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Risk Flags</div>
          <div className="ex-stat-value">
            <span style={{ color: "#ef4444" }}>{criticals}</span>
            <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 0.3rem" }}>/</span>
            <span style={{ color: "#f97316" }}>{highs}</span>
            <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 0.3rem" }}>/</span>
            <span style={{ color: "#eab308" }}>{mediums}</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>critical / high / medium</div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Verification</div>
          <div className="ex-stat-value" style={{ fontSize: "1rem", color: "#eab308" }}>Self-Attested</div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>No independent audit yet</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem",
        borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "0.75rem",
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "none",
            background: tab === t.key ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
            color: tab === t.key ? "#a78bfa" : "rgba(255,255,255,0.6)",
            cursor: "pointer", fontSize: "0.85rem", fontWeight: tab === t.key ? 600 : 400,
            transition: "all 0.2s",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "supply" && <SupplyTab />}
      {tab === "vesting" && <VestingTab />}
      {tab === "treasury" && <TreasuryTab />}
      {tab === "admin" && <AdminTab />}
      {tab === "risks" && <RisksTab />}
      {tab === "ops" && <OpsTab />}
      {tab === "exchanges" && <ExchangesTab />}
    </>
  );
}

// ── Tab Components ─────────────────────────────────────────

function SupplyTab() {
  return (
    <SectionCard title="Token Supply" icon="📊">
      <div className="ex-grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Total Supply</div>
          <div className="ex-stat-value">{fmt(SUPPLY.totalSupply)}</div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Circulating</div>
          <div className="ex-stat-value" style={{ color: "#22c55e" }}>{fmt(SUPPLY.circulatingSupply)}</div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>5% of total</div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Max Supply</div>
          <div className="ex-stat-value">{fmt(SUPPLY.maxSupply)}</div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>Fixed — no mint function</div>
        </div>
      </div>

      <h3 style={{ fontSize: "1rem", margin: "1.5rem 0 0.75rem" }}>Supply Breakdown</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Allocation</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Amount (UNY)</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>%</th>
            <th style={{ textAlign: "left", padding: "0.5rem", width: "40%" }}>Bar</th>
          </tr>
        </thead>
        <tbody>
          {SUPPLY_BREAKDOWN.map(s => (
            <tr key={s.label} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "0.5rem" }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: s.color, marginRight: "0.5rem" }} />
                {s.label}
              </td>
              <td style={{ textAlign: "right", padding: "0.5rem", fontFamily: "monospace" }}>{s.amount}</td>
              <td style={{ textAlign: "right", padding: "0.5rem" }}>{s.pct}%</td>
              <td style={{ padding: "0.5rem" }}>
                <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "0.25rem", height: "0.5rem", overflow: "hidden" }}>
                  <div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: "0.25rem" }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: "0.5rem", fontSize: "0.8rem", color: "#eab308" }}>
        ⚠️ <strong>Verification:</strong> Supply data is self-attested. No on-chain verification is possible until UnyKorn L1 mainnet launches with public RPC.
      </div>
    </SectionCard>
  );
}

function VestingTab() {
  const totalVesting = VESTING.reduce((s, v) => s + parseInt(v.totalAmount), 0);
  return (
    <SectionCard title="Vesting Schedules" icon="🔒">
      <div className="ex-grid-3" style={{ marginBottom: "1rem" }}>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Total Vesting</div>
          <div className="ex-stat-value">{fmt(totalVesting)}</div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Schedules</div>
          <div className="ex-stat-value">{VESTING.length}</div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Contract Enforced</div>
          <div className="ex-stat-value" style={{ color: "#ef4444" }}>0 / {VESTING.length}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Beneficiary</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Total</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Type</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Cliff</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>End</th>
            <th style={{ textAlign: "center", padding: "0.5rem" }}>On-Chain</th>
            <th style={{ textAlign: "center", padding: "0.5rem" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {VESTING.map(v => (
            <tr key={v.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "0.5rem", fontWeight: 500 }}>{v.beneficiary}</td>
              <td style={{ textAlign: "right", padding: "0.5rem", fontFamily: "monospace" }}>{fmt(v.totalAmount)}</td>
              <td style={{ padding: "0.5rem" }}>{v.vestingType}</td>
              <td style={{ padding: "0.5rem" }}>{v.cliffDate}</td>
              <td style={{ padding: "0.5rem" }}>{v.vestingEnd}</td>
              <td style={{ textAlign: "center", padding: "0.5rem" }}>
                <StatusBadge status={v.contractEnforced ? "pass" : "fail"} />
              </td>
              <td style={{ textAlign: "center", padding: "0.5rem" }}>
                <StatusBadge status={v.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.5rem", fontSize: "0.8rem", color: "#ef4444" }}>
        🔴 <strong>Gap:</strong> No vesting schedules are currently enforced by smart contracts. Compliance relies on manual processes. On-chain vesting contracts are planned.
      </div>
    </SectionCard>
  );
}

function TreasuryTab() {
  const totalUNY = TREASURY.reduce((s, w) => s + parseInt(w.balanceUNY), 0);
  return (
    <SectionCard title="Treasury Wallets" icon="🏦">
      <div className="ex-grid-3" style={{ marginBottom: "1rem" }}>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Total Treasury</div>
          <div className="ex-stat-value">{fmt(totalUNY)} UNY</div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Multi-Sig</div>
          <div className="ex-stat-value" style={{ color: "#ef4444" }}>0 / {TREASURY.length}</div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Controller</div>
          <div className="ex-stat-value" style={{ fontSize: "0.9rem", color: "#eab308" }}>Single Key</div>
        </div>
      </div>

      {TREASURY.map(w => (
        <div key={w.label} style={{
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "0.75rem", padding: "1rem", marginBottom: "0.75rem",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: 600 }}>{w.label}</span>
            <StatusBadge status={w.isMultiSig ? "multi-sig" : "single-key"} color={w.isMultiSig ? "#22c55e" : "#ef4444"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
            <div><strong>Chain:</strong> {w.chain}</div>
            <div><strong>Balance:</strong> {fmt(w.balanceUNY)} UNY (${fmt(w.balanceUSD)})</div>
            <div><strong>Purpose:</strong> {w.purpose}</div>
            <div><strong>Controller:</strong> {w.controller}</div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.5rem", fontSize: "0.8rem", color: "#ef4444" }}>
        🔴 <strong>Critical Gap:</strong> Treasury wallets are controlled by a single deployer key. Multi-sig (3-of-5 + 48h timelock) migration is planned. This is the #1 exchange blocker.
      </div>
    </SectionCard>
  );
}

function AdminTab() {
  return (
    <SectionCard title="Admin Powers Disclosure" icon="🔑">
      <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", marginBottom: "1rem" }}>
        Complete disclosure of all administrative powers in the UnyKorn system. 
        This is exactly what exchange security teams review during listing evaluation.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Power</th>
            <th style={{ textAlign: "center", padding: "0.5rem" }}>Exists?</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Holder</th>
            <th style={{ textAlign: "center", padding: "0.5rem" }}>Risk</th>
            <th style={{ textAlign: "center", padding: "0.5rem" }}>Rug?</th>
            <th style={{ textAlign: "center", padding: "0.5rem" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {ADMIN_POWERS.map(p => (
            <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "0.5rem" }}>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>{p.description}</div>
              </td>
              <td style={{ textAlign: "center", padding: "0.5rem" }}>
                {p.exists ? "✅" : "❌"}
              </td>
              <td style={{ padding: "0.5rem", fontSize: "0.75rem" }}>{p.holder}</td>
              <td style={{ textAlign: "center", padding: "0.5rem" }}>
                <StatusBadge status={p.riskLevel} />
              </td>
              <td style={{ textAlign: "center", padding: "0.5rem" }}>
                {p.canRugUsers ? <span style={{ color: "#ef4444" }}>⚠️ YES</span> : <span style={{ color: "#22c55e" }}>NO</span>}
              </td>
              <td style={{ textAlign: "center", padding: "0.5rem" }}>
                <StatusBadge status={p.mitigationStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {ADMIN_POWERS.filter(p => p.plannedMitigation).length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <h4 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Planned Mitigations</h4>
          {ADMIN_POWERS.filter(p => p.plannedMitigation).map(p => (
            <div key={p.id} style={{ fontSize: "0.8rem", padding: "0.3rem 0", color: "rgba(255,255,255,0.6)" }}>
              <strong>{p.name}:</strong> {p.plannedMitigation}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function RisksTab() {
  const grouped: Record<string, RiskFlag[]> = {};
  for (const f of RISK_FLAGS) {
    if (!grouped[f.severity]) grouped[f.severity] = [];
    grouped[f.severity].push(f);
  }
  const order: string[] = ["critical", "high", "medium", "low", "info"];

  return (
    <SectionCard title="Risk Flags" icon="⚠️">
      <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", marginBottom: "1rem" }}>
        Auto-detected risk flags from the Exchange Readiness OS risk engine.
        These are exactly the questions an exchange compliance team will ask.
      </p>

      {order.map(severity => {
        const flags = grouped[severity];
        if (!flags || flags.length === 0) return null;
        return (
          <div key={severity} style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <StatusBadge status={severity} /> {severity.toUpperCase()} ({flags.length})
            </h3>
            {flags.map(f => (
              <div key={f.id} style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "0.5rem", padding: "0.75rem", marginBottom: "0.5rem", fontSize: "0.8rem",
              }}>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{f.title}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: "0.25rem" }}>{f.description}</div>
                <div style={{ color: "rgba(255,255,255,0.4)" }}>
                  <strong>Exchange asks:</strong> "{f.exchangeQuestion}"
                </div>
                <div style={{ color: "rgba(255,255,255,0.4)" }}>
                  <strong>Current answer:</strong> {f.currentAnswer}
                </div>
                <div style={{ color: "#3b82f6", marginTop: "0.25rem" }}>
                  <strong>Mitigation:</strong> {f.mitigation} <StatusBadge status={f.mitigationStatus} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </SectionCard>
  );
}

function OpsTab() {
  return (
    <SectionCard title="Network Operations" icon="🖥️">
      <div className="ex-grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Network</div>
          <div className="ex-stat-value" style={{ fontSize: "1rem" }}>UnyKorn L1 (7331)</div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Status</div>
          <div className="ex-stat-value" style={{ color: "#22c55e" }}>Operational</div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>Controlled devnet</div>
        </div>
        <div className="ex-stat-card">
          <div className="ex-stat-label">Validators</div>
          <div className="ex-stat-value" style={{ color: "#eab308" }}>1</div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>Single operator</div>
        </div>
      </div>

      <h3 style={{ fontSize: "1rem", margin: "1.5rem 0 0.75rem" }}>SLA Targets</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Metric</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Target</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Current</th>
            <th style={{ textAlign: "center", padding: "0.5rem" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {SLA_TARGETS.map(s => (
            <tr key={s.metric} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "0.5rem", fontWeight: 500 }}>{s.metric}</td>
              <td style={{ padding: "0.5rem" }}>{s.target}</td>
              <td style={{ padding: "0.5rem" }}>{s.current}</td>
              <td style={{ textAlign: "center", padding: "0.5rem" }}>
                <StatusBadge status={s.met ? "pass" : "fail"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: "1rem", margin: "1.5rem 0 0.75rem" }}>Incident Response</h3>
      <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)" }}>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>SEV1</strong> (network outage, funds at risk): 15 min response, notify exchanges
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>SEV2</strong> (partial outage, vulnerability): 1 hour response, notify exchanges
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>SEV3</strong> (minor degradation): 4 hour response
        </div>
        <div>
          <strong>SEV4</strong> (cosmetic, planned maintenance): 24 hour response
        </div>
      </div>

      <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "0.5rem", fontSize: "0.8rem", color: "#3b82f6" }}>
        ℹ️ Post-mortem policy: All SEV1/SEV2 incidents require public post-mortem within 72 hours.
      </div>
    </SectionCard>
  );
}

function ExchangesTab() {
  return (
    <SectionCard title="Exchange Readiness Scores" icon="📈">
      <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", marginBottom: "1rem" }}>
        Per-exchange readiness scores based on each exchange's specific listing requirements.
        Scores are auto-computed by the Exchange Readiness OS risk engine.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Exchange</th>
            <th style={{ textAlign: "center", padding: "0.5rem" }}>Score</th>
            <th style={{ textAlign: "center", padding: "0.5rem" }}>Status</th>
            <th style={{ textAlign: "left", padding: "0.5rem", width: "50%" }}>Progress</th>
          </tr>
        </thead>
        <tbody>
          {EXCHANGE_SCORES.map(e => (
            <tr key={e.exchange} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "0.5rem", fontWeight: 600 }}>{e.exchange}</td>
              <td style={{ textAlign: "center", padding: "0.5rem", fontFamily: "monospace" }}>
                {e.score}%
              </td>
              <td style={{ textAlign: "center", padding: "0.5rem" }}>
                <StatusBadge status={e.status} />
              </td>
              <td style={{ padding: "0.5rem" }}>
                <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "0.25rem", height: "0.5rem", overflow: "hidden" }}>
                  <div style={{
                    width: `${e.score}%`, height: "100%", borderRadius: "0.25rem",
                    background: e.score > 60 ? "#22c55e" : e.score > 30 ? "#eab308" : "#ef4444",
                    transition: "width 0.6s ease",
                  }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Pre-Listing Checklist</h3>
        {[
          { item: "Legal counsel + token classification memo", done: false },
          { item: "Independent smart contract audit", done: false },
          { item: "Multi-sig treasury governance", done: false },
          { item: "Public mainnet with external validators", done: false },
          { item: "Market maker arrangement", done: false },
          { item: "Public status page + uptime SLA", done: false },
          { item: "Exchange integration documentation", done: false },
          { item: "Bug bounty program", done: false },
          { item: "CoinGecko / CMC API endpoints", done: true },
          { item: "Whitepaper v1.1 with truth layers", done: true },
          { item: "Tokenomics documentation", done: true },
          { item: "Block explorer", done: true },
          { item: "30-point compliance engine", done: true },
          { item: "Listing application generator", done: true },
        ].map((c, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.3rem 0", fontSize: "0.85rem",
            color: c.done ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.8)",
          }}>
            <span style={{ fontSize: "1rem" }}>{c.done ? "✅" : "⬜"}</span>
            <span style={{ textDecoration: c.done ? "line-through" : "none" }}>{c.item}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
