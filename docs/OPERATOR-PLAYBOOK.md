# Genesis 2 Activation — Operator Playbook

> Paste this entire file as the opening prompt in a new VS Code Copilot chat session.
> It gives the agent full context to finish the remaining 20% correctly.

---

## Context

You are working in the UnyKorn-X402-aws monorepo at `C:\Users\Kevan\UnyKorn-X402-aws`.
Branch: `main`. Latest commit: `aa358f9`.

The Genesis 2 scaffold was built in Session 13:
- 32 packages (14 new), 8 apps (all new), 20 new Prisma models, 100+ TypeScript interfaces
- All code compiles clean under `tsc --strict`
- PostgreSQL is running locally on port 5432 (env says 5450 — check `.env` for `PGPORT`)
- Database has 21 legacy tables with active data

**The scaffold compiles. Nothing runs. This session is about ACTIVATION.**

---

## Phase 1: Database — Merge Schemas (Do First)

### 1a. Add legacy tables to Prisma schema

File: `packages/db/prisma/schema.prisma`

Add all 21 legacy tables as Prisma models with `@@map("table_name")` so Prisma
won't try to drop them. The legacy tables are:

**From SQL migrations (001-014):**
- credit_accounts, credit_transactions, invoices, namespace_records,
  payment_channels, receipt_roots, receipts, rate_limit_log,
  webhook_subscriptions, webhook_deliveries, treasury_agents,
  treasury_refills, treasury_policies, treasury_limits, treasury_halts

**From Guardian runtime (packages/fth-guardian/src/core/state-store.ts):**
- guardian_daemon_state, guardian_metrics, guardian_audit_log,
  guardian_upgrades, guardian_security_events, guardian_revenue

Get the exact column definitions from:
- `db/migrations-x402/001_credit_accounts.sql` through `014_treasury_halts.sql`
- `packages/fth-guardian/src/core/state-store.ts` (look for CREATE TABLE statements)

### 1b. Push the merged schema

```powershell
# Load env vars into shell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
  }
}
npx prisma db push --schema packages/db/prisma/schema.prisma
```

This should now only ADD new tables, not drop any existing ones.

### 1c. Verify

```powershell
npx prisma studio --schema packages/db/prisma/schema.prisma
```

Confirm all 41 tables are visible and legacy data is intact.

---

## Phase 2: Wire Agent Gateway (Priority App)

File: `apps/agent-gateway/src/index.ts`

### What exists now
- 10 routes returning mock JSON
- Imports: fastify only

### What it needs
1. Import `PrismaClient` from `@unykorn/db`
2. Import `AgentRegistry`, `TaskManager`, `BudgetManager` from `@unykorn/agent-core`
3. Import `PolicyEngine` from `@unykorn/policy-engine`
4. On startup: instantiate PrismaClient, connect to DB, hydrate registries from DB
5. Replace all mock handlers with real logic:

**Route wiring:**

| Route | Logic |
|-------|-------|
| POST /api/agents | Validate body → AgentRegistry.register() → persist to Agent table → return agent |
| GET /api/agents | Query Agent table with pagination → return list |
| GET /api/agents/:id | AgentRegistry.get() or DB lookup → return agent |
| PUT /api/agents/:id/status | AgentRegistry.updateStatus() → persist → return updated |
| DELETE /api/agents/:id | AgentRegistry.kill() → persist → return confirmation |
| POST /api/tasks | PolicyEngine.evaluate() → TaskManager.createTask() → BudgetManager.reserve() → persist → return task |
| GET /api/tasks/:id | DB lookup → return task |
| PUT /api/tasks/:id/transition | Validate state machine → TaskManager.transition() → persist → return updated |
| POST /api/tasks/:id/deliver | Mark delivered → TaskManager.transition('delivered') → persist |
| POST /api/tasks/:id/settle | Settlement flow → move to PROOF_RECEIPT → persist receipt |

6. Add error handling middleware
7. Add request validation using Zod schemas from shared-types
8. Add `/health` endpoint that checks DB connectivity

---

## Phase 3: Wire UNY Ledger (Priority App)

File: `apps/uny-ledger/src/index.ts`

Same pattern as Agent Gateway but for the Genesis Ledger:
- Import `GenesisLedger` from `@unykorn/genesis-ledger`
- Wire 13 routes to real ledger operations
- Persist every LedgerEntry to the database
- The ledger's SHA-256 hash chain MUST be verified on startup by replaying entries

---

## Phase 4: Fix Crypto

### 4a. Settlement Engine — Real Ed25519 Signing

File: `packages/settlement-engine/src/index.ts`

Replace the SHA-256 hash pretending to be a signature:
```typescript
import { generateKeyPairSync, sign, verify } from 'node:crypto';

// Generate a real Ed25519 key pair on init
const { publicKey, privateKey } = generateKeyPairSync('ed25519');

// Sign receipts
const signature = sign(null, Buffer.from(JSON.stringify(receipt)), privateKey);

// Verify
const isValid = verify(null, Buffer.from(JSON.stringify(receipt)), publicKey, signature);
```

### 4b. Identity Engine — Real Key Pairs

File: `packages/identity-engine/src/index.ts`

Replace random bytes with actual Ed25519 key generation:
```typescript
import { generateKeyPairSync } from 'node:crypto';
const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
```

---

## Phase 5: Integration Test

Create `tests/integration/core-flow.test.ts`:

Test this exact sequence:
1. Create organization
2. Register an agent (treasury role)
3. Create a Genesis account for the agent
4. Deposit 1000 UNY into the account
5. Create a second agent (settlement role)
6. Create a task from agent 1 to agent 2
7. Reserve budget for the task
8. Agent 2 delivers
9. Settle the task — verify PROOF_RECEIPT entry is created
10. Verify the ledger hash chain is intact
11. Verify treasury reconciliation balances

Use Vitest or Jest. Run against a real PostgreSQL database (use a test DB).

---

## Phase 6: Fix DNS

### ex.unykorn.org
Go to Cloudflare DNS for unykorn.org and add:
```
Type: CNAME
Name: ex
Target: unykorn-explorer.pages.dev
Proxy: Yes
```

### l1.unykorn.org
Either:
- Point it to an actual running L1 node
- Or DELETE the DNS record if nothing is running on those AWS IPs (44.209.152.75, 54.173.164.95)

---

## Phase 7: Fix Exchange-Readiness Supply Math

File: `packages/exchange-readiness/src/seed-data.ts`

Find the allocation that sums to 900M and fix it to 1B per TOKENOMICS.md v1.1:
- ICO: 200M
- Infrastructure: 350M
- AI Compute: 100M
- Treasury: 150M
- Ecosystem: 100M
- Team: 100M
= 1,000M ✓

---

## Phase 8: CI/CD and Docker

### 8a. Create Dockerfiles

For each app in `apps/`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/<relevant-engine> ./packages/<relevant-engine>
COPY apps/<app-name> ./apps/<app-name>
RUN npm install --workspace=apps/<app-name>
CMD ["node", "apps/<app-name>/dist/index.js"]
EXPOSE <port>
```

### 8b. Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: fth_x402
      POSTGRES_USER: fth_x402_app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports: ["5450:5432"]

  agent-gateway:
    build: { context: ., dockerfile: apps/agent-gateway/Dockerfile }
    ports: ["4000:4000"]
    depends_on: [postgres]
    env_file: .env

  uny-ledger:
    build: { context: ., dockerfile: apps/uny-ledger/Dockerfile }
    ports: ["4030:4030"]
    depends_on: [postgres]
    env_file: .env
```

### 8c. GitHub Actions

`.github/workflows/ci.yml` — on push to main:
1. npm install
2. tsc --noEmit across all workspaces
3. Run integration tests
4. Build Docker images
5. Push to container registry

---

## Completion Criteria

You're done when:

- [ ] `prisma db push` succeeds without dropping any legacy tables
- [ ] Agent Gateway starts on :4000 and responds to real CRUD operations
- [ ] UNY Ledger starts on :4030 and processes a deposit/transfer/settle cycle
- [ ] Integration test passes the 11-step flow above
- [ ] Settlement receipts use real Ed25519 signatures
- [ ] Identity engine generates real Ed25519 key pairs
- [ ] ex.unykorn.org resolves and shows the explorer
- [ ] exchange-readiness allocation sums to 1,000,000,000
- [ ] `git push origin main` with clean commit

---

## What NOT to do

- Do NOT add more packages or apps. The architecture is sufficient.
- Do NOT rewrite the type system. It's well-designed.
- Do NOT change the port assignments.
- Do NOT touch the legacy SQL migrations — they already ran.
- Do NOT claim anything is "live" until you can curl it and get a real response.

---

*This playbook was generated from live system inspection on 2026-03-26.*
