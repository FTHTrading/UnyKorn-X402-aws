# UnyKorn — Treasury Policy

**Version:** 1.0.0  
**Last Updated:** 2026-03-26  
**Owner:** FTH Trading / UnyKorn Protocol

---

## 1. Treasury Overview

| Wallet | Balance | Chain | Controller | Multi-Sig |
|--------|---------|-------|------------|-----------|
| Main Treasury | 400,000,000 UNY | UnyKorn L1 (7331) | Deployer key | ❌ No |
| LP Reserve | 100,000,000 UNY | UnyKorn L1 (7331) | Deployer key | ❌ No |

**Total Treasury:** 500,000,000 UNY (50% of total supply)

---

## 2. Treasury Allocation Rules

### 2.1 Permitted Uses
- Protocol development and engineering
- Ecosystem grants and partnerships
- Exchange listing fees and liquidity provision
- Market maker token loans
- Operational expenses (infrastructure, legal, compliance)
- Bug bounty rewards

### 2.2 Prohibited Uses
- Personal use by team members
- Speculative trading
- Market manipulation
- Transfers to addresses in sanctioned jurisdictions

### 2.3 Spending Limits (Current — Single Key)
| Tier | Amount | Approval |
|------|--------|----------|
| < 1M UNY | Founder discretion | Single key |
| 1M — 10M UNY | Documented justification | Single key (logged) |
| > 10M UNY | Board/advisor consultation | Single key (risk accepted) |

### 2.4 Spending Limits (Target — Multi-Sig)
| Tier | Amount | Approval |
|------|--------|----------|
| < 100K UNY | Any single signer | 1-of-5 |
| 100K — 1M UNY | Standard multi-sig | 2-of-5 |
| 1M — 10M UNY | Full multi-sig + timelock | 3-of-5 + 48h |
| > 10M UNY | Governance vote + timelock | 3-of-5 + 7d lock |

---

## 3. Revenue Distribution (x402 Protocol Revenue)

All x402 protocol fees are distributed according to the Revenue Flywheel:

| Allocation | Percentage | Mechanism |
|------------|------------|-----------|
| Buyback & Burn | 40% | Market buy → burn (deflationary) |
| LP Provision | 20% | Add to protocol-owned AMM liquidity |
| Treasury | 20% | Operational reserve |
| Staking Rewards | 15% | Distributed to UNY stakers |
| Insurance Fund | 5% | Reserve for incident recovery |

---

## 4. Transparency

- All treasury transactions will be publicly verifiable on UnyKorn L1 Explorer (once mainnet launches)
- Monthly treasury reports will be published (format TBD)
- All significant allocations (>1M UNY) will be disclosed publicly

---

## 5. Migration Plan — Multi-Sig

**Target:** Q3 2026

1. Deploy Gnosis Safe (or equivalent) on UnyKorn L1
2. Configure 3-of-5 signing with 48h timelock for large transactions
3. Transfer treasury assets to multi-sig wallet
4. Publish signer identities (at least 3 of 5 public)
5. Update all documentation and exchange packets

**Signer Requirements:**
- At least 3 of 5 signers must be publicly identifiable
- No single entity controls majority of keys
- Hardware wallet required for all signers
- Key rotation schedule: annual

---

## 6. Known Risks

| Risk | Severity | Status |
|------|----------|--------|
| Single deployer key controls all treasury | Critical | Planned migration to multi-sig |
| No timelock on treasury transactions | High | Part of multi-sig migration |
| Treasury balance not independently verifiable | Medium | Requires mainnet launch |
| No formal spending audit trail | Medium | Treasury reporting framework planned |

---

*This document is maintained as part of the Exchange Readiness OS.*
