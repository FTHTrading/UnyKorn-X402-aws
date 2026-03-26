# UnyKorn Protocol — Whitepaper v1.0

**The AI Infrastructure Payment Layer**

*A purpose-built Layer 1 blockchain and HTTP 402 payment protocol for autonomous AI agent commerce*

---

**Protocol Version**: fth-x402/2.0  
**Chain ID**: 7331  
**Published**: March 2026  
**Authors**: FTH Trading / UnyKorn Protocol Team  
**Repository**: [github.com/FTHTrading/UnyKorn-X402-aws](https://github.com/FTHTrading/UnyKorn-X402-aws)

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [The Problem](#2-the-problem)
3. [Solution: x402 Protocol](#3-solution-x402-protocol)
4. [UnyKorn L1 Blockchain](#4-unykorn-l1-blockchain)
5. [Protocol Architecture](#5-protocol-architecture)
6. [Payment Flow](#6-payment-flow)
7. [Agent-to-Agent Commerce (A2A)](#7-agent-to-agent-commerce-a2a)
8. [Infrastructure Stack](#8-infrastructure-stack)
9. [UNY Token](#9-uny-token)
10. [Economics Engine](#10-economics-engine)
11. [Security Model](#11-security-model)
12. [AWS Infrastructure](#12-aws-infrastructure)
13. [What Has Been Built](#13-what-has-been-built)
14. [Roadmap](#14-roadmap)
15. [Conclusion](#15-conclusion)

---

## 1. Abstract

UnyKorn is a purpose-built Layer 1 blockchain and payment protocol designed for a world where AI agents are economic actors. The protocol implements the HTTP 402 ("Payment Required") standard — an unused HTTP status code defined in RFC 7231 — to enable machine-to-machine micropayments at the protocol level.

UNY is the native gas and utility token on UnyKorn L1 (Chain ID 7331), powering every transaction in the x402 ecosystem: API access payments, agent-to-agent settlements, namespace resolution, staking, and protocol governance.

The system is not theoretical. It is production infrastructure: 17 packages, ~29,000 lines of TypeScript and Rust, deployed across AWS (5 EC2 instances, multi-AZ) and Cloudflare (edge gateway, explorer, ICO site), with a PostgreSQL database managing invoices, payment channels, credit accounts, receipts, namespaces, and treasury operations.

---

## 2. The Problem

### 2.1 AI Agents Cannot Pay for Things

The internet was built on a free-access model. HTTP 200 (OK) serves content. HTTP 401/403 handles authentication. But HTTP 402 — "Payment Required" — was reserved for future use and never standardized. As AI agents proliferate, they need to:

- Pay for API calls autonomously
- Settle micropayments in real-time (< 1 second)
- Negotiate pricing, access tiers, and service levels
- Operate without human intervention for each transaction

No existing blockchain or payment system solves this at the protocol level.

### 2.2 Existing Chains Are Not Designed for This

General-purpose chains (Ethereum, Solana, etc.) optimize for DeFi, NFTs, and general smart contract execution. They are not optimized for:

- **Sub-second settlement** of high-frequency micropayments
- **HTTP-native** payment flows embedded in API request/response cycles
- **Agent identity** and namespace resolution for machine-to-machine discovery
- **Prepaid credit systems** with Ed25519-signed proofs for zero-latency payment
- **Receipt batching** with Merkle tree anchoring for auditability at scale

### 2.3 The Market Opportunity

By 2027, Gartner estimates that 50% of enterprise API calls will be made by AI agents. Each of those calls needs a payment mechanism that is:

- Faster than traditional payment rails (< 1 second, not 3-5 business days)
- Cheaper than credit card fees (fractions of a cent, not 2.9% + $0.30)
- Machine-readable (no CAPTCHAs, no OAuth flows, no human-in-the-loop)
- Auditable (cryptographic receipts, Merkle proofs, on-chain anchoring)

---

## 3. Solution: x402 Protocol

### 3.1 What is x402?

x402 is an HTTP-native payment protocol that uses the HTTP 402 status code to enable real-time micropayments between machines. When a client requests a paid resource, the server returns HTTP 402 with payment requirements. The client constructs a payment proof, retries the request, and receives the resource upon verification.

### 3.2 Protocol Version

**fth-x402/2.0** — the current production protocol version.

### 3.3 Payment Requirements

When a server returns HTTP 402, it includes an `X-PAYMENT-REQUIRED` header containing:

```json
{
  "version": "fth-x402/2.0",
  "resource": "/api/v1/agent/pay-api/openai",
  "asset": "UNY",
  "amount": "0.0001",
  "invoice_id": "inv_abc123",
  "nonce": "0xdeadbeef...",
  "expires_at": "2026-03-26T12:05:00Z",
  "accepted_rails": ["unykorn-l1"],
  "accepted_proofs": ["prepaid_credit", "channel_spend", "signed_auth", "tx_hash"],
  "namespace": "fth.x402",
  "policy": {
    "min_pass_level": "basic",
    "kyc_required": false,
    "max_amount": "1.0"
  }
}
```

### 3.4 Five Proof Types

The protocol accepts five distinct payment proof types, each optimized for different use cases:

| Proof Type | Use Case | Latency | Description |
|-----------|----------|---------|-------------|
| **Prepaid Credit** | High-frequency API calls | ~10ms | Ed25519-signed proof against pre-deposited credit balance |
| **Channel Spend** | Streaming payments | ~10ms | Incremental spend from an open bidirectional payment channel |
| **Signed Auth** | Cross-chain authorization | ~50ms | Cryptographic signed authorization (Stellar SEP-10 compatible) |
| **TX Hash** | On-chain settlement | ~1s | Direct on-chain transaction hash verification |
| **XRPL Payment** | XRPL-native payments | ~4s | XRPL-specific payment proof |

### 3.5 Settlement Rails

The protocol supports four settlement rails:

1. **UnyKorn L1** (Chain 7331) — Primary rail, ~1s finality
2. **Stellar** — Cross-border payments
3. **XRPL** — XRP Ledger native
4. **Base** — Ethereum L2

### 3.6 Access Tiers (PASS System)

The protocol implements a four-tier access system:

| Tier | Rate Limit | Max Channel | Features |
|------|-----------|-------------|----------|
| **Basic** | 100 req/hr | 100 UNY | Standard API access |
| **Pro** | 500 req/hr | 10,000 UNY | All routes, priority |
| **Institutional** | 10,000 req/hr | 1,000,000 UNY | SLA contracts, dedicated support |
| **KYC-Enhanced** | Custom | Custom | Regulated endpoints, cross-border |

---

## 4. UnyKorn L1 Blockchain

### 4.1 Design Philosophy

UnyKorn L1 is a purpose-built EVM-compatible blockchain optimized for AI infrastructure payments. It is not a general-purpose chain — it is designed for one thing: fast, cheap, auditable micropayments between machines.

### 4.2 Chain Specifications

| Parameter | Value |
|-----------|-------|
| **Chain ID** | 7331 |
| **Consensus** | Trinity Consensus |
| **Block Time** | ~1 second |
| **Finality** | Deterministic (single-slot) |
| **Native Token** | UNY |
| **EVM Compatible** | Yes |
| **Node Count** | 5 (3 validators, 1 x402 host, 1 oracle) |
| **RPC Endpoint** | rpc.l1.unykorn.org |

### 4.3 Trinity Consensus

Trinity Consensus is a Byzantine fault-tolerant consensus mechanism optimized for the UnyKorn L1 validator set. It achieves sub-second deterministic finality with three validator nodes (alpha, bravo, charlie) reaching agreement in a single round.

### 4.4 Node Architecture

| Node | Role | Spec |
|------|------|------|
| **Alpha** | Validator + Block Producer | c6a.xlarge |
| **Bravo** | Validator | c6a.xlarge |
| **Charlie** | Validator | c6a.xlarge |
| **Delta** | x402 Service Host | c6a.large |
| **Echo** | Oracle + External Data | c6a.large |

### 4.5 Genesis

The UNY token was created at genesis (June 2025) to represent the AI-to-AI x402 protocol. An ERC-20 contract was deployed at `0xC09003213B34C7BEC8d2eDDfad4b43E51d007d66` as the initial genesis representation. UNY subsequently became the native token of UnyKorn L1 (Chain 7331), which is the production chain for all x402 operations.

---

## 5. Protocol Architecture

### 5.1 System Overview

The UnyKorn x402 stack is a monorepo of 17 packages spanning four layers:

```
┌─────────────────────────────────────────────────────────────┐
│                     EDGE LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Gateway (CF)  │  │ Explorer     │  │ ICO Site          │  │
│  │ x402 Enforce  │  │ Dashboard    │  │ Token Sale        │  │
│  └──────┬───────┘  └──────────────┘  └───────────────────┘  │
├─────────┼───────────────────────────────────────────────────┤
│         │           SERVICE LAYER                            │
│  ┌──────▼───────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Facilitator   │  │ Treasury     │  │ Guardian          │  │
│  │ Port 3100     │  │ Port 3200    │  │ Port 3300         │  │
│  │ Settlement    │  │ Agent Fund   │  │ 8 Daemons         │  │
│  └──────┬───────┘  └──────────────┘  └───────────────────┘  │
├─────────┼───────────────────────────────────────────────────┤
│         │           ENGINE LAYER                             │
│  ┌──────▼───────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Financial Core│  │ Economics    │  │ Exchange Listing   │  │
│  │ Rust / 4400   │  │ AMM, Flywheel│  │ CoinGecko, CMC   │  │
│  └──────┬───────┘  └──────────────┘  └───────────────────┘  │
├─────────┼───────────────────────────────────────────────────┤
│         │           DATA LAYER                               │
│  ┌──────▼───────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ PostgreSQL    │  │ UnyKorn L1   │  │ A2A Agent Network │  │
│  │ 15+ tables    │  │ Chain 7331   │  │ 13 agents         │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Package Inventory

| Package | Lines | Language | Purpose |
|---------|-------|----------|---------|
| fth-x402-core | 748 | TypeScript | Protocol types, constants, auth model |
| fth-x402-facilitator | 5,657 | TypeScript | Settlement server (Fastify) |
| fth-x402-treasury | 1,239 | TypeScript | Agent fund management |
| fth-guardian | 3,449 | TypeScript | 8-daemon monitoring army |
| fth-x402-gateway | 1,052 | TypeScript | Cloudflare Worker edge gateway |
| fth-x402-a2a | 4,722 | TypeScript | 13 AI agents (A2A framework) |
| fth-x402-sdk | 347 | TypeScript | Client SDK |
| fth-x402-pricing | 203 | TypeScript | Price catalog, access policies |
| uny-economics | 1,717 | TypeScript | AMM, flywheel, credibility |
| exchange-listing | 2,006 | TypeScript | CoinGecko/CMC APIs, PoR, compliance |
| fth-financial-core | 2,873 | Rust | Ledger, settlement, vault, risk |
| fth-metering | 386 | TypeScript | OpenMeter usage tracking |
| unyKorn-contracts | 3,972 | Solidity | Smart contracts (Hardhat) |
| unykorn-explorer | ~536 | React/TS | Block explorer UI |
| unykorn-ico | ~533 | React/TS | Token sale page |
| unyKorn-wallet | 230 | React/TS | Wallet interface |
| fth-x402-site | - | Static | Documentation site |
| **Total** | **~29,000+** | | |

---

## 6. Payment Flow

### 6.1 Complete Request Lifecycle

```
Client                    Gateway (CF)              Facilitator (:3100)
  │                          │                           │
  ├──GET /api/v1/agent/──────►                           │
  │    pay-api/openai        │                           │
  │                          ├──Match PAID_ROUTES────────►
  │                          │   No proof found           │
  │◄──────HTTP 402───────────┤                           │
  │  X-PAYMENT-REQUIRED:     │                           │
  │  {invoice, nonce,        │                           │
  │   amount: 0.0001 UNY}    │                           │
  │                          │                           │
  ├──Construct Proof─────────►                           │
  │  (Ed25519 signed credit) │                           │
  │                          │                           │
  ├──GET /api/v1/agent/──────►                           │
  │  X-PAYMENT-SIGNATURE:    ├──POST /verify─────────────►
  │  {proof}                 │  HMAC-SHA256 service auth  │
  │                          │                           ├──10-step verification:
  │                          │                           │  1. Invoice lookup
  │                          │                           │  2. Status check
  │                          │                           │  3. Nonce match
  │                          │                           │  4. Replay guard
  │                          │                           │  5. Rate limit
  │                          │                           │  6. Proof verification
  │                          │                           │  7. Settlement (deduct)
  │                          │                           │  8. Record nonce
  │                          │                           │  9. Create receipt
  │                          │                           │  10. Dispatch webhook
  │                          │◄──{valid: true, receipt}──┤
  │◄──HTTP 200 + Resource────┤                           │
  │  X-PAYMENT-RESPONSE:     │                           │
  │  {receipt_id, amount}    │                           │
```

### 6.2 Ten-Step Verification

1. **Invoice Lookup** — Retrieve invoice by ID, verify existence
2. **Status Check** — Must be `pending`, not expired (300s TTL default)
3. **Nonce Match** — Payment nonce must match invoice nonce
4. **Replay Guard** — Deduplicate: same proof cannot be submitted twice
5. **Rate Limit** — Per-wallet rate limiting (configurable per tier)
6. **Proof Verification** — Type-specific: Ed25519 signature check (credit), channel sequence validation (channel), on-chain TX lookup (tx_hash)
7. **Settlement** — Deduct from credit balance, advance channel state, or confirm on-chain finality
8. **Record Nonce** — Store nonce for future replay prevention
9. **Create Receipt** — Generate signed receipt with facilitator key
10. **Dispatch Webhook** — Notify subscribed endpoints of payment event

### 6.3 Receipt Anchoring

Receipts are batched periodically (60-second sweep), Merkle tree computed, and the root hash is anchored to UnyKorn L1. This provides:

- Individual receipt verification via Merkle inclusion proofs
- Tamper-evident audit trail
- L1-level finality for off-chain payments

### 6.4 Nine Monetized API Routes

| Route | Price (UNY) | Tier | Delivery |
|-------|-------------|------|----------|
| `/api/v1/agent/pay-api/:provider` | 0.0001 | basic | Origin proxy |
| `/api/v1/genesis/repro-pack/:suite` | 0.0005 | basic | R2 storage |
| `/api/v1/trade/verify/:trade_id` | 0.00025 | basic | Origin proxy |
| `/api/v1/invoices/export/:format` | 0.001 | pro | Origin proxy |
| `/api/v1/explorer/analytics/:period` | 0.0002 | basic | Origin proxy |
| `/api/v1/explorer/receipt/:receipt_id` | 0.00015 | basic | Origin proxy |
| `/api/v1/explorer/namespace/:fqn` | 0.0001 | basic | Origin proxy |
| `/api/v1/explorer/agent/:agent_id` | 0.0003 | basic | Origin proxy |
| `/api/v1/explorer/export/:format` | 0.002 | pro | Origin proxy |

---

## 7. Agent-to-Agent Commerce (A2A)

### 7.1 Framework

The A2A framework implements Google's Agent-to-Agent protocol (v0.2) with 13 autonomous agents organized across 5 layers.

### 7.2 Agent Architecture

```
┌─────────────────────────────────────────────────────────┐
│ L5: ECOSYSTEM — Registry, Federation, Marketplace       │
├─────────────────────────────────────────────────────────┤
│ L4: WORK — Delivery, Search, Settlement, Outreach       │
├─────────────────────────────────────────────────────────┤
│ L3: COMMERCE — Quote, Payment, Treasury, Receipt        │
├─────────────────────────────────────────────────────────┤
│ L2: CONTROL — Orchestrator, Guardian, Compliance, Budget│
├─────────────────────────────────────────────────────────┤
│ L1: DISCOVERY — Agent Cards (.well-known/agent.json)    │
└─────────────────────────────────────────────────────────┘
```

### 7.3 How It Works

1. **Orchestrator** receives a goal (e.g., "Find and pay for the cheapest OpenAI API proxy")
2. **Compliance Agent** checks regulatory requirements
3. **Budget Agent** validates available funds
4. **Quote Agent** retrieves pricing from target service
5. **Payment Agent** constructs x402 proof and settles
6. **Receipt Agent** records and anchors the transaction
7. **Delivery Agent** returns the result

### 7.4 Task Lifecycle

Tasks follow the A2A standard lifecycle: `submitted → working → input-required → completed/failed/canceled`

Communication uses JSON-RPC 2.0 with methods: `tasks/send`, `tasks/get`, `tasks/cancel`, `tasks/sendSubscribe` (Server-Sent Events for streaming updates).

Human-in-the-loop escalation is supported for tasks requiring manual approval.

---

## 8. Infrastructure Stack

### 8.1 Service Map

| Service | Port | Language | Role |
|---------|------|----------|------|
| **Facilitator** | 3100 | TypeScript (Fastify) | x402 settlement, invoices, channels, receipts, namespaces |
| **Treasury** | 3200 | TypeScript (Fastify) | Agent registration, auto-funding, refill policies |
| **Guardian** | 3300 | TypeScript (Fastify) | 8-daemon monitoring and autonomous operations |
| **Financial Core** | 4400 | Rust (Axum) | Double-entry ledger, risk engine, vault, settlement |
| **Gateway** | Cloudflare Edge | TypeScript (Worker) | x402 enforcement, route matching, metering |
| **PostgreSQL** | 5432 | — | 15+ tables for all state |
| **UnyKorn L1** | 3001 | — | Blockchain RPC |

### 8.2 Guardian: 8-Daemon Army

| Daemon | Cycle | Role |
|--------|-------|------|
| **Sentinel** | 15s | Monitor nodes, services, DB health |
| **Enforcer** | — | Rate limiting, anomaly detection, threat response |
| **Healer** | — | Auto-restart failed services, state repair |
| **Reaper** | 60s | Revenue collection: tx fees, staking, oracle, facilitator, x402 |
| **Upgrader** | — | Rolling deploys, config hot-reload |
| **Treasurer** | — | Auto-fund agents, reserve policy |
| **Anchor** | 60s | Batch receipts → Merkle tree → L1 anchoring |
| **Watcher** | — | DNS, SSL, domain expiry, external API health |

### 8.3 Financial Core (Rust)

A production-grade financial engine written in Rust for performance and safety:

- **Ledger** — Double-entry accounting with debit/credit legs
- **Settlement** — Invoice processing, payment verification, receipt issuance with Ed25519 signatures
- **Vault** — Multi-custody key management, agent wallets, master account
- **Risk** — Position limits, velocity windows, exposure monitoring
- **API** — Axum HTTP server with tracing, CORS, gzip compression

### 8.4 Database Schema

PostgreSQL with 15+ migration files managing:

| Table | Purpose |
|-------|---------|
| `credit_accounts` | Wallet balances, KYC level, Ed25519 pubkeys |
| `credit_transactions` | Deposit/charge/refund/withdrawal ledger |
| `invoices` | Payment invoices with lifecycle tracking |
| `payment_channels` | Bidirectional payment channels |
| `receipts` | Individual payment receipts |
| `receipt_roots` | Merkle batch roots anchored to L1 |
| `namespace_records` | Hierarchical namespace resolution |
| `rate_limit_log` | Per-wallet rate limiting |
| `webhooks` | Subscription + delivery tracking |
| `treasury_agents` | Registered agents with funding policies |
| `treasury_refills` | Refill audit trail |
| `treasury_policies` | Configurable funding rules |
| `treasury_halts` | Emergency halt records |

### 8.5 Metering

OpenMeter integration tracks three event types:
- `api_request` — per API call
- `ai_tokens` — AI token consumption
- `compute_seconds` — compute resource usage

Events are buffered and flushed every 5 seconds in CloudEvents v1.0 format. Quota enforcement prevents resource abuse.

---

## 9. UNY Token

### 9.1 Overview

| Property | Value |
|----------|-------|
| **Name** | UnyKorn Token |
| **Symbol** | UNY |
| **Chain** | UnyKorn L1 (Chain 7331) |
| **Type** | Native gas + utility token |
| **Standard** | ERC-20 compatible |
| **Decimals** | 18 |
| **Max Supply** | 1,000,000,000 (1 billion) |
| **Mintable** | No — fixed supply, no mint function |
| **Burnable** | Yes — ERC20Burnable, permanent deflation |
| **Pausable** | No — no admin pause/freeze/blacklist |
| **Upgradeable** | No — immutable contract |

### 9.2 Genesis

The UNY token was created in June 2025 as the native representation of the AI-to-AI x402 protocol. The genesis ERC-20 contract was deployed with OpenZeppelin's battle-tested ERC20 + ERC20Burnable base. The full 1 billion supply was minted at deployment with no future minting capability. The contract is immutable, non-upgradeable, and has no admin pause, freeze, or blacklist functions.

### 9.3 Utility

UNY is required for:

1. **x402 Payments** — Pay for API calls through the x402 protocol
2. **Gas on L1** — Native gas token for UnyKorn L1 transactions
3. **Prepaid Credits** — Deposit UNY to a credit account for instant (10ms) payment proofs
4. **Payment Channels** — Open bidirectional payment channels for streaming micropayments
5. **Staking** — Validator staking and protocol staking rewards
6. **Agent Registration** — Register AI agents in the namespace system
7. **Namespace Resolution** — Register hierarchical names (e.g., `fth.x402.facilitator`)
8. **Governance** — Protocol parameter voting (planned)

### 9.4 Deflationary Mechanism

The revenue flywheel burns UNY permanently:

- **40%** of all x402 protocol revenue → buy UNY → burn
- Burns reduce `totalSupply()` on-chain — permanently decreasing supply
- No mechanism exists to mint new tokens
- Net deflationary pressure increases as x402 usage grows

### 9.5 Token Distribution

| Allocation | Percentage | Amount | Purpose |
|-----------|-----------|--------|---------|
| Infrastructure & Validators | 40% | 400,000,000 | Validator rewards, node operations |
| AI Compute Subsidies | 15% | 150,000,000 | AI agent compute cost reduction |
| Protocol Treasury | 20% | 200,000,000 | Governed reserves, protocol development |
| Ecosystem Grants | 15% | 150,000,000 | Partnerships, integrations, community |
| Team & Advisors | 10% | 100,000,000 | 12-month cliff, 36-month linear vest |

See [TOKENOMICS.md](TOKENOMICS.md) for the complete economic model.

---

## 10. Economics Engine

### 10.1 On-Chain AMM

The protocol operates a constant-product automated market maker (x·y=k) for UNY price discovery:

- **Pool**: UNY/USDT
- **Swap Fee**: 0.3% (50% to LPs, 50% to protocol)
- **Minimum Liquidity**: Uniswap V2-style lock
- **Seed**: 10M UNY + $100K equivalent = $0.01 initial price
- **Functions**: swap, quote, addLiquidity, removeLiquidity, fee distribution

### 10.2 Revenue Flywheel

Every x402 payment generates protocol revenue. That revenue is automatically distributed:

```
x402 Payment Revenue
        │
        ├── 40% → Buy-and-Burn (deflationary pressure)
        ├── 30% → LP Provision (liquidity deepening)
        ├── 20% → Treasury Reserve (sustainability)
        └── 10% → Staking Rewards (validator incentives)
```

The flywheel has a minimum cycle threshold of 100 UNY before execution, preventing dust transactions.

### 10.3 Credibility Layer

A composite credibility score (0-100) evaluates protocol health across four categories:

| Category | Weight | Components |
|----------|--------|------------|
| Infrastructure | 0-25 | Service uptime, node health, chain liveness |
| Tokenomics | 0-25 | Supply distribution, burn rate, velocity |
| Revenue | 0-25 | x402 volume, growth rate, flywheel execution |
| Governance | 0-25 | Treasury reserves, decentralization, transparency |

### 10.4 Genesis Provenance

A cryptographic proof chain linking every component of the system:

```
Genesis Seed → Trinity Consensus → UNY Token → x402 Infrastructure → Revenue
```

Each link is SHA-256 hashed. Constitutional invariants are enforced:
- Maximum 15% annual supply inflation (currently 0% — no minting)
- Minimum 20% treasury reserves at all times

### 10.5 Public API

All economics data is publicly accessible with no authentication:

| Endpoint | Data |
|----------|------|
| `/economics/overview` | Full economic snapshot |
| `/economics/amm` | AMM pool state, reserves, price |
| `/economics/amm/quote` | Real-time swap quotes |
| `/economics/flywheel` | Revenue distribution history |
| `/economics/genesis` | Genesis provenance chain |
| `/economics/credibility` | Credibility score breakdown |
| `/economics/fundamentals` | Token supply, burn rate, velocity, FDV |
| `/economics/reserves` | Reserve attestation |
| `/economics/infrastructure` | Service health metrics |

---

## 11. Security Model

### 11.1 Three-Tier Authentication

1. **HMAC-SHA256 Service Auth** — Inter-service communication (gateway↔facilitator) uses shared secret HMAC signatures. Every verification request is signed.
2. **Bearer Admin Tokens** — Administrative endpoints require API key authentication.
3. **Public Endpoints** — Explorer, economics, and listing endpoints are open.

### 11.2 Replay Protection

Every invoice includes a unique nonce. The facilitator maintains a nonce store — once a nonce is used, it cannot be reused. Combined with invoice expiry (300s default TTL), this prevents double-spend attacks.

### 11.3 Payment Channel Security

Payment channels use incrementing sequence numbers. Each spend must have a higher sequence than the previous. Channels have maximum capacity limits enforced at open time.

### 11.4 Credit Account Security

Credit accounts use Ed25519 public key registration. Every credit spend requires a valid Ed25519 signature from the registered key. Key rotation is supported.

### 11.5 Infrastructure Security

| Layer | Mechanism |
|-------|-----------|
| **Network** | AWS VPC with 4-tier subnet architecture, security groups, WAFv2 |
| **Encryption** | TLS 1.3 everywhere, KMS envelope encryption for secrets |
| **Authentication** | IMDSv2, IAM roles (no long-lived credentials) |
| **Monitoring** | Guardian 8-daemon army, CloudWatch, Prometheus |
| **Incident Response** | Guardian auto-halt, manual emergency halt, webhook alerts |
| **Audit** | CloudTrail, VPC flow logs, receipt Merkle anchoring |

### 11.6 Smart Contract Security

- OpenZeppelin v5 base contracts (battle-tested, audited)
- No proxy patterns, no upgradeability
- No owner mint, pause, freeze, or blacklist functions
- Independent external audit in progress

---

## 12. AWS Infrastructure

### 12.1 Architecture

Region: **us-east-1**, multi-AZ deployment.

```
┌──────────────────────────────────────────────────────────────┐
│                          VPC 10.100.0.0/16                   │
│                                                              │
│  ┌─────────── Public (10.100.1-2.0/24) ──────────────────┐  │
│  │  ALB (HTTPS :443) → Target Groups                       │  │
│  │  NLB (RPC :3001) → Validators                           │  │
│  │  NAT Gateway → Private subnets                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── Private Chain (10.100.3-4.0/24) ───────────────────┐  │
│  │  Alpha (c6a.xlarge) — Validator + Block Producer        │  │
│  │  Bravo (c6a.xlarge) — Validator                         │  │
│  │  Charlie (c6a.xlarge) — Validator                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── Private Services (10.100.5-6.0/24) ────────────────┐  │
│  │  Delta (c6a.large) — Facilitator, Treasury, Guardian    │  │
│  │  Echo (c6a.large) — Oracle, Financial Core              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── Isolated Data (10.100.7-8.0/24) ──────────────────┐  │
│  │  PostgreSQL — 15+ tables, encrypted at rest             │  │
│  │  S3 — 4 buckets (chain data, backups, artifacts, logs)  │  │
│  │  ECR — 2 container registries                           │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  WAFv2 Web ACL → Rate limiting, geo rules, bot protection  │
│  CloudWatch / AMP / Grafana → Observability                 │
│  Secrets Manager → 5 secret entries                         │
│  KMS → Envelope encryption                                  │
│  Route 53 → DNS with 8 A records                           │
└──────────────────────────────────────────────────────────────┘
```

### 12.2 Terraform Infrastructure-as-Code

9 Terraform modules define the entire infrastructure:

| Module | Resources |
|--------|-----------|
| VPC | VPC, 8 subnets (4 tiers × 2 AZs), NAT GW, IGW, flow logs |
| Security | 4 security groups, KMS, IAM roles/instance profiles |
| Compute | 5 EC2 instances (3× c6a.xlarge, 2× c6a.large), EBS gp3 |
| Load Balancing | 1 ALB (HTTPS), 1 NLB (RPC), 8 target groups |
| DNS | Route 53 zone, 8 A records |
| Storage | 4 S3 buckets, 2 ECR repos |
| Secrets | 5 Secrets Manager entries |
| Observability | CloudWatch, AMP, Grafana |
| WAF | WAFv2 Web ACL, rate limiting, geo rules |

### 12.3 Cloudflare Edge

| Service | Platform | URL |
|---------|----------|-----|
| Gateway | Workers | fth-x402-gateway-staging.kevanbtc.workers.dev |
| Explorer | Pages | main.unykorn-explorer.pages.dev |
| ICO | Pages | ico.unykorn.org |

---

## 13. What Has Been Built

This is not a concept whitepaper. Everything described in this document exists as production code.

### 13.1 By the Numbers

| Metric | Value |
|--------|-------|
| Total packages | 17 |
| Lines of code | ~29,000+ |
| Languages | TypeScript, Rust, Solidity |
| Services running | 6 (Facilitator, Treasury, Guardian, Financial Core, Gateway, L1) |
| Database tables | 15+ |
| Migration files | 15 |
| AI agents | 13 (across 5 layers) |
| Paid API routes | 9 |
| x402 proof types | 5 |
| Settlement rails | 4 |
| Guardian daemons | 8 |
| AWS EC2 instances | 5 |
| Terraform modules | 9 |
| Compliance checks | 30 |
| Exchange targets | 13 |

### 13.2 Live Endpoints

| URL | Status |
|-----|--------|
| https://main.unykorn-explorer.pages.dev | Live |
| https://ico.unykorn.org | Live |
| http://localhost:3100/health | Running |
| /economics/* (9 endpoints) | Running |
| /listing/* (15 endpoints) | Running |
| /explorer/* (public data) | Running |
| /a2a/* (agent endpoints) | Running |

### 13.3 Exchange Listing Readiness

The exchange-listing package provides:

- **CoinGecko API**: `/pairs`, `/tickers`, `/orderbook`, `/historical_trades`
- **CoinMarketCap API**: `/summary`, `/assets`
- **Proof of Reserves**: Merkle tree verification at `/listing/v1/proof-of-reserves`
- **30-point compliance engine**: Technical, security, tokenomics, legal, liquidity, infrastructure, community
- **Listing applications**: Pre-generated for Binance, Coinbase, Kraken, OKX, Bybit, Gate, KuCoin, MEXC, CoinGecko, CoinMarketCap

---

## 14. Roadmap

| Phase | Period | Milestones |
|-------|--------|------------|
| **Genesis & Foundation** | Q3 2025 | UNY token created. FTH Trading entity formed. x402 protocol design. ✅ |
| **Infrastructure Build** | Q4 2025 | UnyKorn L1 live (Chain 7331, Trinity Consensus). A2A agent framework. AWS deployment. ✅ |
| **x402 Protocol Launch** | Q1 2026 | Facilitator, Treasury, Guardian live. Gateway on Cloudflare. 9 monetized routes. Economics engine. ✅ |
| **ICO & Exchange Listings** | Q2 2026 | Token sale at ico.unykorn.org. CoinGecko/CMC integration. Listing applications submitted. |
| **DEX Launch & DeFi** | Q3 2026 | UnyKorn native AMM. Staking vault with real x402 yield. LP rewards. 100+ A2A agents. |
| **Enterprise & Scale** | Q4 2026 | CEX listings live. Enterprise API. 1M+ x402 transactions/month. |

---

## 15. Conclusion

UnyKorn is not another blockchain looking for a use case. It is a payment protocol that required its own chain.

HTTP 402 was reserved in 1999 for "future use." Twenty-seven years later, AI agents need exactly what it was designed for: a way to pay for things at the protocol level, in real-time, without human intervention.

UNY is the token that powers that protocol. UnyKorn L1 is the chain that settles those payments. The x402 stack is the infrastructure that makes it work.

~29,000 lines of code. 17 packages. 5 EC2 instances. 13 AI agents. 9 monetized API routes. 30 compliance checks. All of it built, deployed, and running.

The next step is adoption.

---

*© 2025–2026 FTH Trading · UnyKorn Protocol*  
*This document describes the technical architecture of the UnyKorn x402 protocol. It is not financial advice. Cryptocurrency investments carry risk.*  
*For the latest updates, visit [unykorn.org](https://unykorn.org) or [github.com/FTHTrading](https://github.com/FTHTrading).*
