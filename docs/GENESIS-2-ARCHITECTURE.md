# UnyKorn Genesis 2 — Architecture Reference

> **Version** 2.0 · **Date** 2025-03-26 · **Status** BUILT — not yet deployed

---

## 1  System Overview

Genesis 2 is a **dual-protocol sovereign agent network** that combines:

| Protocol | Purpose | Implementation |
|----------|---------|---------------|
| **MCP** (Model Context Protocol) | Tool, data, and system access | `packages/mcp-servers` — 14 server definitions |
| **A2A** (Agent-to-Agent) | Negotiation, delegation, execution | `packages/a2a-sdk` — cards, routing, messages |
| **UNY Genesis** | Native machine settlement | `packages/genesis-ledger` — double-entry append-only ledger |

All three protocols converge inside UnyKorn's **always-on agent mesh** — 15 role-based agents operating across 4 tiers.

---

## 2  Agent Tier Architecture

```
┌─────────────────────────────────────────────────────┐
│  TIER 1 — CONTROL                                   │
│  treasury · compliance · policy · risk              │
│  Full auth, spend approval, kill-switch authority    │
├─────────────────────────────────────────────────────┤
│  TIER 2 — EXECUTION                                 │
│  exchange-listing · listing-packet · onboarding     │
│  wallet-ops · reconciliation · incident-response    │
│  documentation · settlement                         │
│  Task performers, budget-capped, policy-governed    │
├─────────────────────────────────────────────────────┤
│  TIER 3 — INTELLIGENCE                              │
│  market-monitor · intelligence                      │
│  Read-only market data, signals, analysis           │
├─────────────────────────────────────────────────────┤
│  TIER 4 — INTERFACE                                 │
│  customer-desk                                      │
│  Customer-facing, routes to specialists             │
└─────────────────────────────────────────────────────┘
```

---

## 3  Package Map

### 3.1  Core Infrastructure (new)

| Package | Path | Purpose |
|---------|------|---------|
| `@unykorn/shared-types` | `packages/shared-types` | Canonical TypeScript types — 100+ interfaces across 6 modules |
| `@unykorn/db` | `packages/db` | Prisma schema (20 models), seed data, database client |
| `@unykorn/agent-core` | `packages/agent-core` | AgentRegistry, TaskManager, BudgetManager |
| `@unykorn/genesis-ledger` | `packages/genesis-ledger` | Double-entry append-only ledger, escrow, staking, settlement |
| `@unykorn/policy-engine` | `packages/policy-engine` | Rule evaluation, emergency pause, audit trail |
| `@unykorn/settlement-engine` | `packages/settlement-engine` | Receipt creation, batching, Merkle trees, signing |
| `@unykorn/identity-engine` | `packages/identity-engine` | Agent identity, key generation, permission validation |
| `@unykorn/a2a-sdk` | `packages/a2a-sdk` | Agent cards, routing tables, message builder |
| `@unykorn/mcp-servers` | `packages/mcp-servers` | 14 MCP server definitions with tools/resources/prompts |
| `@unykorn/agent-roles` | `packages/agent-roles` | 15 role definitions with capabilities and limits |
| `@unykorn/receipts` | `packages/receipts` | Receipt store with query capabilities |
| `@unykorn/proofs` | `packages/proofs` | Merkle tree builder, proof generation, verification |
| `@unykorn/treasury-core` | `packages/treasury-core` | Treasury state, refill logic, spend caps |
| `@unykorn/telemetry` | `packages/telemetry` | Metrics collection, event tracking |

### 3.2  Applications (new)

| App | Port | Path | Routes |
|-----|------|------|--------|
| Agent Gateway | 4000 | `apps/agent-gateway` | 10 — agents CRUD, task lifecycle |
| A2A Router | 4010 | `apps/a2a-router` | 7 — discovery, messaging, capability search |
| MCP Hub | 4020 | `apps/mcp-hub` | 7 — server registry, tools, resources, invoke proxy |
| UNY Ledger | 4030 | `apps/uny-ledger` | 13 — accounts, transfers, escrow, settlement |
| Proof Center | 4040 | `apps/proof-center` | 9 — receipts, batches, proofs, verification |
| Ops Console | 4050 | `apps/ops-console` | 9 — dashboard, budgets, task queue, incidents |
| Intelligence Center | 4060 | `apps/intelligence-center` | 7 — signals, market, competitors, sentiment |
| Concierge | 4070 | `apps/concierge` | 5 — customer requests, feedback |

### 3.3  Existing Packages (pre-Genesis 2)

18 packages from Sessions 1-12 including fth-x402-core, unykorn-explorer,
unyKorn-contracts, exchange-readiness, uny-economics, unykorn-ico, etc.

---

## 4  Genesis Balance Classes

| Code | Class | Purpose |
|------|-------|---------|
| `OP` | OPERATING | Agent working balances |
| `ES` | ESCROW | Task-locked funds pending completion |
| `RE` | RESERVED | Budget earmarks |
| `SR` | STAKED_RELIABILITY | Agent reputation stake |
| `PR` | PROOF_RECEIPT | Settled, immutable (write-once) |
| `CC` | COMPLIANCE_CLEARED | Audited and cleared |

---

## 5  Ledger Design

```
┌──────────────────────────────────────────────────────┐
│  GenesisLedger (append-only, SHA-256 hash chain)     │
│                                                      │
│  deposit → credit OPERATING                          │
│  withdraw → debit OPERATING                          │
│  transfer → debit A / credit B                       │
│  escrowLock → debit OPERATING / credit ESCROW        │
│  escrowRelease → debit ESCROW / credit OPERATING     │
│  reserve → debit OPERATING / credit RESERVED         │
│  stake → debit OPERATING / credit STAKED_RELIABILITY │
│  settle → debit * / credit PROOF_RECEIPT (immutable) │
│                                                      │
│  Every entry: { debit, credit, amount, hash, prev }  │
│  Treasury reconciliation: totalSupply == accountedFor │
└──────────────────────────────────────────────────────┘
```

---

## 6  MCP Servers (14)

| Server | Tools | Scope |
|--------|-------|-------|
| treasury | get_treasury_state, get_agent_balance, request_refill, get_spend_history | treasury:read/write |
| tokenomics | get_supply, get_allocation, get_vesting_schedule | tokenomics:read |
| compliance | check_compliance, get_risk_flags, run_kyc_check, get_regulatory_status | compliance:read/write |
| legal-docs | get_document, search_documents, generate_disclosure | docs:read/write |
| exchange-packets | generate_packet, get_readiness_score, list_exchanges, get_packet_status | exchange:read/write |
| explorer | get_block, get_transaction, get_address_info | chain:read |
| support-desk | create_ticket, get_ticket, escalate_ticket | support:read/write |
| market-intelligence | get_market_data, get_sentiment, get_competitor_analysis | market:read |
| portfolio-rwa | get_portfolio, get_asset_valuation | portfolio:read |
| payments | process_payment, create_invoice, get_payment_status | payments:read/write |
| customer-records | get_customer, search_customers, update_customer | customer:read/write |
| chain-ops | get_node_status, get_validator_info, get_network_health | chain:read |
| identity | verify_identity, get_agent_card, rotate_keys | identity:read/write |
| agent-registry | list_agents, get_agent, register_agent, update_status | agent:read/write |

---

## 7  A2A Message Flow

```
 Agent A                    A2A Router                  Agent B
    │                           │                           │
    ├── TaskRequest ───────────>│                           │
    │                           ├── TaskRequest ───────────>│
    │                           │<──── TaskQuote ───────────┤
    │<──── TaskQuote ───────────┤                           │
    ├── TaskAccept ────────────>│                           │
    │                           ├── TaskAccept ────────────>│
    │                           │<──── TaskProgress ────────┤
    │<──── TaskProgress ────────┤                           │
    │                           │<──── TaskDeliver ─────────┤
    │<──── TaskDeliver ─────────┤                           │
    ├── TaskSettle ────────────>│         (Genesis Ledger)  │
    │                           ├── Settlement Receipt ────>│
    └───────────────────────────┴───────────────────────────┘
```

---

## 8  Policy Engine Flow

```
  Request → PolicyEngine.evaluate()
      │
      ├─ Check emergency pauses → DENY if paused
      ├─ Load rules (sorted by priority)
      ├─ Evaluate conditions for each rule
      │    ├─ field == tier → match agent tier
      │    ├─ field == role → match agent role
      │    ├─ field == jurisdiction → match against restricted list
      │    └─ field == killSwitch → check agent kill state
      ├─ First matching DENY → block
      ├─ First matching REQUIRE_APPROVAL → queue for human
      └─ ALLOW → proceed
      │
      └─ Append to audit trail
```

---

## 9  Data Model Summary (Prisma)

20 models across 5 domains:

**Identity**: Organization, Agent, AgentWallet, AgentBudget, AgentHeartbeat  
**Ledger**: GenesisAccount, LedgerEntry, Escrow, EscrowCondition, StreamingBalance  
**Tasks**: AgentTask, A2AMessage  
**Governance**: PolicyRule, PolicyDecision, PolicyApproval, AuditEntry, EmergencyPause  
**Proofs**: SettlementReceipt, ReceiptBatch, ProofArtifact, McpServer  

---

## 10  Deployment Topology

```
                    ┌─────────────┐
                    │  Cloudflare  │
                    │  DNS / CDN   │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────┴────┐      ┌─────┴─────┐     ┌─────┴──────┐
   │ Explorer │      │  ICO Site  │     │  Gateway   │
   │  (Pages) │      │  (Pages)   │     │ (Workers)  │
   └─────────┘      └───────────┘     └─────┬──────┘
                                              │
                    ┌─────────────────────────┤
                    │         Apps Mesh        │
        ┌───────────┼───────────┬─────────────┤
   ┌────┴────┐ ┌────┴────┐ ┌───┴────┐  ┌─────┴──────┐
   │  Agent  │ │   A2A   │ │  MCP   │  │    UNY     │
   │ Gateway │ │ Router  │ │  Hub   │  │  Ledger    │
   │  :4000  │ │  :4010  │ │ :4020  │  │   :4030    │
   └─────────┘ └─────────┘ └────────┘  └────────────┘
        ┌───────────┼───────────┬─────────────┤
   ┌────┴────┐ ┌────┴────┐ ┌───┴────┐  ┌─────┴──────┐
   │  Proof  │ │   Ops   │ │ Intel  │  │ Concierge  │
   │ Center  │ │ Console │ │ Center │  │   :4070    │
   │  :4040  │ │  :4050  │ │ :4060  │  └────────────┘
   └─────────┘ └─────────┘ └────────┘
                    │
              ┌─────┴─────┐
              │ PostgreSQL │
              │  (Prisma)  │
              └───────────┘
```

---

## 11  Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| shared-types (100+ interfaces) | ✅ BUILT | Compiles clean |
| Prisma schema (20 models) | ✅ BUILT | Not yet migrated (needs PostgreSQL) |
| agent-core | ✅ BUILT | In-memory, compiles clean |
| genesis-ledger | ✅ BUILT | SHA-256 hash chain, compiles clean |
| policy-engine | ✅ BUILT | Rule evaluation, emergency controls |
| settlement-engine | ✅ BUILT | Receipts, Merkle trees |
| identity-engine | ✅ BUILT | Key generation, permissions |
| a2a-sdk | ✅ BUILT | Cards, routing, messages |
| mcp-servers | ✅ BUILT | 14 server definitions |
| agent-roles | ✅ BUILT | 15 role definitions |
| receipts | ✅ BUILT | In-memory receipt store |
| proofs | ✅ BUILT | Merkle proof generation/verification |
| treasury-core | ✅ BUILT | State management, spend caps |
| telemetry | ✅ BUILT | Metrics, events |
| 8 Fastify apps | ✅ BUILT | Routes scaffolded, mock handlers |
| Seed data | ✅ BUILT | 15 agents, 6 policy rules |
| PostgreSQL migration | ⏳ PLANNED | Needs `npx prisma db push` |
| Production deployment | ⏳ PLANNED | Docker / fly.io / Railway |
| Real MCP server connections | ⏳ PLANNED | Currently catalog-only |
| A2A live routing | ⏳ PLANNED | Currently in-memory |
| E2E integration tests | ⏳ PLANNED | — |

---

## 12  Known Gaps

1. **Single-key treasury** — no multi-sig yet (KNOWN GAP in TOKENOMICS.md)
2. **Off-chain vesting** — team vesting enforced by contract only
3. **No independent audit** — planned pre-listing
4. **DNS** — `ex.unykorn.org` (NXDOMAIN, needs CNAME), `l1.unykorn.org` (504, origin issue)
5. **Supply math** — exchange-readiness seed still has 100M gap (900M ≠ 1B)
6. **Ed25519 signing** — placeholder SHA-256 hash used in settlement-engine

---

## 13  Security Boundaries

- **Budget caps** per agent, per task, per day — enforced by BudgetManager
- **Policy engine** sits in front of every action — rules sorted by priority
- **Kill switch** — any control-tier agent can halt any lower-tier agent
- **Emergency pause** — global halt capability in policy-engine
- **Restricted jurisdictions** — KP, IR, SY, CU blocked at policy level
- **Append-only ledger** — no delete, no update; SHA-256 hash chain
- **PROOF_RECEIPT** balance class — write-once, immutable after settlement

---

*Generated by Genesis 2 build pipeline · Session 13*
