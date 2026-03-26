/**
 * Risk-Flag Engine
 *
 * Automated consistency checks that scan the Exchange Readiness State
 * and flag issues before an exchange reviewer finds them.
 *
 * Categories:
 *   - Data consistency (supply math, vesting totals, treasury balances)
 *   - Completeness (missing required fields for each exchange)
 *   - Security (audit status, admin powers, centralization)
 *   - Governance (multi-sig, vesting enforcement, key management)
 *   - Operations (status page, SLA compliance, incident history)
 */

import type {
  ExchangeReadinessState,
  RiskFlag,
  RiskSeverity,
} from "./types.js";
import { getExchangeReadinessState } from "./seed-data.js";

// ── Risk Scanner ───────────────────────────────────────────

export class RiskScanner {
  private flags: RiskFlag[] = [];

  /**
   * Run all risk checks against the current state
   */
  scan(state?: ExchangeReadinessState): RiskFlag[] {
    const s = state ?? getExchangeReadinessState();
    this.flags = [];

    this.checkSupplyConsistency(s);
    this.checkVestingConsistency(s);
    this.checkSecurityGaps(s);
    this.checkGovernanceGaps(s);
    this.checkOperationalGaps(s);
    this.checkLegalGaps(s);
    this.checkMarketGaps(s);
    this.checkTechnicalGaps(s);

    return this.flags;
  }

  /**
   * Get summary report
   */
  getSummary(flags?: RiskFlag[]): RiskSummary {
    const f = flags ?? this.flags;
    return {
      totalFlags: f.length,
      critical: f.filter(r => r.severity === "critical").length,
      high: f.filter(r => r.severity === "high").length,
      medium: f.filter(r => r.severity === "medium").length,
      low: f.filter(r => r.severity === "low").length,
      info: f.filter(r => r.severity === "info").length,
      byCategory: this.groupBy(f, "category"),
      blockers: f.filter(r => r.severity === "critical" || r.severity === "high"),
      recommendations: f
        .filter(r => r.mitigationStatus === "planned")
        .map(r => `[${r.severity.toUpperCase()}] ${r.title}: ${r.mitigation}`),
    };
  }

  // ── Data Consistency Checks ──────────────────────────────

  private checkSupplyConsistency(s: ExchangeReadinessState): void {
    const total = BigInt(s.supply.totalSupply);
    const circulating = BigInt(s.supply.circulatingSupply);
    const locked = BigInt(s.supply.lockedSupply);
    const treasury = BigInt(s.supply.treasurySupply);
    const burned = BigInt(s.supply.burnedSupply);
    const staked = BigInt(s.supply.stakedSupply);
    const lp = BigInt(s.supply.lpSupply);

    const sum = circulating + locked + treasury + burned + staked + lp;

    if (sum !== total) {
      this.addFlag({
        id: "consistency-supply-math",
        category: "technical",
        severity: "critical",
        title: "Supply components don't sum to total",
        description: `Circulating (${circulating}) + Locked (${locked}) + Treasury (${treasury}) + Burned (${burned}) + Staked (${staked}) + LP (${lp}) = ${sum}, but totalSupply = ${total}`,
        exchangeQuestion: "Your supply numbers don't add up. Please explain.",
        currentAnswer: "Data inconsistency in supply snapshot. Being corrected.",
        mitigation: "Fix supply snapshot data to ensure all components sum to total supply",
        mitigationStatus: "in-progress",
        expectedResolution: "Immediate",
      });
    }

    // Max supply >= total supply
    const max = BigInt(s.supply.maxSupply);
    if (total > max) {
      this.addFlag({
        id: "consistency-supply-exceeds-max",
        category: "technical",
        severity: "critical",
        title: "Total supply exceeds max supply",
        description: `totalSupply (${total}) > maxSupply (${max})`,
        exchangeQuestion: "How can total supply exceed the cap?",
        currentAnswer: "Data error. Total should never exceed max.",
        mitigation: "Fix supply data",
        mitigationStatus: "in-progress",
        expectedResolution: "Immediate",
      });
    }
  }

  private checkVestingConsistency(s: ExchangeReadinessState): void {
    const totalVesting = s.vesting.reduce(
      (sum, v) => sum + BigInt(v.totalAmount),
      0n
    );
    const totalSupply = BigInt(s.supply.totalSupply);

    if (totalVesting > totalSupply) {
      this.addFlag({
        id: "consistency-vesting-exceeds-supply",
        category: "technical",
        severity: "high",
        title: "Vesting total exceeds total supply",
        description: `Sum of all vesting schedules (${totalVesting}) exceeds totalSupply (${totalSupply})`,
        exchangeQuestion: "Your vesting allocations exceed the total token supply.",
        currentAnswer: "Data inconsistency. Being corrected.",
        mitigation: "Reconcile vesting schedule totals with issuance plan",
        mitigationStatus: "in-progress",
        expectedResolution: "Immediate",
      });
    }

    // Check for unreleased > remaining
    for (const v of s.vesting) {
      const released = BigInt(v.releasedAmount);
      const remaining = BigInt(v.remainingAmount);
      const total = BigInt(v.totalAmount);
      if (released + remaining !== total) {
        this.addFlag({
          id: `consistency-vesting-${v.id}`,
          category: "technical",
          severity: "medium",
          title: `Vesting math mismatch: ${v.beneficiary}`,
          description: `Released (${released}) + Remaining (${remaining}) ≠ Total (${total})`,
          exchangeQuestion: "Vesting schedule numbers are inconsistent.",
          currentAnswer: "Data reconciliation in progress.",
          mitigation: `Fix vesting schedule for ${v.beneficiary}`,
          mitigationStatus: "in-progress",
          expectedResolution: "Immediate",
        });
      }
    }
  }

  // ── Security Checks ──────────────────────────────────────

  private checkSecurityGaps(s: ExchangeReadinessState): void {
    const completedAudits = s.security.audits.filter(a => a.status === "completed");

    if (completedAudits.length === 0) {
      this.addFlag({
        id: "security-no-audit",
        category: "security",
        severity: "critical",
        title: "No completed smart contract audit",
        description: "No independent third-party audit has been completed for the token contract.",
        exchangeQuestion: "Provide your audit report.",
        currentAnswer: "Audit is planned but not yet completed. OpenZeppelin base is used.",
        mitigation: "Engage audit firm (Trail of Bits, OpenZeppelin, Certik, Quantstamp)",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    if (!s.security.bugBounty || s.security.bugBounty.status !== "active") {
      this.addFlag({
        id: "security-no-bounty",
        category: "security",
        severity: "medium",
        title: "No active bug bounty",
        description: "No bug bounty or responsible disclosure program is active.",
        exchangeQuestion: "Do you have a bug bounty program? Link?",
        currentAnswer: "Planned. Not yet launched.",
        mitigation: "Launch on Immunefi or HackerOne",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    const unresolvedAudits = completedAudits.filter(a => !a.allResolved && a.criticalFindings > 0);
    for (const a of unresolvedAudits) {
      this.addFlag({
        id: `security-unresolved-${a.auditor.toLowerCase().replace(/\s/g, "-")}`,
        category: "security",
        severity: "critical",
        title: `Unresolved critical findings: ${a.auditor}`,
        description: `Audit by ${a.auditor} has ${a.criticalFindings} unresolved critical findings.`,
        exchangeQuestion: "You have unresolved critical audit findings. Status?",
        currentAnswer: `Working on resolution. ${a.findingsSummary ?? "Details pending."}`,
        mitigation: "Resolve all critical findings and get re-audit confirmation",
        mitigationStatus: "in-progress",
        expectedResolution: null,
      });
    }
  }

  // ── Governance Checks ────────────────────────────────────

  private checkGovernanceGaps(s: ExchangeReadinessState): void {
    // Multi-sig check
    const singleKeyWallets = s.treasuryWallets.filter(w => !w.isMultiSig);
    const totalInSingleKey = singleKeyWallets.reduce(
      (sum, w) => sum + BigInt(w.balanceUNY),
      0n
    );

    if (totalInSingleKey > 0n) {
      this.addFlag({
        id: "governance-no-multisig",
        category: "governance",
        severity: "critical",
        title: "Treasury funds in single-key wallets",
        description: `${totalInSingleKey.toLocaleString()} UNY held in wallets without multi-sig protection.`,
        exchangeQuestion: "Is your treasury multi-sig? Who are the signers?",
        currentAnswer: "Not yet. Single deployer key. Multi-sig migration planned.",
        mitigation: "Implement Gnosis Safe or equivalent multi-sig (3-of-5, 48h timelock)",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    // Vesting enforcement
    const unenforced = s.vesting.filter(v => !v.contractEnforced);
    if (unenforced.length > 0) {
      this.addFlag({
        id: "governance-vesting-unenforced",
        category: "governance",
        severity: "medium",
        title: "Vesting not smart-contract enforced",
        description: `${unenforced.length} vesting schedules rely on manual compliance, not on-chain contracts.`,
        exchangeQuestion: "Are vesting schedules enforced on-chain?",
        currentAnswer: `No. ${unenforced.length} schedule(s) are documented but not contract-enforced.`,
        mitigation: "Deploy vesting contracts with on-chain enforcement",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    // Admin powers with rug risk
    const rugPowers = s.adminPowers.filter(p => p.exists && p.canRugUsers);
    for (const p of rugPowers) {
      if (p.mitigationStatus !== "implemented") {
        this.addFlag({
          id: `governance-rug-risk-${p.id}`,
          category: "governance",
          severity: "critical",
          title: `Rug risk: ${p.name}`,
          description: `${p.description} — this power exists and could affect user funds.`,
          exchangeQuestion: `Can you ${p.name.toLowerCase()}? Who controls this?`,
          currentAnswer: `${p.holder}. ${p.controlMethod}`,
          mitigation: p.plannedMitigation ?? "Implement mitigation",
          mitigationStatus: p.mitigationStatus,
          expectedResolution: "2026-Q3",
        });
      }
    }
  }

  // ── Operational Checks ───────────────────────────────────

  private checkOperationalGaps(s: ExchangeReadinessState): void {
    if (!s.networkOps.statusPageUrl) {
      this.addFlag({
        id: "ops-no-status-page",
        category: "operational",
        severity: "medium",
        title: "No public status page",
        description: "No public status page or uptime dashboard is available.",
        exchangeQuestion: "Where is your status page? What is your SLA?",
        currentAnswer: "Status page is planned. Guardian daemons monitor internally.",
        mitigation: "Deploy public status page (Statuspage.io or equivalent)",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    if (s.networkOps.activeValidators <= 1) {
      this.addFlag({
        id: "ops-single-validator",
        category: "technical",
        severity: "high",
        title: "Single validator (centralized)",
        description: `Only ${s.networkOps.activeValidators} validator(s) securing the network.`,
        exchangeQuestion: "How many validators? Is the network centralized?",
        currentAnswer: "Currently 1 validator on controlled devnet. External validators planned at mainnet.",
        mitigation: "Open validator program with staking, target 21+ at mainnet",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    const failedSla = s.networkOps.slaTargets.filter(t => !t.met);
    if (failedSla.length > 0) {
      this.addFlag({
        id: "ops-sla-gaps",
        category: "operational",
        severity: "medium",
        title: `${failedSla.length} SLA target(s) not met`,
        description: `SLA gaps: ${failedSla.map(t => t.metric).join(", ")}`,
        exchangeQuestion: "What are your SLA commitments?",
        currentAnswer: `${failedSla.length} targets not yet met: ${failedSla.map(t => `${t.metric} (target: ${t.target}, current: ${t.current})`).join("; ")}`,
        mitigation: "Achieve SLA targets before exchange listing",
        mitigationStatus: "in-progress",
        expectedResolution: "2026-Q3",
      });
    }
  }

  // ── Legal Checks ─────────────────────────────────────────

  private checkLegalGaps(s: ExchangeReadinessState): void {
    if (!s.issuer.legalCounsel) {
      this.addFlag({
        id: "legal-no-counsel",
        category: "legal",
        severity: "high",
        title: "No legal counsel",
        description: "No outside legal counsel has been engaged for crypto-specific advice.",
        exchangeQuestion: "Who is your legal counsel?",
        currentAnswer: "Not yet engaged.",
        mitigation: "Engage crypto-specialized counsel",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    if (!s.issuer.tokenClassification || s.issuer.tokenClassification.classification === "unclassified") {
      this.addFlag({
        id: "legal-no-classification",
        category: "legal",
        severity: "high",
        title: "Token not classified",
        description: "No formal legal analysis of token classification has been performed.",
        exchangeQuestion: "Is your token a security? Legal basis?",
        currentAnswer: "Designed as utility token. No formal legal opinion yet.",
        mitigation: "Obtain formal token classification memo from outside counsel",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    if (s.issuer.restrictedJurisdictions.length === 0) {
      this.addFlag({
        id: "legal-no-geo-restrictions",
        category: "legal",
        severity: "medium",
        title: "No jurisdictional restrictions",
        description: "No jurisdictions have been formally blocked from the ICO or token acquisition.",
        exchangeQuestion: "Which jurisdictions are restricted?",
        currentAnswer: "None currently. Pending legal analysis.",
        mitigation: "Define restricted jurisdictions based on legal counsel advice",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }
  }

  // ── Market Checks ────────────────────────────────────────

  private checkMarketGaps(s: ExchangeReadinessState): void {
    if (!s.marketStructure.marketMaker || s.marketStructure.marketMaker.status === "not-started") {
      this.addFlag({
        id: "market-no-maker",
        category: "market",
        severity: "high",
        title: "No market maker",
        description: "No market maker arrangement exists for providing liquidity.",
        exchangeQuestion: "Who is your market maker?",
        currentAnswer: "Not yet engaged.",
        mitigation: "Engage professional market maker (Wintermute, GSR, Amber)",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    if (s.marketStructure.dexLiquidity.length === 0) {
      this.addFlag({
        id: "market-no-dex-liquidity",
        category: "market",
        severity: "medium",
        title: "No DEX liquidity",
        description: "No decentralized exchange liquidity pools exist.",
        exchangeQuestion: "Is there existing DEX liquidity?",
        currentAnswer: "Not yet. Native AMM is planned.",
        mitigation: "Deploy initial liquidity on UnyKorn native AMM",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }
  }

  // ── Technical Checks ─────────────────────────────────────

  private checkTechnicalGaps(s: ExchangeReadinessState): void {
    if (!s.walletIntegration.rpcUrl) {
      this.addFlag({
        id: "tech-no-rpc",
        category: "technical",
        severity: "high",
        title: "No public RPC endpoint",
        description: "No publicly accessible RPC endpoint exists for wallet/node integration.",
        exchangeQuestion: "What is the RPC endpoint for our infrastructure?",
        currentAnswer: "Not yet available. Requires mainnet launch.",
        mitigation: "Launch public mainnet with documented RPC/WSS",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    if (!s.walletIntegration.testnetAvailable) {
      this.addFlag({
        id: "tech-no-testnet",
        category: "technical",
        severity: "medium",
        title: "No public testnet",
        description: "No public testnet is available for exchange engineers to test integration.",
        exchangeQuestion: "Do you have a testnet we can use?",
        currentAnswer: "Not yet. Testnet is planned alongside mainnet.",
        mitigation: "Deploy public testnet with faucet for exchange testing",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }

    if (!s.walletIntegration.integrationDocsUrl) {
      this.addFlag({
        id: "tech-no-integration-docs",
        category: "technical",
        severity: "medium",
        title: "No exchange integration documentation",
        description: "No dedicated wallet/exchange integration guide exists.",
        exchangeQuestion: "Where are the integration docs for our engineering team?",
        currentAnswer: "Whitepaper and tokenomics documents exist. Exchange-specific integration guide is planned.",
        mitigation: "Write exchange-engineer-facing integration guide",
        mitigationStatus: "planned",
        expectedResolution: "2026-Q3",
      });
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  private addFlag(flag: Omit<RiskFlag, "source">): void {
    this.flags.push({ ...flag, source: "auto" });
  }

  private groupBy(flags: RiskFlag[], key: keyof RiskFlag): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const f of flags) {
      const k = String(f[key]);
      groups[k] = (groups[k] ?? 0) + 1;
    }
    return groups;
  }
}

// ── Types ──────────────────────────────────────────────────

export interface RiskSummary {
  totalFlags: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  byCategory: Record<string, number>;
  blockers: RiskFlag[];
  recommendations: string[];
}
