/**
 * Exchange Packet Generator
 *
 * Generates exchange-specific listing packets for each target exchange.
 * Each packet contains the full Exchange Readiness State plus
 * exchange-specific customizations (required fields, formats, etc.).
 *
 * Supported exchanges:
 *   Coinbase, Kraken, Binance, OKX, KuCoin, MEXC, Bitget, Gate,
 *   CoinGecko, CoinMarketCap
 */

import type { ExchangePacket, RiskFlag } from "./types.js";
import {
  ISSUER,
  TOKEN_REGISTRY,
  SUPPLY_SNAPSHOT,
  VESTING_SCHEDULES,
  TREASURY_WALLETS,
  ADMIN_POWERS,
  SECURITY_POSTURE,
  MARKET_STRUCTURE,
  NETWORK_OPS,
  WALLET_INTEGRATION,
  getExchangeReadinessState,
} from "./seed-data.js";

// ── Supported Exchanges ────────────────────────────────────

export const SUPPORTED_EXCHANGES = [
  "coinbase",
  "kraken",
  "binance",
  "okx",
  "kucoin",
  "mexc",
  "bitget",
  "gate",
  "coingecko",
  "coinmarketcap",
] as const;

export type SupportedExchange = (typeof SUPPORTED_EXCHANGES)[number];

// ── Packet Generator ───────────────────────────────────────

export class ExchangePacketGenerator {
  /**
   * Generate a listing packet for a specific exchange
   */
  generate(exchange: string): ExchangePacket {
    const normalized = exchange.toLowerCase().replace(/\s+/g, "") as SupportedExchange;
    const state = getExchangeReadinessState();

    const base: ExchangePacket = {
      exchange: this.displayName(normalized),
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      issuer: state.issuer,
      token: state.token,
      supply: state.supply,
      vesting: state.vesting,
      treasuryWallets: state.treasuryWallets,
      adminPowers: state.adminPowers,
      security: state.security,
      networkOps: state.networkOps,
      marketStructure: state.marketStructure,
      walletIntegration: state.walletIntegration,
      exchangeSpecific: this.getExchangeSpecific(normalized),
      riskFlags: state.riskFlags,
      completenessScore: this.computeCompleteness(normalized, state.riskFlags),
    };

    return base;
  }

  /**
   * Generate packets for all supported exchanges
   */
  generateAll(): ExchangePacket[] {
    return SUPPORTED_EXCHANGES.map((ex) => this.generate(ex));
  }

  /**
   * Get display name for exchange
   */
  private displayName(exchange: SupportedExchange): string {
    const names: Record<SupportedExchange, string> = {
      coinbase: "Coinbase",
      kraken: "Kraken",
      binance: "Binance",
      okx: "OKX",
      kucoin: "KuCoin",
      mexc: "MEXC",
      bitget: "Bitget",
      gate: "Gate.io",
      coingecko: "CoinGecko",
      coinmarketcap: "CoinMarketCap",
    };
    return names[exchange] ?? exchange;
  }

  /**
   * Exchange-specific fields that each exchange requires beyond the standard packet
   */
  private getExchangeSpecific(exchange: SupportedExchange): Record<string, unknown> {
    switch (exchange) {
      case "coinbase":
        return {
          assetHubSubmission: true,
          legalReviewRequired: true,
          technicalSecurityReview: true,
          businessAssessment: true,
          decentralizationScore: "Low — single validator, single deployer key",
          regulatoryStatus: "No formal classification. Designed as utility token.",
          usPerson: true,
          supportedNetworks: ["UnyKorn L1 (Chain 7331)"],
          custodyModel: "Self-custody / exchange custody (no third-party custodian)",
          marketCapTier: "Pre-listing — no live market",
        };

      case "kraken":
        return {
          micaWhitepaper: false,
          micaRequired: "Yes — for EEA listing",
          formalApplicationSubmitted: false,
          technicalIntegrationGuide: false,
          complianceReviewStatus: "Not started",
          supportedCurrencies: ["UNY"],
          depositMinimum: "100 UNY",
          withdrawalMinimum: "50 UNY",
          networkFee: "0.1 UNY",
        };

      case "binance":
        return {
          safuFundContribution: "To be negotiated",
          proofOfReservesCompliant: true,
          communityVote: false,
          amaCompleted: false,
          binanceLabsInvestment: false,
          dailyActiveUsers: 0,
          monthlyActiveUsers: 0,
          twitterFollowers: 0,
          telegramMembers: 0,
          githubContributors: 1,
          githubCommits: "435+",
        };

      case "okx":
        return {
          projectDisclosure: true,
          tokenListingApplication: false,
          technicalReview: false,
          complianceCheck: false,
          communityMetrics: {
            twitter: 0,
            telegram: 0,
            discord: 0,
          },
        };

      case "kucoin":
        return {
          projectForm: false,
          technicalReview: false,
          communityRequirements: "Lower bar than Tier 1 — focus on tech + narrative",
          listingFee: "Negotiable",
        };

      case "mexc":
        return {
          applicationSubmitted: false,
          technicalIntegration: false,
          fastTrackEligible: true,
          memeTokenFriendly: false,
          projectCategory: "AI Infrastructure / DePIN",
        };

      case "bitget":
        return {
          listingFormSubmitted: false,
          communityMetrics: "Pre-launch — building",
          launchpadEligible: false,
        };

      case "gate":
        return {
          applicationSubmitted: false,
          depositWithdrawSetup: false,
          startupLaunchpad: false,
        };

      case "coingecko":
        return {
          apiEndpoints: {
            pairs: "/listing/v1/pairs",
            tickers: "/listing/v1/tickers",
            orderbook: "/listing/v1/orderbook",
            historicalTrades: "/listing/v1/historical_trades",
          },
          contractVerified: false,
          trustScoreRequirements: "Live trading data required",
          apiCompliance: "Endpoints built and serving data. Awaiting live trading.",
        };

      case "coinmarketcap":
        return {
          selfReportingForm: false,
          contractAddress: "native (UnyKorn L1)",
          explorerUrl: "https://main.unykorn-explorer.pages.dev",
          apiEndpoints: {
            summary: "/listing/v1/summary",
            assets: "/listing/v1/assets",
          },
          cmcApiCompliance: "Endpoints built. Awaiting live contract address on verifiable chain.",
        };

      default:
        return {};
    }
  }

  /**
   * Compute completeness score for a given exchange
   */
  private computeCompleteness(exchange: SupportedExchange, riskFlags: RiskFlag[]): number {
    // Base completeness from what's built
    let score = 50; // 50% for having code, docs, whitepaper, explorer

    // Deductions for critical gaps
    const criticals = riskFlags.filter(f => f.severity === "critical").length;
    const highs = riskFlags.filter(f => f.severity === "high").length;
    score -= criticals * 10;
    score -= highs * 5;

    // Exchange-specific bonuses
    switch (exchange) {
      case "coingecko":
      case "coinmarketcap":
        score += 15; // APIs are built
        break;
      case "kucoin":
      case "mexc":
        score += 5; // Lower requirements
        break;
    }

    return Math.max(0, Math.min(100, score));
  }
}
