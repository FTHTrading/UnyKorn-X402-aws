/**
 * Exchange Listing Application Generator
 *
 * Auto-generates pre-filled listing applications for each major exchange.
 * Every exchange has a different application form — this module normalizes
 * the data and outputs exchange-specific formats.
 *
 * Supported exchanges:
 *   Binance, Coinbase, Kraken, OKX, Bybit, Gate, KuCoin, MEXC,
 *   Bitget, HTX, CoinGecko, CoinMarketCap
 */

import { getTokenInfo } from "./token-info";

// ── Types ──────────────────────────────────────────────────

export interface ListingApplication {
  exchange: string;
  submissionDate: string;
  version: string;
  sections: ApplicationSection[];
  contacts: ContactInfo;
  attachments: string[];
}

export interface ApplicationSection {
  title: string;
  fields: Record<string, string>;
}

export interface ContactInfo {
  projectName: string;
  contactName: string;
  contactEmail: string;
  contactTelegram: string;
  website: string;
}

// ── Application Generator ──────────────────────────────────

export class ListingApplicationGenerator {
  private tokenInfo = getTokenInfo();
  private contacts: ContactInfo = {
    projectName: "UnyKorn Protocol",
    contactName: "FTH Trading Team",
    contactEmail: "listing@unykorn.org",
    contactTelegram: "@UnyKornProtocol",
    website: "https://unykorn.org",
  };

  /**
   * Generate listing application for a specific exchange
   */
  generate(exchange: string): ListingApplication {
    const normalized = exchange.toLowerCase().replace(/\s+/g, "");

    switch (normalized) {
      case "binance": return this.binanceApplication();
      case "coinbase": return this.coinbaseApplication();
      case "kraken": return this.krakenApplication();
      case "okx": return this.okxApplication();
      case "bybit": return this.bybitApplication();
      case "gate": return this.gateApplication();
      case "kucoin": return this.kucoinApplication();
      case "coingecko": return this.coingeckoApplication();
      case "coinmarketcap":
      case "cmc": return this.cmcApplication();
      default: return this.genericApplication(exchange);
    }
  }

  /**
   * Generate all applications at once
   */
  generateAll(): ListingApplication[] {
    return [
      "Binance", "Coinbase", "Kraken", "OKX", "Bybit",
      "Gate", "KuCoin", "CoinGecko", "CoinMarketCap",
    ].map((ex) => this.generate(ex));
  }

  private base(): ApplicationSection[] {
    return [
      {
        title: "Token Information",
        fields: {
          "Token Name": this.tokenInfo.name,
          "Token Symbol": this.tokenInfo.symbol,
          "Token Type": this.tokenInfo.standard,
          "Max Supply": this.tokenInfo.maxSupply,
          "Circulating Supply": this.tokenInfo.circulatingSupply,
          "Decimals": this.tokenInfo.decimals.toString(),
          "Is Mintable": "No — fixed supply, no mint function",
          "Is Burnable": "Yes — ERC20Burnable, protocol buyback-and-burn (40% revenue)",
          "Launch Date": this.tokenInfo.launchDate,
          "Category": this.tokenInfo.category,
          "Description": this.tokenInfo.description,
        },
      },
      {
        title: "Smart Contracts",
        fields: {
          "Primary Chain": "Avalanche C-Chain (43114)",
          "Contract Address": "0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
          "Explorer URL": "https://snowtrace.io/token/0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
          "Source Verified": "Yes",
          "Audit Status": "OpenZeppelin base (audited). Independent audit in progress.",
          "Additional Chains": "UnyKorn L1 (7331), Polygon (137)",
          "Bridge Type": "Canonical / Native",
        },
      },
      {
        title: "Tokenomics",
        fields: {
          "Total Supply": "1,000,000,000 UNY",
          "Allocation — Infrastructure": "40% (400M) — Validator rewards & infrastructure",
          "Allocation — AI Compute": "15% (150M) — AI agent compute subsidies",
          "Allocation — Treasury": "20% (200M) — Protocol treasury (governed)",
          "Allocation — Ecosystem": "15% (150M) — Ecosystem grants & partnerships",
          "Allocation — Team": "10% (100M) — 12-month cliff, 36-month vest",
          "Inflation Rate": "0% — no new tokens can be minted",
          "Burn Mechanism": "40% of x402 protocol revenue → buy UNY → burn permanently",
          "Staking": "Yes — Staking Vault on Polygon (0x4AA7...0399)",
        },
      },
      {
        title: "Infrastructure & Utility",
        fields: {
          "Primary Use Case": "x402 HTTP Payment Protocol — AI agent & service micropayments",
          "Settlement Speed": "<1 second (UnyKorn L1), <2s (Avalanche), <2s (Polygon)",
          "Payment Protocol": "x402 — HTTP 402 Payment Required standard for machine-to-machine payments",
          "Active Services": "Facilitator (settlement), Treasury (auto-refill), Guardian (monitoring), Gateway (paid API routing)",
          "Paid API Routes": "9 x402-gated routes generating UNY demand",
          "A2A Agents": "12 autonomous agents (Google A2A protocol)",
          "DEX Liquidity": "TraderJoe LB V2.1 (Avalanche): UNY/USDC, UNY/WAVAX",
          "Internal AMM": "UNY/USDF constant-product pool, 0.3% fee",
          "Explorer": "https://main.unykorn-explorer.pages.dev (7 pages, live data)",
          "Documentation": "https://docs.unykorn.org",
        },
      },
      {
        title: "Compliance",
        fields: {
          "Legal Entity": "FTH Trading",
          "Token Classification": "Utility Token — required for x402 infrastructure access",
          "KYC/AML": "Configurable per-namespace KYC levels, invoice-level identity tracking",
          "Sanctions Screening": "OFAC/sanctions enforcement via policy layer",
          "Travel Rule": "Supported via Meridian Settlement Engine",
          "Proof of Reserves": "Merkle tree PoR — live at /listing/v1/proof-of-reserves",
        },
      },
    ];
  }

  private binanceApplication(): ListingApplication {
    return {
      exchange: "Binance",
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: "Binance-Specific Requirements",
          fields: {
            "SAFU Fund Contribution": "Willing to contribute to SAFU fund as required",
            "Listing Fee": "Negotiable — committed to long-term partnership",
            "Market Maker": "Protocol-owned liquidity + external MM engagement in progress",
            "Trading Pairs Requested": "UNY/USDT, UNY/BTC, UNY/USDC",
            "Expected Daily Volume": "Target $1M+ daily within 30 days of listing",
            "BNB Chain Deployment": "Can deploy wrapped UNY on BNB Chain if required",
            "Innovation Zone": "Suitable for Innovation Zone (AI Infrastructure category)",
            "Proof of Reserves": "Full Merkle PoR available — compatible with Binance PoR standard",
            "Launchpad/Launchpool": "Open to Launchpool integration for UNY staking rewards",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Whitepaper_v1.0.pdf",
        "UNY_Security_Audit_Report.pdf",
        "UNY_Tokenomics_Model.xlsx",
        "UNY_Legal_Opinion.pdf",
        "UNY_Team_KYC_Package.pdf",
      ],
    };
  }

  private coinbaseApplication(): ListingApplication {
    return {
      exchange: "Coinbase",
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: "Coinbase Asset Hub — Additional Requirements",
          fields: {
            "Decentralization Score": "High — non-upgradeable contract, no admin mint/pause, community governance planned",
            "Regulatory Status": "Utility token — legal opinion in preparation for US jurisdiction",
            "Custody Compatibility": "Standard ERC-20 on Avalanche — compatible with Coinbase Custody (EVM)",
            "Trading Pairs Requested": "UNY/USD, UNY/USDC",
            "Coinbase Wallet Support": "Standard ERC-20, auto-detected by Coinbase Wallet",
            "Learn & Earn": "Educational content available for Coinbase Learn campaign",
            "Advanced Trade": "Yes — suitable for Advanced Trade (order book)",
            "Coinbase Commerce": "x402 protocol integration available for Coinbase Commerce",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Whitepaper_v1.0.pdf",
        "UNY_Decentralization_Assessment.pdf",
        "UNY_Legal_Opinion_US.pdf",
        "UNY_Security_Audit_Report.pdf",
      ],
    };
  }

  private krakenApplication(): ListingApplication {
    return {
      exchange: "Kraken",
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: "Kraken-Specific Requirements",
          fields: {
            "Asset Evaluation": "Infrastructure/Utility — x402 payment protocol token",
            "Staking Program": "Yes — UNY staking available, validator rewards from protocol revenue",
            "Trading Pairs": "UNY/USD, UNY/EUR, UNY/BTC",
            "Margin Trading": "Open to margin trading when sufficient liquidity is established",
            "API Integration": "Full REST + WebSocket market data API available",
            "Security Assessment": "OpenZeppelin ERC-20, non-upgradeable, no admin capabilities beyond ownership",
            "Compliance": "Full KYC/AML infrastructure, Travel Rule support via Meridian",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Whitepaper_v1.0.pdf",
        "UNY_Security_Audit_Report.pdf",
        "UNY_Compliance_Package.pdf",
      ],
    };
  }

  private okxApplication(): ListingApplication {
    return {
      exchange: "OKX",
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: "OKX-Specific Requirements",
          fields: {
            "Trading Pairs": "UNY/USDT, UNY/USDC, UNY/BTC",
            "OKX Chain Deployment": "Can deploy on OKX Chain (X Layer) if required",
            "Earn Products": "UNY staking via protocol — compatible with OKX Earn",
            "Market Maker": "Protocol-owned liquidity + external MM",
            "Proof of Reserves": "Full Merkle PoR — compatible with OKX PoR standard",
            "API Support": "CCXT-compatible REST API for tickers, order book, trades",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Whitepaper_v1.0.pdf",
        "UNY_Security_Audit_Report.pdf",
        "UNY_Market_Making_Plan.pdf",
      ],
    };
  }

  private bybitApplication(): ListingApplication {
    return {
      exchange: "Bybit",
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: "Bybit-Specific Requirements",
          fields: {
            "Trading Pairs": "UNY/USDT, UNY/USDC",
            "Launchpad": "Open to Bybit Launchpad for initial distribution",
            "Spot + Perpetual": "Spot initially, perpetual futures when sufficient volume",
            "Market Maker": "Protocol-owned liquidity with external MM engagement",
            "Web3 Wallet": "Standard ERC-20 — auto-compatible with Bybit Web3 Wallet",
            "Earn Products": "Staking and LP rewards available",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Whitepaper_v1.0.pdf",
        "UNY_Security_Audit_Report.pdf",
      ],
    };
  }

  private gateApplication(): ListingApplication {
    return {
      exchange: "Gate",
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: "Gate.io-Specific Requirements",
          fields: {
            "Trading Pairs": "UNY/USDT",
            "Startup Program": "Open to Gate Startup for launch promotion",
            "GateChain": "Can deploy wrapped UNY on GateChain if needed",
            "Market Maker": "Protocol-owned liquidity available",
            "Proof of Reserves": "Full PoR system — Merkle tree verification",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Whitepaper_v1.0.pdf",
        "UNY_Security_Audit_Report.pdf",
      ],
    };
  }

  private kucoinApplication(): ListingApplication {
    return {
      exchange: "KuCoin",
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: "KuCoin-Specific Requirements",
          fields: {
            "Trading Pairs": "UNY/USDT, UNY/BTC",
            "Spotlight": "Open to KuCoin Spotlight program",
            "KCC Deployment": "Can deploy on KuCoin Community Chain if required",
            "Lending": "UNY staking/lending integration available",
            "Market Maker": "Protocol-owned liquidity + external MM",
            "Trading Bot": "Standard API interface — compatible with KuCoin trading bots",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Whitepaper_v1.0.pdf",
        "UNY_Security_Audit_Report.pdf",
      ],
    };
  }

  private coingeckoApplication(): ListingApplication {
    return {
      exchange: "CoinGecko",
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: "CoinGecko Listing Requirements",
          fields: {
            "API Integration": "Full CoinGecko-standard API: /pairs, /tickers, /orderbook, /historical_trades",
            "On-Chain Data": "ERC-20 on Avalanche — automatic supply/holder tracking",
            "DEX Listing": "TraderJoe LB V2.1 (Avalanche) — auto-trackable by CoinGecko",
            "Project Info": "Complete metadata, logo, description, links, social profiles",
            "Market Cap": "Fully calculable from on-chain supply × DEX price",
            "Community": "Active GitHub (3 repos, daily commits), social channels",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Logo_512.png",
        "UNY_Description.md",
      ],
    };
  }

  private cmcApplication(): ListingApplication {
    return {
      exchange: "CoinMarketCap",
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: "CoinMarketCap Listing Requirements",
          fields: {
            "API Integration": "Full CMC-standard API: /summary, /assets, /tickers, /orderbook",
            "Self-Reported Supply": "1,000,000,000 UNY (verifiable on-chain via totalSupply())",
            "Market Pairs": "UNY/USDT, UNY/USDC, UNY/BTC, UNY/ETH, UNY/AVAX, UNY/USDF",
            "Exchange Listings": "Self-hosted AMM + TraderJoe DEX (Avalanche)",
            "Project Verified": "Full project info, team, audit, tokenomics provided",
            "CMC Earn": "Open to CMC Learn & Earn campaign integration",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Logo_512.png",
        "UNY_Description.md",
        "UNY_Supply_Verification.pdf",
      ],
    };
  }

  private genericApplication(exchange: string): ListingApplication {
    return {
      exchange,
      submissionDate: new Date().toISOString(),
      version: "1.0.0",
      sections: [
        ...this.base(),
        {
          title: `${exchange} — Generic Listing Request`,
          fields: {
            "Trading Pairs": "UNY/USDT (primary), UNY/USDC, UNY/BTC",
            "Market Maker": "Protocol-owned liquidity available, external MM engaged",
            "API": "CoinGecko + CMC compatible API endpoints available",
            "PoR": "Merkle tree proof-of-reserves at /listing/v1/proof-of-reserves",
            "Integration": "Standard ERC-20 on Avalanche — minimal integration effort for EVM exchanges",
          },
        },
      ],
      contacts: this.contacts,
      attachments: [
        "UNY_Whitepaper_v1.0.pdf",
        "UNY_Security_Audit_Report.pdf",
      ],
    };
  }
}
