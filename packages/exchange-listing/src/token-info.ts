/**
 * Token Information Standard (TIS)
 *
 * Canonical metadata for UNY that exchanges, aggregators, portfolio
 * trackers, and wallets consume. Follows the union of CoinGecko,
 * CoinMarketCap, Binance, Coinbase, and Kraken asset-info schemas.
 *
 * This is the single source of truth served at:
 *   GET /listing/v1/asset-info
 */

import { createHash } from "crypto";

// ── Types ──────────────────────────────────────────────────

export interface TokenInfo {
  name: string;
  symbol: string;
  slug: string;
  decimals: number;
  totalSupply: string;
  maxSupply: string;
  circulatingSupply: string;
  isBurnable: boolean;
  isMintable: boolean;
  isPausable: boolean;
  standard: string;
  logoUrl: string;
  website: string;
  whitepaper: string;
  documentation: string;
  sourceCode: string;
  explorer: string;
  description: string;
  category: string;
  tags: string[];
  launchDate: string;
  genesisBlock: string;
  /** Contract deployments per chain */
  contracts: ContractDeployment[];
  /** Social/community links */
  community: CommunityLinks;
  /** Key team/entity info */
  issuer: IssuerInfo;
}

export interface ContractDeployment {
  chain: string;
  chainId: number;
  address: string;
  standard: string;
  decimals: number;
  verified: boolean;
  auditStatus: "audited" | "in-progress" | "unaudited";
  explorerUrl: string;
  deploymentTx?: string;
  bridgeType?: "native" | "lock-and-mint" | "burn-and-mint" | "canonical";
}

export interface CommunityLinks {
  twitter?: string;
  discord?: string;
  telegram?: string;
  github: string;
  medium?: string;
  reddit?: string;
  forum?: string;
}

export interface IssuerInfo {
  name: string;
  type: "foundation" | "dao" | "company" | "protocol";
  jurisdiction: string;
  registeredEntity?: string;
  website: string;
}

// ── Canonical UNY Token Info ───────────────────────────────

const GENESIS_SUPPLY = "1000000000";
const CIRCULATING_SUPPLY = "1000000000"; // All unlocked at genesis

export function getTokenInfo(burnedAmount?: string): TokenInfo {
  const burned = BigInt(burnedAmount ?? "0");
  const genesis = BigInt(GENESIS_SUPPLY) * 10n ** 18n;
  const current = genesis - burned;
  const circulatingWhole = current / 10n ** 18n;

  return {
    name: "UnyKorn Token",
    symbol: "UNY",
    slug: "unykorn",
    decimals: 18,
    totalSupply: circulatingWhole.toString(),
    maxSupply: GENESIS_SUPPLY,
    circulatingSupply: circulatingWhole.toString(),
    isBurnable: true,
    isMintable: false,
    isPausable: false,
    standard: "ERC-20",
    logoUrl: "https://assets.unykorn.org/logo/uny-512.png",
    website: "https://unykorn.org",
    whitepaper: "https://docs.unykorn.org/whitepaper",
    documentation: "https://docs.unykorn.org",
    sourceCode: "https://github.com/FTHTrading/UnyKorn-X402-aws",
    explorer: "https://main.unykorn-explorer.pages.dev",
    description:
      "UNY is the native utility and payment token for the UnyKorn L1 blockchain (Chain 7331) — " +
      "a purpose-built Layer 1 for AI infrastructure with sub-second Trinity Consensus finality. " +
      "UNY powers the x402 protocol, an HTTP 402 payment standard enabling AI agents and services " +
      "to transact in real-time. Built at genesis for AI-to-AI commerce, UNY powers invoice " +
      "settlement, agent-to-agent payments, namespace resolution, and protocol-level micropayments.",
    category: "Infrastructure",
    tags: [
      "payment-protocol",
      "ai-infrastructure",
      "trade-finance",
      "x402",
      "defi",
      "utility-token",
      "deflationary",
      "layer-1",
    ],
    launchDate: "2025-01-15T00:00:00Z",
    genesisBlock: "UnyKorn L1 Block #0 — Chain 7331",
    contracts: [
      {
        chain: "UnyKorn L1",
        chainId: 7331,
        address: "native",
        standard: "Native",
        decimals: 18,
        verified: true,
        auditStatus: "audited",
        explorerUrl: "https://main.unykorn-explorer.pages.dev",
        bridgeType: "native",
      },
    ],
    community: {
      github: "https://github.com/FTHTrading",
      twitter: "https://x.com/UnyKornProtocol",
      discord: "https://discord.gg/unykorn",
      telegram: "https://t.me/unykorn",
    },
    issuer: {
      name: "FTH Trading / UnyKorn Protocol",
      type: "protocol",
      jurisdiction: "International / Web3 Native",
      website: "https://unykorn.org",
    },
  };
}

/**
 * Generate a deterministic hash of the token info for verification
 */
export function hashTokenInfo(info: TokenInfo): string {
  const canonical = JSON.stringify(info, Object.keys(info).sort());
  return createHash("sha256").update(canonical).digest("hex");
}
