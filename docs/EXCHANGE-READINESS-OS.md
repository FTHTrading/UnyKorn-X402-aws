# Exchange Readiness OS

**Version:** 1.0.0  
**Package:** `@unykorn/exchange-readiness`  
**Status:** BUILT — code complete, serving data

---

## Overview

The Exchange Readiness OS is a seven-layer system that provides complete transparency into UnyKorn's readiness for exchange listings. It auto-generates listing packets, detects risk flags, and surfaces proof data for public verification.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Exchange Readiness OS                │
├─────────────┬───────────────────────────────────────┤
│  Layer 1    │  Issuer Entity                        │
│  Layer 2    │  Token Truth (supply, vesting, admin) │
│  Layer 3    │  Exchange Integration (packets, wallet)│
│  Layer 4    │  Security Assurance (audits, bounty)  │
│  Layer 5    │  Market Structure (MM, liquidity)     │
│  Layer 6    │  Operations (status, SLA, incidents)  │
│  Layer 7    │  Risk Flags & Scoring                 │
├─────────────┴───────────────────────────────────────┤
│               API Routes (/readiness/v1/*)          │
├─────────────────────────────────────────────────────┤
│  CLI: generate-packets | risk-scan                  │
├─────────────────────────────────────────────────────┤
│  Explorer: Proof Center Page                        │
└─────────────────────────────────────────────────────┘
```

## API Endpoints

### Token Truth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/readiness/v1/token` | Token registry |
| GET | `/readiness/v1/supply` | Current supply snapshot |
| GET | `/readiness/v1/vesting` | All vesting schedules |
| GET | `/readiness/v1/treasury` | Treasury wallets |
| GET | `/readiness/v1/admin-powers` | Admin powers disclosure |

### Issuer & Security
| Method | Path | Description |
|--------|------|-------------|
| GET | `/readiness/v1/issuer` | Issuer entity information |
| GET | `/readiness/v1/security` | Security posture |

### Risk & Readiness
| Method | Path | Description |
|--------|------|-------------|
| GET | `/readiness/v1/risk-flags` | Auto-detected risk flags |
| GET | `/readiness/v1/risk-summary` | Risk summary + recommendations |
| GET | `/readiness/v1/score` | Readiness scores (overall + per-exchange) |

### Exchange Packets
| Method | Path | Description |
|--------|------|-------------|
| GET | `/readiness/v1/packets` | All exchange packets |
| GET | `/readiness/v1/packets/:exchange` | Specific exchange packet |

### Operations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/readiness/v1/network` | Network ops snapshot |
| GET | `/readiness/v1/incident-response` | Incident response plan |
| GET | `/readiness/v1/wallet-params` | Wallet integration parameters |
| GET | `/readiness/v1/state` | Full exchange readiness state |

## CLI Tools

```bash
# Generate listing packets for all exchanges
npm run generate-packets

# Generate for a specific exchange
npx tsx src/cli/generate-packets.ts coinbase

# Run risk scan
npm run risk-scan
```

## Supported Exchanges

| Exchange | Packet Generated | Key Requirements |
|----------|-----------------|------------------|
| Coinbase | ✅ | Legal review, security review, business assessment |
| Kraken | ✅ | MiCA whitepaper (EEA), formal application |
| Binance | ✅ | AMA, community, SAFU, market cap |
| OKX | ✅ | Token listing application, disclosures |
| KuCoin | ✅ | Project form, technical review |
| MEXC | ✅ | Application + technical integration |
| Bitget | ✅ | Listing form + community metrics |
| Gate.io | ✅ | Application + deposit/withdrawal setup |
| CoinGecko | ✅ | API compliance, contract verification |
| CoinMarketCap | ✅ | Self-reporting form, contract address |

## Risk Engine

The risk engine automatically scans for:

1. **Data Consistency** — Supply math, vesting totals, treasury balances
2. **Completeness** — Missing required fields per exchange
3. **Security** — Audit status, admin powers, centralization
4. **Governance** — Multi-sig, vesting enforcement, key management
5. **Operations** — Status page, SLA compliance, incident history
6. **Legal** — Counsel, token classification, jurisdictional restrictions
7. **Market** — Market maker, DEX liquidity, float allocation

## Files

```
packages/exchange-readiness/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # Public API
    ├── types.ts              # 7-layer type system
    ├── seed-data.ts          # Canonical UnyKorn state
    ├── packet-generator.ts   # Per-exchange packet generation
    ├── risk-engine.ts        # Auto risk detection + scoring
    ├── routes.ts             # Fastify API routes
    ├── server.ts             # Standalone server (port 3600)
    └── cli/
        ├── generate-packets.ts
        └── risk-scan.ts
```

---

*Part of the UnyKorn Exchange Readiness OS — Package 18 of the monorepo.*
