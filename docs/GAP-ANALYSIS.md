# UnyKorn Genesis 2 — Gap Analysis

> **Date** 2026-03-26 · **Assessor** System · **Severity**: Honest

---

## Overview

This document lists every known gap between what the Genesis 2 commit (aa358f9) claims and what actually works. No spin. No roadmap optimism. Just what's true right now.

---

## CRITICAL — System Cannot Go Live Without These

### GAP-01: Database Schema Not Applied

**What the code says:** 20 Prisma models defined in `packages/db/prisma/schema.prisma`.  
**What actually exists:** 21 legacy tables created by SQL migrations and Guardian runtime. 0 Genesis 2 tables.  
**Why it's blocked:** Running `prisma db push` attempts to DROP 5 legacy tables containing 42,000+ rows of production data (`guardian_audit_log`: 22,263 rows, `guardian_metrics`: 19,635 rows, `invoices`: 22 rows, `namespace_records`: 17 rows, `guardian_daemon_state`: 8 rows).  
**Fix required:** Add all 21 legacy tables as `@@map`'d models in the Prisma schema so it won't try to drop them. Then `db push`.  
**Effort:** 2-3 hours.

### GAP-02: All 8 Apps Are Stubs

**What the code says:** 8 Fastify apps with 66 routes across 8 ports (4000-4070).  
**What actually runs:** Nothing. All 8 apps have route handlers that return hardcoded mock JSON. Example:

```typescript
// apps/agent-gateway/src/index.ts
fastify.get('/api/agents', async () => {
  return { agents: [], total: 0 }; // ← always empty
});
```

**No app:**
- Imports or instantiates any engine class
- Connects to PostgreSQL
- Validates input with the shared-types schemas
- Handles errors with structured error responses

**Fix required:** Wire each app to its engine(s) and database. Start with Agent Gateway + UNY Ledger.  
**Effort:** 2-4 days per app × 8 apps = 2-4 weeks for all, but only 2-3 apps need to be live for MVP.

### GAP-03: No End-to-End Test Exists

**What the code claims:** 15 agents, A2A routing, policy enforcement, settlement, Merkle proofs.  
**What is tested:** TypeScript compilation only. Zero runtime tests.  
**Nobody has verified:**
- An agent can register, receive a task, and complete it
- The ledger correctly debits/credits across balance classes
- The policy engine actually blocks a restricted action
- Settlement produces a valid Merkle proof
- A2A messages route between two agents

**Fix required:** At minimum, one integration test that exercises the core flow: register agent → create task → reserve budget → deliver → settle → verify receipt.  
**Effort:** 1-2 days.

---

## HIGH — Would Be Caught Immediately in Any Real Evaluation

### GAP-04: In-Memory Engines, No Persistence

All engines (AgentRegistry, TaskManager, BudgetManager, GenesisLedger, PolicyEngine, SettlementEngine, IdentityEngine) use in-memory `Map` objects. A process restart loses everything.

**What this means:** The "append-only SHA-256 hash chain ledger" exists only in RAM. The "policy audit trail" is gone on restart. The "agent registry" is empty every boot.

**Fix required:** Wire engines to Prisma/PostgreSQL. The schema models exist — the connection layer doesn't.  
**Effort:** 3-5 days to add persistence adapters to all engines.

### GAP-05: settlement-engine Uses Fake Signing

```typescript
// packages/settlement-engine/src/index.ts
sign(receipt: SettlementReceipt): string {
  return createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
  // ← This is a hash, not a signature. No private key involved.
}
```

The "Ed25519 signing" mentioned in architecture docs is a SHA-256 hash disguised as a signature. There is no key pair, no verification against a public key, no cryptographic non-repudiation.

**Fix required:** Implement real Ed25519 signing using `@noble/ed25519` or Node.js `crypto.sign`.  
**Effort:** 4-8 hours.

### GAP-06: identity-engine Key Generation Is Not Production-Grade

```typescript
generateKeyPair() {
  return {
    publicKey: crypto.randomBytes(32).toString('hex'),
    privateKey: crypto.randomBytes(32).toString('hex'),
  };
}
```

These are random bytes, not an actual Ed25519 key pair. The public key is not derived from the private key. No signature/verification is possible with these "keys."

**Fix required:** Use `crypto.generateKeyPairSync('ed25519')` or `@noble/ed25519`.  
**Effort:** 2-4 hours.

### GAP-07: Exchange-Readiness Supply Math Is Wrong

The exchange-readiness `seed-data.ts` allocates 900M UNY but tokenomics says 1B. The 100M gap has been documented since Session 12 but never fixed.

**Fix required:** Align seed-data.ts with TOKENOMICS.md v1.1 allocation table.  
**Effort:** 30 minutes.

---

## MEDIUM — Visible Gaps That Reduce Credibility

### GAP-08: DNS — 2 of 4 Subdomains Broken

| Subdomain | Issue | Fix |
|-----------|-------|-----|
| ex.unykorn.org | NXDOMAIN — no DNS record at all | Add CNAME pointing to unykorn-explorer.pages.dev in Cloudflare DNS |
| l1.unykorn.org | DNS resolves (44.209.x.x, 54.173.x.x — AWS IPs) but origin times out | Either spin up an L1 node on those IPs or remove the DNS record |

### GAP-09: MCP Servers Are Catalog, Not Connections

`packages/mcp-servers/src/index.ts` exports a `MCP_SERVER_CATALOG` constant — a JavaScript object describing 14 servers with their tools, resources, and prompts. But:
- No actual MCP server process runs
- No stdio/SSE transport is configured
- No tool invocation is wired to real backends
- The MCP Hub app (`apps/mcp-hub`) has a `/api/tools/:server/:tool/invoke` route that returns `{ result: "mock" }`

### GAP-10: A2A Routing Is In-Memory Only

The A2A Router (`apps/a2a-router`) and A2A SDK (`packages/a2a-sdk`) define message types and routing tables but:
- No WebSocket or HTTP long-polling transport
- No message queue (Redis, NATS, etc.)
- No delivery guarantees
- No timeout/retry logic
- Route registration is per-process and lost on restart

### GAP-11: No CI/CD Pipeline

The repo has no:
- GitHub Actions workflows
- Dockerfile for any app
- Docker Compose for local development
- Deployment scripts for production
- Environment validation checks

### GAP-12: No Security Audit Trail Is Persisted

The PolicyEngine writes audit entries to an in-memory array. The AuditEntry Prisma model exists but is never written to. If someone asks "show me the audit log," the answer is "it's empty because it's in RAM."

---

## LOW — Won't Block Launch But Should Be Fixed

### GAP-13: Tokenomics "Governance" Remains Vague

TOKENOMICS.md v1.1 says governance "controls separate treasury and policy contracts, not the core token contract." But no governance contract exists. No voting mechanism. No proposal system. The governance section is aspirational.

### GAP-14: Whitepaper Claims vs. Reality Drift

The whitepaper references systems that don't match current code:
- "19 tables" → actually 21 legacy + 20 new = 41 total (in schema, but new ones aren't applied)
- Line counts in whitepaper may be stale
- Service architecture diagrams may not reflect the 8 new Genesis 2 apps

### GAP-15: No Rate Limiting on New Apps

The legacy gateway and facilitator have rate limiting (via `rate_limit_log` table). The 8 new Genesis 2 apps have zero rate limiting, authentication, or request validation middleware.

### GAP-16: No Health Check Integration

The 8 new apps don't implement `/health` endpoints that check database connectivity, engine state, or dependency health. They just return `{ status: "ok" }` unconditionally.

---

## Summary Counts

| Severity | Count | Resolution Time |
|----------|-------|----------------|
| Critical | 3 | 1-4 weeks |
| High | 4 | 1-2 weeks |
| Medium | 5 | 1-2 weeks |
| Low | 4 | Days |
| **Total** | **16** | **3-6 weeks to production-ready** |

---

## Bottom Line

The Genesis 2 scaffold is architecturally sound. The type system is well-designed. The package boundaries are clean. The code compiles.

But **compiling is not running**. Running is not tested. Tested is not deployed. Deployed is not production.

Right now this system is at: **Compiles ✓ → Running ✗**

The remaining 20% is the hardest 20%. It's where mock data becomes real data, hash functions become signatures, in-memory becomes persistent, and "route registered" becomes "request handled correctly."

---

*Gap analysis based on source code inspection, live endpoint testing, and database state verification.*
