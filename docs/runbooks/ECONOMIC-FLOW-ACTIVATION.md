# Economic Flow Activation Runbook

> **Created:** 2026-03-28  
> **Scope:** Wire the first real economic transactions through the stack

---

## Architecture Overview

```
                    ┌──────────────┐
                    │  FTH Pay API │  :3100
                    │ (Express/PG) │  7 chain adapters
                    └──────┬───────┘  Deposit watcher active
                           │
              (NOT connected to Apostle/Genesis)
                           │
    ┌──────────────────────┼───────────────────────┐
    │                      │                        │
┌───▼────┐          ┌──────▼──────┐          ┌──────▼──────┐
│Apostle │  :7332   │Genesis Ledgr│  :4030   │Agent Gateway│  :4010
│ Chain  │          │  (UNY Core) │          │  (Prisma)   │
│ APO/ATP│          │  chain 7331 │          │  15 agents  │
│height=2│          │  69k entries│          │  0 tasks    │
└───┬────┘          └──────┬──────┘          └─────────────┘
    │                      │
    │ (bridges)            │ (l1-adapter.ts)
    ▼                      ▼
┌────────┐          ┌──────────────┐
│XRPL/XLM│          │x402 Facilitr │  (replaced by fth-pay-api on :3100)
│ Bridges│          │ Merkle anchor│
└────────┘          └──────────────┘
```

---

## Current State

| Component | Status | Issue |
|-----------|--------|-------|
| FTH Pay API | ✅ Running (:3100) | Rate limit 100/15min — too low |
| Genesis Ledger | ✅ Running (:4030) | 69,885 entries, chain 7331, synced |
| Agent Gateway | ✅ Running (:4010) | 15 agents, **0 tasks** |
| Apostle Chain | ⚠️ Running (:7332) | Height 2, **0 mempool, stalled** |
| x402 Treasury | ❌ Down | Not started |
| Guardian | ❌ Down | Not started |
| Signer | ❌ Down (:4050) | Not started |

---

## Step 1: Submit First Apostle Transaction

The Apostle Chain settles **synchronously** — transactions are applied to the ledger immediately on submission, without waiting for block consensus.

**Submit a test transfer between existing agents:**

```powershell
# List current agents and their balances
$status = (Invoke-WebRequest "http://localhost:7332/status" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Agents: $($status.agents), Height: $($status.height)"

# Check agent balances (use agent IDs from /v1/agents or airdrop)
# POST /v1/tx with a Transfer payload
$tx = @{
    type = "transfer"
    from = "agent:<source-uuid>"
    to = "agent:<dest-uuid>"
    asset = "ATP"
    amount = "1000000000000000000"  # 1 APO (18 decimals, MUST be string)
    memo = "test-economic-flow"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:7332/v1/tx" -Method POST -Body $tx -ContentType "application/json" -UseBasicParsing
```

**Note:** Amount must be a string (not number) due to serde u128 limitation.

---

## Step 2: Verify Receipts

```powershell
$receipts = (Invoke-WebRequest "http://localhost:7332/v1/receipts" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Total receipts: $($receipts.Count)"
$receipts | Select-Object -First 5 | ConvertTo-Json -Depth 3
```

---

## Step 3: Activate Block Proposer (Future)

The Apostle Chain's consensus module has DAG, mempool, and proposer code but **no active block production loop**. Transactions settle immediately to the journal without being batched into blocks.

**What's needed to start block production:**

1. A Tokio interval timer in the API server that:
   - Calls `mempool.drain(batch_size)` every N seconds
   - Creates a `Block` with drained transactions
   - Inserts into the `DAG`
   - Broadcasts via mesh to validators

2. Validator attestation handling:
   - Validators receive proposed blocks
   - Sign attestations (2/3+ needed for finality)
   - DAG tracks finalized tips

**Current workaround:** The synchronous settlement means transactions ARE processed — they just don't appear as blocks in the DAG. The height won't increment, but the journal and balance state are consistent.

---

## Step 4: Agent Task Dispatch

The Agent Gateway has 15 registered agents but 0 tasks. To start economic flow:

**Register a task:**
```powershell
$task = @{
    type = "settlement"
    agent_id = "<agent-uuid>"
    payload = @{
        action = "verify_receipt"
        receipt_id = "<receipt-id>"
    }
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "http://localhost:4010/tasks" -Method POST -Body $task -ContentType "application/json" -UseBasicParsing
```

---

## Step 5: Genesis Ledger Integration

The Genesis Ledger (:4030) manages double-entry accounting with 6 balance classes. The x402 Facilitator's `l1-adapter.ts` connects to it at `http://localhost:4030/rpc` for Merkle root anchoring.

**Check current state:**
```powershell
$health = (Invoke-WebRequest "http://localhost:4030/health" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Entries: $($health.entries), Uptime: $($health.uptime)s"
```

---

## Step 6: Wire FTH Pay → Apostle (Future Integration)

Currently, FTH Pay API operates as a standalone payment system with its own PostgreSQL database. It does NOT connect to Apostle Chain or Genesis Ledger.

**Integration path:**
1. Add Apostle RPC client to FTH Pay (`http://localhost:7332`)
2. On each transfer, submit a mirrored tx to Apostle for settlement
3. Use Apostle receipts as proof of settlement
4. Anchor Merkle roots to Genesis Ledger

This requires modifying `packages/api/src/services/transfer.service.ts` to call Apostle's `/v1/tx` after successful database transfer.

---

## End-to-End Settlement Flow (Target State)

```
1. User initiates transfer via FTH Pay API
2. FTH Pay validates, debits sender, credits receiver (PostgreSQL)
3. FTH Pay submits tx to Apostle Chain (/v1/tx)
4. Apostle settles, signs receipt
5. Receipt batched into Merkle tree
6. Merkle root anchored to Genesis Ledger
7. Bridge adapters can pull receipts for XRPL/Stellar settlement
8. Guardian daemons monitor health + enforce policy
```

---

## Quick Smoke Test

```powershell
# 1. Check all services are up
@(3100, 4010, 4030, 7332) | ForEach-Object {
    try {
        $r = Invoke-WebRequest "http://localhost:$_/health" -TimeoutSec 3 -UseBasicParsing
        "$_ => $($r.StatusCode) OK"
    } catch { "$_ => DOWN" }
}

# 2. Check Apostle Chain has agents
(Invoke-WebRequest "http://localhost:7332/status" -UseBasicParsing).Content

# 3. Check Genesis Ledger entries are growing
(Invoke-WebRequest "http://localhost:4030/health" -UseBasicParsing).Content

# 4. Check Agent Gateway agents
(Invoke-WebRequest "http://localhost:4010/health" -UseBasicParsing).Content
```
