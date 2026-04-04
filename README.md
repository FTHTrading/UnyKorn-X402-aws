# x402 on Apostle Chain

<div align="center">

## Request-Level Payment Infrastructure for AI Agent Commerce

**x402** is the production implementation of HTTP 402 Payment Required for autonomous AI agents — request-level payment proof, on-chain receipts, and cryptographic evidence for every transaction.

[![Live Ecosystem](https://img.shields.io/badge/live%20ecosystem-twin.unykorn.org-2563eb?style=for-the-badge)](https://twin.unykorn.org)
![Agents](https://img.shields.io/badge/agents-35%20live-059669?style=for-the-badge)
![Transactions](https://img.shields.io/badge/transactions-3200%2B%20settled-7c3aed?style=for-the-badge)
![Latency](https://img.shields.io/badge/settlement-<50ms-0f172a?style=for-the-badge)
![Fee](https://img.shields.io/badge/platform%20fee-%240-b45309?style=for-the-badge)

</div>

---

## Live Ecosystem

**[twin.unykorn.org](https://twin.unykorn.org)** — Real-time 3D visualization of 35 AI agents making ATP payments on Apostle Chain. The receipt feed updates live as transactions settle.

| Metric | Live |
|--------|------|
| Active agents | 35 |
| Settled transactions | 3,200+ |
| ATP in circulation | 2.86M |
| Settlement latency | <50ms avg |
| Platform fee | $0 |

---

## How x402 Works

HTTP 402 Payment Required has been in the HTTP spec since 1996, listed as "reserved for future use." This is that use.

```
Agent → calls endpoint → 402 challenge → signs TxEnvelope → retries with X-Payment-Proof header
Provider → verifies proof in <50ms → fulfills request → on-chain receipt written
```

**Integration (FastAPI — 20 lines):**

```python
@app.middleware("http")
async def require_payment(request: Request, call_next):
    proof = request.headers.get("X-Payment-Proof")
    if not proof:
        challenge = await sdk.create_challenge(
            service_uri=f"x402://{request.url.netloc}{request.url.path}",
            asset="ATP",
            amount="5000000000000000"  # 0.005 ATP
        )
        return JSONResponse(status_code=402, content={"challenge": challenge})
    result = await sdk.verify_proof(proof)
    if not result.ok:
        return JSONResponse(status_code=402, content={"error": result.reason})
    return await call_next(request)
```

Your existing endpoint, existing business logic, existing database. Zero infrastructure redesign.

---

## What This Solves

API keys were built for human developers. AI agents are autonomous — they make thousands of requests without human involvement, share keys (destroying attribution), and have no economic signal per request.

x402 replaces the key with an economic proof:
- **Per-request pricing** — different prices per route, paid on call
- **Sovereign agent wallets** — agents fund their own access
- **On-chain receipts** — cryptographic evidence of every transaction
- **Budget enforcement** — spend ceilings enforced at the transaction level (rejected, not flagged)
- **Evidence bundles** — Merkle-rooted, chain-signed bundles for enterprise audit

---

## Overview

The system provides:

- **Protocol-native monetization** for APIs and AI services
- **Edge-side payment enforcement** and proof verification
- **Compliance-ready receipts and audit trails**
- **Enterprise-ready integration and policy control**
- **Rust financial core** (Apostle Chain) for high-performance ledger, settlement, and risk

## Monorepo Structure

```text
X407/
+-- packages/
|   +-- facilitator/          # x402 payment facilitator (TypeScript/Fastify)
|   +-- treasury/             # Treasury management service
|   +-- guardian/             # Guardian daemon army (7 daemons)
|   +-- fth-financial-core/  # Rust financial engine (6 crates)
|   +-- unyKorn-contracts/   # Smart contracts (Hardhat)
|   +-- unyKorn-wallet/      # Wallet UI (Vite + React)
+-- aws/
|   +-- docker/               # Docker Compose, init-db.sql, e2e tests
|   +-- terraform/            # Infrastructure as Code
+-- registry/                 # Token, pool, and wallet registry
+-- scripts/                  # Inventory, deployment, operations
+-- workers/                  # Cloudflare Worker proxies
+-- docs/                     # Strategic docs, insights, GitHub Pages
+-- ops/                      # Operations guides and reports
```

## Services

| Service | Port | Language | Description |
|---------|------|----------|-------------|
| Facilitator | 3100 | TypeScript | x402 payment facilitation and verification |
| Treasury | 3200 | TypeScript | Wallet management, balance tracking, payments |
| Guardian | 3300 | TypeScript | 7-daemon monitoring army (health, sweep, audit, etc.) |
| Financial Core | 4400 | Rust | Ledger, settlement, vault, risk engine |

## Tech Stack

- **Runtime**: Node.js 24, Rust 1.93
- **Frameworks**: Fastify (TS), Axum (Rust)
- **Database**: PostgreSQL 16
- **Blockchain**: Avalanche C-Chain, UNY ERC-20 stablecoin
- **Infrastructure**: AWS (EC2, ECR, RDS, ALB), Docker Compose
- **Protocol**: x402 HTTP payment challenges

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp aws/docker/.env.example aws/docker/.env

# Start services locally
cd aws/docker && docker compose up -d

# Run E2E tests
bash aws/docker/e2e-test.sh
```

## Development

```powershell
# Open workspace
code unyKorn.code-workspace

# Build Rust financial core
cd packages/fth-financial-core
cargo build --release

# Run Rust tests
cargo test
```

## Security

- `.env` files are git-ignored. Copy `.env.example` -> `.env` in each package.
- Private keys and seed phrases are **never** stored in this repo.
- See [SECURITY.md](SECURITY.md) for responsible disclosure.

## Documentation

- [Competitive Positioning](docs/COMPETITIVE-POSITIONING.md)
- [90-Day Execution Plan](docs/EXECUTION-90-DAYS.md)
- [Implementation Roadmap](docs/IMPLEMENTATION-ROADMAP.md)
- [IP Protection Strategy](docs/IP-PROTECTION.md)
- [Pilot Partner Program](docs/PILOT-PARTNER-PROGRAM.md)
- [Operations Reference](docs/OPERATIONS.md)
- [Blog — 12 Posts on x402 and Agent Commerce](docs/blog/)
- [Distribution Playbook](docs/distribution-playbook.md)

---

## Get Involved

**API providers** — If you're building inference endpoints, data feeds, retrieval APIs, or specialized models that AI agents will call, contact us for a free integration walkthrough.

- Live demo: [twin.unykorn.org](https://twin.unykorn.org)
- Docs: [x402api.unykorn.org](https://x402api.unykorn.org)
- Email: [kevan@unykorn.org](mailto:kevan@unykorn.org)
- X: [@kevanburns](https://x.com/kevanburns)

**FTH EDU** — Financial sovereignty education platform: [fthedu.unykorn.org](https://fthedu.unykorn.org)

---

<div align="center">

**x402 on Apostle Chain** — Request-level payment infrastructure for agent-native commerce. HTTP 402, finally used.

</div>