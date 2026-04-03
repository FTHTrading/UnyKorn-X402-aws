# UnyKorn L1 Recovery Audit

> **Date:** 2026-03-28  
> **Author:** Infrastructure Recovery Agent  
> **Status:** ACTIVE — Recovery in progress  
> **AWS Account:** 933629770808 (us-east-1)

---

## 1. System Inventory

### 1.1 AWS Infrastructure (us-east-1)

| Resource | ID / Name | State |
|----------|-----------|-------|
| EC2 alpha (producer, c6a.xlarge) | Running | Private VPC 10.100.x.x |
| EC2 bravo (validator, c6a.xlarge) | Running | Private VPC 10.100.x.x |
| EC2 charlie (validator, c6a.xlarge) | Running | Private VPC 10.100.x.x |
| EC2 delta (oracle, c6a.large) | Running | Private VPC 10.100.x.x |
| EC2 echo (oracle, c6a.large) | Running | Private VPC 10.100.x.x |
| ALB | unykorn-l1-devnet-alb | Active |
| NLB | unykorn-l1-devnet-nlb | Active |
| ACM Certificate | d51e9d27-0298-4e88-84f3-65f8b32aed21 | Issued |
| Route53 Zone | Z08184221LQW6HTHIC1D2 (l1.unykorn.org) | Active (unreachable) |
| VPC | 10.100.0.0/16 | Active |
| WAF | Attached to ALB | Active |
| S3 | 5 buckets (artifacts, audit-logs, reports, snapshots, donk) | Active |
| Terraform IaC | `aws/terraform/` — 8 modules | Intact |

### 1.2 ALB Target Groups

| Target Group | Port | Health Status | Issue |
|-------------|------|---------------|-------|
| unykorn-l1-devnet-rpc | TCP 3001 → all 5 nodes | **HEALTHY** | — |
| unykorn-l1-x402-facilitator | 3100 → delta | **HEALTHY** | — |
| unykorn-l1-x402-treasury | 3200 → delta | **UNHEALTHY** | Service not running |
| unykorn-l1-x402-guardian | 3300 → delta | **UNHEALTHY** | Service not running |
| unykorn-l1-devnet-api | 3001 → alpha | **UNHEALTHY** | ResponseCodeMismatch |
| unykorn-l1-devnet-dashboard | 3000 → alpha | **UNHEALTHY** | Timeout |
| unykorn-l1-x402-fincore | 4400 → delta | **UNUSED** | Not deployed |

### 1.3 DNS Records (Route53 — l1.unykorn.org)

| Record | Type | Target |
|--------|------|--------|
| l1.unykorn.org | A (alias) | ALB |
| api.l1.unykorn.org | A (alias) | ALB |
| demo.l1.unykorn.org | A (alias) | ALB |
| rpc.l1.unykorn.org | A (alias) | NLB |
| x402.l1.unykorn.org | A (alias) | ALB |
| facilitator.l1.unykorn.org | A (alias) | ALB |
| treasury.l1.unykorn.org | A (alias) | ALB |
| guardian.l1.unykorn.org | A (alias) | ALB |

### 1.4 Local Services (verified 2026-03-28)

| Service | Port | Status | Notes |
|---------|------|--------|-------|
| FTH x402 Facilitator | 3100 | **DEGRADED** | Responding with 429 "Too many requests" |
| FTH x402 Treasury | 3200 | **DOWN** | Connection refused |
| FTH Guardian | 3300 | **DOWN** | Connection refused |
| Agent Gateway | 4010 | **HEALTHY** | 15 agents, 0 tasks |
| Genesis Ledger (UNY) | 4030 | **HEALTHY** | Chain 7331, block 5339, synced |
| Apostle Chain | 7332 | **IDLE** | Height 2, 0 mempool, 5 agents |
| UnyKorn Daemon | 8077 | **HEALTHY** | 13 systems monitored |
| Prisma Studio | 5555 | **HEALTHY** | — |

### 1.5 Chain State

| Chain | ID | Block Height | Entries | Producing |
|-------|-----|-------------|---------|-----------|
| Genesis Ledger (UNY) | 7331 | 5339 | ~69,607 | YES |
| Apostle Chain (ATP) | 7332 | 2 | 2 (test) | NO (idle) |

### 1.6 Deposit Wallets

| Chain | Address | Balance | Status |
|-------|---------|---------|--------|
| XRPL | rsJ3PGGDH4vPpedjfVRe9YKTCf9BWu6TDC | 14 XRP | Minimal |
| Stellar | GBJF54FBYPBVHR6Z3OKWWEMPF6QYPNH3RZZYX3E4V7AUMUWIEV7Z3DPX | 0 XLM | **NOT ACTIVATED** (404) |
| TRON | TDZ8teLQSTP8htgKV1HQiL6gp39stcaGVd | Unverified | Needs RPC |
| EVM | 0x7d9a65d06dcc435a52D5880C6310Bd6E96c156DB | Unverified | Needs RPC |

### 1.7 AWS Monthly Cost

| Service | Cost (March 2026) |
|---------|------------------|
| EC2 Instances | $47.04 |
| EC2 Other (EBS, etc.) | $31.75 |
| CloudWatch | $12.82 |
| Elastic Load Balancing | $7.54 |
| VPC | $4.72 |
| WAF | $3.58 |
| Secrets Manager | $0.80 |
| Route53 | $0.50 |
| KMS | $0.39 |
| **Total** | **$109.14/mo** |

---

## 2. What Is Healthy

1. **AWS EC2 cluster** — All 5 nodes running, VPC intact, security groups correct
2. **ALB/NLB** — Both load balancers active with correct listener rules
3. **ACM certificate** — Issued and validated for *.l1.unykorn.org
4. **RPC target group** — All 5 nodes healthy on TCP 3001
5. **Genesis Ledger** — Chain 7331 actively producing blocks (5339+), 69K+ entries, synced
6. **Agent Gateway** — Running, DB connected, 15 agents registered
7. **Apostle Chain** — Binary running, accepting connections on 7332
8. **Terraform IaC** — Complete, 8 modules, devnet + staging tfvars ready
9. **UnyKorn Daemon** — Monitoring 13+ systems, alerts functional
10. **Prisma Studio** — Running, DB access verified
11. **XRPL deposit address** — Exists on-chain, 14 XRP balance

---

## 3. What Is Broken

### CRITICAL (Blocks all external access)

| # | Issue | Impact | Root Cause |
|---|-------|--------|------------|
| B1 | **l1.unykorn.org NS delegation missing** | ALL public endpoints unreachable | Cloudflare parent zone has no NS records pointing to Route53 nameservers |
| B2 | **Treasury service DOWN** | No treasury operations, no refills, no deposit credits | Port 3200 not listening — service not started |
| B3 | **Guardian service DOWN** | No daemon army, no auto-healing, no security enforcement | Port 3300 not listening — service not started |

### HIGH (Blocks economic flow)

| # | Issue | Impact | Root Cause |
|---|-------|--------|------------|
| B4 | **Facilitator rate-limited on /health** | Health checks fail, ALB marks unhealthy, daemon 429s | No health endpoint exemption from rate limiter |
| B5 | **Apostle Chain idle at height 2** | No settlement, no receipts, no economic output | No transactions submitted — wiring incomplete |
| B6 | **Agent Gateway: 15 agents, 0 tasks** | Agents exist but do nothing | No task scheduler/dispatcher active |
| B7 | **Stellar treasury not activated** | No XLM deposits possible | Account never funded (min 1 XLM activation) |
| B8 | **API target group UNHEALTHY** | api.l1.unykorn.org won't serve | alpha:3001 health check returns wrong status code |
| B9 | **Dashboard target group UNHEALTHY** | l1.unykorn.org / demo.l1.unykorn.org won't serve | alpha:3000 not responding (process down or port mismatch) |

### MEDIUM (Operational gaps)

| # | Issue | Impact | Root Cause |
|---|-------|--------|------------|
| B10 | **x402 FinCore target group unused** | Dead routing entry | Never deployed to delta |
| B11 | **USDF API offline** | Daemon monitoring shows it down | Service not running |
| B12 | **TRON/EVM balances unverified** | Unknown deposit rail state | Public RPC rate limits; no dedicated RPC providers |
| B13 | **Plaintext secrets in .env** | Security risk | No Secrets Manager integration in local dev |

---

## 4. Dependency Graph

```
Cloudflare NS delegation (B1)
  └─► Route53 resolves *.l1.unykorn.org
       ├─► ALB routes HTTPS traffic
       │    ├─► Dashboard :3000 (B9)
       │    ├─► API :3001 (B8)
       │    ├─► Facilitator :3100 (B4 — rate limit)
       │    ├─► Treasury :3200 (B2 — service down)
       │    ├─► Guardian :3300 (B3 — service down)
       │    └─► FinCore :4400 (B10 — not deployed)
       └─► NLB routes TCP to RPC :3001 (HEALTHY)

Facilitator :3100 ──► Genesis Ledger :4030 (HEALTHY)
                   ──► Settlement Engine (library)
                   ──► Apostle Chain :7332 (B5 — idle)

Treasury :3200 ──► Deposit Watchers
               ──► XRPL (14 XRP, minimal)
               ──► Stellar (B7 — not activated)
               ──► TRON (B12 — unverified)
               ──► EVM (B12 — unverified)

Guardian :3300 ──► Sentinel, Enforcer, Healer, Reaper
               ──► Upgrader, Treasurer, Anchor, Watcher

Agent Gateway :4010 ──► Task Scheduler (B6 — no tasks)
                    ──► Signing Client → Rust Signer :4050
                    ──► Policy Engine
```

---

## 5. Ranked Blockers (Remediation Order)

| Priority | Blocker | Fix | Effort | Unblocks |
|----------|---------|-----|--------|----------|
| 1 | B4: Facilitator /health rate-limited | Exempt /health from rate limiter | 5 min | ALB health, daemon monitoring, facilitator reachability |
| 2 | B2: Treasury DOWN | Start treasury service | 15 min | Deposit processing, refills, treasury operations |
| 3 | B3: Guardian DOWN | Start guardian service | 15 min | Auto-healing, monitoring, security enforcement |
| 4 | B1: DNS delegation | Add NS records in Cloudflare | 10 min + propagation | ALL public endpoints |
| 5 | B8: API target group | Fix health check path or service response | 15 min | api.l1.unykorn.org |
| 6 | B9: Dashboard target group | Start/fix dashboard service on alpha:3000 | 30 min | l1.unykorn.org, demo.l1.unykorn.org |
| 7 | B7: Stellar activation | Fund with ≥1 XLM | 5 min (needs XLM) | Stellar deposit rail |
| 8 | B6: Agent task dispatch | Enable scheduler/dispatcher | 1-2 hrs | Economic throughput |
| 9 | B5: Apostle Chain activation | Wire facilitator settlement to Apostle | 2-4 hrs | Real on-chain settlement |
| 10 | B10: FinCore unused | Deploy or remove | 30 min | Clean routing |
| 11 | B12: TRON/EVM verification | Add dedicated RPC providers | 30 min | Full deposit rail coverage |
| 12 | B13: Secrets management | Rotate to env-injected secrets | 1 hr | Security hardening |

---

## 6. Risks If Launched As-Is

1. **ZERO public access** — No one can reach any service without DNS fix
2. **No treasury operations** — Treasury service down means no deposit credits, no refills
3. **No guardian protection** — Security enforcement, auto-healing, and monitoring army offline
4. **Rate limiter blocks infrastructure** — ALB and daemon health checks are being 429'd
5. **No economic output** — Apostle Chain is idle, agents have no tasks, settlement isn't flowing
6. **Stellar deposits impossible** — Account doesn't exist on-chain
7. **Burning $109/mo** — AWS costs accruing with zero revenue flow
8. **Secret exposure** — Plaintext keys in `.env` on disk

---

## 7. Recovery Phases

- **Phase 1:** Rate limiter fix + service startup (B2, B3, B4)
- **Phase 2:** DNS delegation (B1)
- **Phase 3:** ALB target group health (B8, B9, B10)
- **Phase 4:** Treasury rail activation (B7, B12)
- **Phase 5:** Economic flow activation (B5, B6)
- **Phase 6:** Observability and hardening (B13)
- **Phase 7:** Smoke tests and final verification

See individual runbooks in `docs/runbooks/` for each phase.
