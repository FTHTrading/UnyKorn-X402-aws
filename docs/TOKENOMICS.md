# UNY Tokenomics — Complete Economic Model

**UnyKorn Token (UNY) — Chain 7331**

*The native gas and utility token powering the x402 AI payment protocol + UNY Genesis machine economy*

---

**Version**: 1.1 — Truth-Layered Edition  
**Date**: March 2026  
**Authors**: FTH Trading / UnyKorn Protocol Team

---

> ### Reading Guide — Status Markers
>
> | Marker | Meaning |
> |--------|---------|
> | **[LIVE]** | Running in production or on controlled devnet right now |
> | **[BUILT]** | Code-complete, tested, not yet publicly active |
> | **[PLANNED]** | Designed, not yet implemented |
> | **[KNOWN GAP]** | Acknowledged issue or unresolved conflict |

---

## 1. Token Fundamentals

| Property | Value | Status |
|----------|-------|--------|
| **Name** | UnyKorn Token | [LIVE] |
| **Symbol** | UNY | [LIVE] |
| **Blockchain** | UnyKorn L1 (Chain ID 7331) | [BUILT — controlled devnet] |
| **Token Type** | Native gas + utility | [BUILT] |
| **Native L1 Representation** | UNY is the native gas token on UnyKorn L1 — not an ERC-20 deployed on another chain | [BUILT] |
| **ERC-20 Wrapped Representation** | A wrapped ERC-20 version (wUNY) is planned for cross-chain bridges and CEX compatibility | [PLANNED] |
| **Bridge Rules** | Native ↔ Wrapped parity maintained by a lock/mint bridge contract | [PLANNED] |
| **Decimals** | 18 | [LIVE] |
| **Total Supply** | 1,000,000,000 (1 billion) | [LIVE] |
| **Max Supply** | 1,000,000,000 (hard-capped — no mint function exists) | [LIVE] |
| **Inflation Rate** | 0% (no new tokens can ever be created) | [LIVE] |
| **Deflationary** | Yes — protocol burn mechanism reduces supply permanently | [PLANNED — burn contract not yet deployed] |
| **Mintable** | No | [LIVE] |
| **Pausable** | No | [LIVE] |
| **Blacklistable** | No | [LIVE] |
| **Upgradeable** | No | [LIVE] |
| **Core Contract** | Immutable — OpenZeppelin ERC20 + ERC20Burnable (genesis deploy) | [BUILT] |

> **Architecture Note**: UNY exists in two forms:
> 1. **Native L1 UNY** — the gas token on UnyKorn L1 (Chain 7331). Used for gas, staking, namespace fees, and all on-chain operations.
> 2. **Wrapped UNY (wUNY)** — [PLANNED] an ERC-20 contract that can be deployed on Ethereum, Base, or other EVM chains for CEX listings and cross-chain interoperability. Wrapped ↔ Native conversion will be governed by a bridge contract with 1:1 parity.
>
> The core token contract (OpenZeppelin ERC20) was used for the genesis mint. It has no admin functions. Governance controls **separate treasury and policy contracts**, not the core token contract itself.

---

## 2. Token Distribution

### 2.1 Allocation Table

> **[KNOWN GAP — RESOLVED]**: Previous v1.0 allocated 100% across 5 categories with no explicit ICO source.
> The ICO (200M / 20%) is now carved from Infrastructure (−5%) and Ecosystem (−5%), with Treasury reduced (−5%) and ICO added explicitly. New allocation sums to exactly 100%.

| Category | % | Tokens | Vesting | Purpose | Status |
|----------|---|--------|---------|---------|--------|
| **ICO / Public Sale** | 20% | 200,000,000 | Seed: 6-month cliff + 12-month linear; Private: 3-month cliff + 12-month; Public: 25% at TGE + 9-month | Fundraising for infrastructure, engineering, audits, marketing | [BUILT — ICO site live at ico.unykorn.org] |
| **Infrastructure & Validators** | 35% | 350,000,000 | Gradual release over 48 months | Validator rewards, L1 node operations, network security incentives | [PLANNED — validator staking not yet live] |
| **AI Compute Subsidies** | 10% | 100,000,000 | Released on-demand as agents onboard | Reduce AI agent compute costs, subsidize x402 adoption, Genesis machine economy | [PLANNED] |
| **Protocol Treasury** | 15% | 150,000,000 | Multi-sig, 6-month timelock | Protocol development, emergency reserves, governance-directed spending | [KNOWN GAP — currently single-key, multi-sig planned] |
| **Ecosystem Grants** | 10% | 100,000,000 | Per-grant vesting (6-24 months) | Partnerships, integrations, developer grants, community programs | [PLANNED] |
| **Team & Advisors** | 10% | 100,000,000 | 12-month cliff + 36-month linear | Founding team compensation, aligned long-term incentives | [BUILT — vesting schedule set, not contract-enforced] |
| **TOTAL** | **100%** | **1,000,000,000** | | | |

### 2.2 Distribution Visualization

```
████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  20% ICO / Public Sale
█████████████████████████████████████░░░░░░░░░░░░░░  35% Infrastructure
██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10% AI Compute
████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  15% Treasury
██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10% Ecosystem
██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10% Team
```

### 2.3 Vesting Schedule

#### Team & Advisors (100M UNY)

```
Month 0-12:   ████████████ CLIFF — 0% unlocked
Month 13:     ▓ 2.78% unlocked (first monthly release)
Month 14-48:  ▓▓▓▓▓▓▓▓▓▓ Linear vesting — 2.78% per month
Month 48:     ██████████████████████████ 100% fully vested
```

- **No tokens** accessible for the first 12 months
- After cliff: equal monthly releases over 36 months
- **[KNOWN GAP]**: Vesting is tracked off-chain. On-chain Staking Vault enforcement is planned but not yet deployed.

#### Infrastructure (350M UNY)

- Released proportionally to network activity and validator participation
- Maximum 7.29M UNY per month (2.08% of allocation)
- Unused allocation rolls forward — never expires, never accelerates
- **[PLANNED]**: Validator staking contracts not yet deployed

#### Treasury (150M UNY)

- **[KNOWN GAP]**: Currently single-key control. Multi-signature (3-of-5) planned.
- 6-month timelock on all disbursements [PLANNED]
- Community governance vote required for allocations > 5M UNY [PLANNED]
- Constitutional invariant: reserves must never fall below 20% of original allocation (30M UNY)

---

## 3. Token Utility

UNY is not a speculative asset. It is required to operate within the x402 ecosystem.

### 3.1 Primary Utilities

| Use Case | Description | Economic Impact |
|----------|-------------|-----------------|
| **x402 API Payments** | Every paid API call through the gateway requires UNY | Direct demand proportional to API usage |
| **Native Gas** | UNY is the gas token on UnyKorn L1 — every L1 transaction requires UNY | Base demand from all chain activity |
| **Prepaid Credits** | Deposit UNY into credit accounts for instant (~10ms) payment proofs | Locks UNY supply, reduces circulating |
| **Payment Channels** | Open bidirectional channels with UNY deposits for streaming payments | Locks UNY in channels during lifecycle |
| **Staking** | Validators stake UNY; protocol staking rewards distributed from x402 revenue | Reduces circulating supply, secures network |
| **Namespace Registration** | Register agent names (e.g., `fth.x402.facilitator`) requires UNY fee | Protocol revenue generation |
| **LP Provision** | Provide liquidity to UNY AMM pools for trading fee rewards | Deep liquidity, reduced slippage |
| **Governance** | Vote on protocol parameters, treasury allocation, upgrade proposals | Decentralized decision-making |

### 3.2 Demand Drivers

```
AI Agents Growing                  → More API calls
More API calls                     → More x402 payments (in UNY)
More x402 payments                 → More protocol revenue
More protocol revenue              → More buy-and-burn (40%)
More buy-and-burn                  → Less supply (deflationary)
Less supply + growing demand       → UNY value appreciation
UNY value appreciation             → Stronger protocol economics
Stronger protocol economics        → More AI agent adoption
                                   → Flywheel continues ↺
```

---

## 4. Revenue Model

### 4.1 Revenue Sources

The protocol generates revenue from real infrastructure usage — not speculation.

| Revenue Source | Mechanism | Denomination |
|---------------|-----------|-------------|
| **x402 API Payments** | 9 paid routes × per-request pricing | UNY |
| **Swap Fees** | 0.3% on every AMM swap (50% to protocol) | UNY |
| **Transaction Fees** | L1 gas fees on every UnyKorn chain transaction | UNY |
| **Staking Commission** | Protocol takes commission from validator rewards | UNY |
| **Namespace Fees** | Registration and renewal fees for agent names | UNY |
| **Channel Open/Close** | Fee on payment channel lifecycle events | UNY |
| **Premium Tier Access** | Higher-tier access (Pro, Institutional) requires more UNY | UNY |

### 4.2 Route Pricing (Current)

| Route | Price (UNY) | Tier |
|-------|-------------|------|
| Agent API Proxy | 0.0001 | Basic |
| Genesis Repro Pack | 0.0005 | Basic |
| Trade Verification | 0.00025 | Basic |
| Invoice Export | 0.001 | Pro |
| Analytics | 0.0002 | Basic |
| Receipt Lookup | 0.00015 | Basic |
| Namespace Query | 0.0001 | Basic |
| Agent Info | 0.0003 | Basic |
| Explorer Export | 0.002 | Pro |

### 4.3 Revenue Scaling Projection

| Monthly API Calls | Revenue (UNY) | Revenue (USD @ $0.01) |
|-------------------|---------------|----------------------|
| 10,000 | ~3 UNY | $0.03 |
| 100,000 | ~30 UNY | $0.30 |
| 1,000,000 | ~300 UNY | $3.00 |
| 10,000,000 | ~3,000 UNY | $30.00 |
| 100,000,000 | ~30,000 UNY | $300.00 |
| 1,000,000,000 | ~300,000 UNY | $3,000.00 |

*Revenue compounds with: price appreciation, higher-tier usage, staking yield, and ecosystem growth.*

---

## 5. Revenue Flywheel

### 5.1 Distribution

Every unit of protocol revenue is automatically split:

```
┌─────────────────────────────────────────────┐
│               x402 Protocol Revenue          │
│                                              │
│   ┌──────────┐  40% → BUY & BURN            │
│   │ █████████ │  UNY purchased from AMM      │
│   │ █████████ │  then permanently burned     │
│   └──────────┘  (deflationary supply shock)  │
│                                              │
│   ┌──────────┐  30% → LP PROVISION           │
│   │ ███████  │  Added to AMM liquidity       │
│   │ ███████  │  Deepens order book           │
│   └──────────┘  (reduces slippage)           │
│                                              │
│   ┌──────────┐  20% → TREASURY RESERVE       │
│   │ █████    │  Protocol sustainability      │
│   │ █████    │  Emergency fund               │
│   └──────────┘  (security blanket)           │
│                                              │
│   ┌──────────┐  10% → STAKING REWARDS        │
│   │ ███      │  Distributed to validators    │
│   │ ███      │  and stakers                  │
│   └──────────┘  (network security)           │
│                                              │
└─────────────────────────────────────────────┘
```

### 5.2 Minimum Cycle Threshold

The flywheel only executes when accumulated revenue ≥ **100 UNY**. This prevents:
- Dust transactions clogging the chain
- Inefficient gas usage on small amounts
- Unnecessary AMM interaction costs

### 5.3 Burn Mechanics

```
Revenue → 40% allocated to burn pool
       → Protocol buys UNY from AMM (market buy)
       → UNY sent to burn() function
       → totalSupply() permanently decremented
       → Burn event emitted on-chain
       → Burns are verifiable, irreversible, public
```

**Supply trajectory** (assuming $10K monthly revenue at $0.01 UNY):

| Year | Monthly Burns (UNY) | Cumulative Burned | Remaining Supply |
|------|--------------------|--------------------|-----------------|
| 1 | ~400,000 | 4,800,000 | 995,200,000 |
| 2 | ~400,000 | 9,600,000 | 990,400,000 |
| 5 | ~400,000 | 24,000,000 | 976,000,000 |

*As price appreciates, fewer UNY are burned per dollar of revenue — creating a natural equilibrium.*

---

## 6. AMM & Price Discovery

### 6.1 Constant-Product AMM

The protocol operates a Uniswap V2-style constant-product market maker:

$$ x \cdot y = k $$

Where:
- $x$ = UNY reserves in pool
- $y$ = USDT reserves in pool
- $k$ = invariant (increases only from fees)

### 6.2 Pool Parameters

| Parameter | Value |
|-----------|-------|
| **Formula** | Constant-product (x·y=k) |
| **Fee** | 0.3% per swap |
| **Fee Split** | 50% LPs / 50% protocol |
| **Seed Liquidity** | 10,000,000 UNY + $100,000 USDT |
| **Initial Price** | $0.01 per UNY |
| **Minimum Liquidity** | 1,000 (Uniswap V2-style lock) |

### 6.3 Price Impact

With 10M UNY seed liquidity at $0.01, buying UNY creates price impact:

| Buy Size (USDT) | UNY Received | Price After | Impact |
|-----------------|-------------|-------------|--------|
| $100 | ~9,990 UNY | $0.01002 | 0.1% |
| $1,000 | ~99,010 UNY | $0.01020 | 1.0% |
| $10,000 | ~909,091 UNY | $0.01210 | 10.0% |
| $50,000 | ~3,333,333 UNY | $0.01800 | 50.0% |

*As LP provision from the flywheel deepens the pool, price impact decreases over time.*

### 6.4 Trading Pairs

| Pair | Type | Status |
|------|------|--------|
| UNY/USDT | Primary | [PLANNED] |
| UNY/USDC | Secondary | [PLANNED] |
| UNY/BTC | Exchange | [PLANNED] |
| UNY/ETH | Exchange | [PLANNED] |

> **[KNOWN GAP]**: No trading pairs are live. AMM seed liquidity has not been deployed. All pairs are planned for post-exchange-listing.

---

## 7. Staking & Validators

### 7.1 Validator Staking

UnyKorn L1 uses Trinity Consensus with 3 validator nodes. Validators stake UNY to:

- Participate in block production
- Secure the network
- Earn protocol revenue shares (10% of flywheel)

### 7.2 Protocol Staking

Non-validators can stake UNY in the Staking Vault to earn yield from:

- 10% of x402 protocol revenue (flywheel allocation)
- Additional staking rewards from the Infrastructure allocation (40% of supply)

### 7.3 Staking Economics

| Parameter | Value |
|-----------|-------|
| Unbonding Period | 7 days |
| Minimum Stake | 1,000 UNY |
| Reward Source | x402 revenue (10%) + Infrastructure allocation |
| Yield | Variable — proportional to protocol revenue |
| Compounding | Hourly auto-compound available |

---

## 8. ICO Economics

### 8.1 Token Sale Structure

| Phase | Price | Bonus | Allocation | Min | Max |
|-------|-------|-------|-----------|-----|-----|
| **Seed** | $0.005 | +60% | 50,000,000 UNY | $100 | $25,000 |
| **Private** | $0.008 | +30% | 80,000,000 UNY | $500 | $100,000 |
| **Public** | $0.012 | +10% | 70,000,000 UNY | $50 | $50,000 |

**Total ICO**: 200,000,000 UNY (20% of supply)

### 8.2 Caps

| Metric | Value |
|--------|-------|
| Soft Cap | $500,000 |
| Hard Cap | $5,000,000 |
| ICO Period | April 15 – June 15, 2026 |

### 8.3 Use of Proceeds

| Category | % | Amount (at Hard Cap) |
|----------|---|---------------------|
| Infrastructure & AWS | 35% | $1,750,000 |
| Engineering & Development | 25% | $1,250,000 |
| Security Audits | 15% | $750,000 |
| Marketing & Partnerships | 15% | $750,000 |
| Legal & Compliance | 5% | $250,000 |
| Reserve | 5% | $250,000 |

---

## 9. Valuation Framework

### 9.1 Fully Diluted Valuation (FDV)

| Price | FDV | Rationale |
|-------|-----|-----------|
| $0.005 (Seed) | $5,000,000 | Early investor price |
| $0.008 (Private) | $8,000,000 | Current sale price |
| $0.01 (AMM seed) | $10,000,000 | AMM initial listing price |
| $0.05 | $50,000,000 | Post-exchange listing target |
| $0.25 | $250,000,000 | With meaningful x402 adoption |
| $1.00 | $1,000,000,000 | At-scale AI payment network |

### 9.2 Comparable Projects

UNY is unique — there is no direct comparable for an AI-focused HTTP 402 payment protocol with its own L1. However, adjacent projects provide valuation context:

| Project | Focus | FDV | UNY Differentiator |
|---------|-------|-----|-------------------|
| Render (RNDR) | GPU compute | $4B+ | UNY = payment layer, not compute |
| FET (Fetch.ai) | AI agents | $2B+ | UNY has working x402 protocol |
| AIOZ | Distributed infra | $500M+ | UNY has native L1 + settlement |
| TAO (Bittensor) | AI network | $3B+ | UNY focuses on commerce, not training |

### 9.3 Value Accrual

UNY value accrues through four mechanisms:

1. **Utility demand** — Every x402 payment requires UNY → buy pressure
2. **Burn** — 40% of revenue permanently reduces supply → scarcity
3. **Staking lock** — Staked UNY is removed from circulation → reduced selling pressure
4. **LP lock** — UNY in AMM pools is locked → reduced selling pressure

The combination of growing demand + shrinking supply creates structural appreciation pressure.

---

## 10. Constitutional Invariants

Hard-coded economic rules that cannot be changed:

| Invariant | Constraint | Enforcement |
|-----------|-----------|-------------|
| **Max Annual Inflation** | 0% (currently) — hard cap 15% even with governance vote | Smart contract — no mint function |
| **Min Treasury Reserve** | 20% of original treasury allocation (40M UNY) | On-chain verification |
| **Burn Permanence** | Burns are irreversible — totalSupply() decreases permanently | ERC20Burnable standard |
| **Vesting Enforcement** | Team tokens locked for 12 months minimum | Smart contract cliff |
| **Supply Cap** | 1,000,000,000 UNY absolute maximum — no exceptions | No mint() function in contract |

---

## 11. Risk Factors

| Risk | Mitigation |
|------|-----------|
| **Low adoption** | x402 protocol has real utility — AI agent market growing exponentially |
| **Regulatory** | Utility token — required for infrastructure access, not speculative investment |
| **Concentration** | Treasury locked with timelock + multi-sig; team vested over 48 months |
| **Smart contract** | OpenZeppelin base, immutable, no admin functions; **[KNOWN GAP]** no independent audit completed yet — planned pre-listing |
| **Competition** | First-mover in HTTP 402 payment standard; 29K+ lines of production code |
| **Liquidity** | Protocol-owned liquidity from flywheel; 30% of revenue deepens AMM |

---

## 12. Summary

UNY is a fixed-supply, deflationary, utility token native to UnyKorn L1 (Chain 7331).

It powers the x402 protocol — the first HTTP-native payment standard for AI agents.

The economics are simple:

1. More AI agents → more x402 API calls → more UNY demand
2. More revenue → more burns (40%) → less supply
3. Growing demand + shrinking supply → value appreciation
4. Value appreciation → stronger protocol → more adoption → flywheel

No hidden mints. No admin backdoors. No inflation. Just real revenue from real infrastructure usage driving permanent token burns.

---

---

## 13. UNY Genesis — Machine Economy Layer

> **[PLANNED]** — Architecture defined, implementation in progress.

UNY Genesis is the internal machine settlement and operating ledger for agents. It is **not a second token** — it is a controlled accounting layer derived from UNY Core deposits.

### 13.1 Dual-Asset Architecture

```
UNY Core
  ├─ public token
  ├─ gas + staking + liquidity + exchange asset
  └─ treasury / ecosystem / validator economics

UNY Genesis
  ├─ internal machine settlement unit
  ├─ agent budgets and escrow
  ├─ proof-backed receipts
  ├─ policy-gated execution rights
  └─ 24/7 agent operating balances
```

### 13.2 Genesis Balance Classes

| Class | Code | Purpose |
|-------|------|---------|
| Operating Balance | UNY-O | Agent day-to-day spending |
| Escrowed Balance | UNY-E | Locked pending task completion |
| Reserved Budget | UNY-R | Pre-allocated for approved work |
| Staked Reliability | UNY-S | Bonded for SLA guarantees |
| Proof Receipt | UNY-P | Settled, receipt-linked, immutable |
| Compliance-Cleared | UNY-C | Policy-verified for external settlement |

### 13.3 Genesis Flow

1. UNY Core is deposited into the Genesis system
2. Genesis mints internal operating credits 1:1 (or by policy)
3. Agents spend Genesis balances, not raw treasury balances
4. Receipts settle back into UNY Core or remain internal
5. Policy engine decides who can spend, reserve, refund, or escrow

### 13.4 Agent Settlement Primitives

| Primitive | Description |
|-----------|-------------|
| Prepaid Credits | Deposit UNY Core → Genesis operating balance |
| Escrow | Lock funds pending task delivery |
| Milestone Release | Partial release on verified progress |
| Streaming Spend | Continuous drip for long-running agents |
| Refund Path | Return escrowed funds on task failure |
| Dispute State | Hold funds during dispute resolution |
| Policy Hold | Freeze pending compliance review |
| Treasury Refill | Auto-replenish agent budgets from treasury |
| Signed Receipts | Every settlement emits a signed, verifiable receipt |

---

*© 2025–2026 FTH Trading · UnyKorn Protocol*  
*This document describes the tokenomics of UNY and the UNY Genesis machine economy. It is not financial advice. Cryptocurrency investments carry risk. DYOR.*
*Version 1.1 — Truth-layered. All status markers reflect actual system state as of March 2026.*
