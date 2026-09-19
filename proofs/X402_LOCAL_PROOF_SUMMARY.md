# X402 Local Proof Summary

**Date:** 2026-05-08  
**Environment:** Local development laptop (Windows 11, RTX 5090)  
**Classification:** LOCAL_PROOF — engineering validation only

---

## What Was Proven

### 1. Stripe Webhook Authentication
A Stripe-style `checkout.session.completed` event was constructed with:
- Correct HMAC-SHA256 signature using the live webhook secret
- UTC timestamp (age guard < 5 minutes)
- Compact single-line JSON body (byte-identical to Stripe's format)

The event was delivered via HTTPS through:
- Cloudflare Worker (`unykorn-x402-edge`) at `x402.unykorn.org`
- Cloudflare Named Tunnel → `http://127.0.0.1:4020`
- Express gateway (`x402-credit-gateway`) → HMAC verification → deduplication

**Result:** HTTP 200 `{"received":true}` — signature valid, age valid, event new.

### 2. x402 Gateway Pipeline
The gateway on port 4020:
- Received the signed webhook
- Verified HMAC via `timingSafeEqual` (constant-time, no timing oracle)
- Checked event age against UTC (not local time — prior bug that was fixed)
- Checked idempotency: event ID stored in SQLite, duplicate events rejected
- Parsed the checkout session to extract agent ID and ATP amount

**Result:** Gateway correctly routes webhook → creditATP call.

### 3. ATP Credit via Apostle Airdrop
The gateway called `POST http://localhost:7332/v1/airdrop` with:
```json
{
  "recipients": [{
    "agent_id": "87724c76-da93-4b1a-9fa6-271ba856338e",
    "apo_amount": "1000000000000000000",
    "label": "stripe-credit:1 ATP Credit"
  }]
}
```

**Result:** Stub accepted, minted 1 ATP (1000000000000000000 wei) to Kevan's agent.  
Confirmed via `GET /v1/agent/87724c76-da93-4b1a-9fa6-271ba856338e/balance`.

### 4. Cloudflare Tunnel
- CF Named Tunnel ID `98795c02` connected on 4 edge nodes (atl06, atl13, atl14)
- Config fixed: `localhost` → `127.0.0.1` to prevent Windows IPv6 `[::1]` resolution
- `https://x402-origin.unykorn.org/health` → gateway health confirmed publicly

---

## What Was NOT Proven

| Claim | Status | Reason |
|---|---|---|
| Real Rust Apostle Chain settlement | NOT PROVEN | Binary not on this machine; real chain on EC2 |
| Ed25519-signed ATP transfer | NOT PROVEN | `X402_OPERATOR_PRIVATE_KEY` not set; no signing in staged mode |
| On-chain ledger finality | NOT PROVEN | Stub is in-memory only; resets on restart |
| Multi-agent settlement | NOT PROVEN | Only Kevan's agent tested |
| Stripe live payment capture | NOT PROVEN | Webhook test used synthetic signed event, not real customer checkout |
| XRPL/Stellar bridge settlement | NOT PROVEN | Bridge routes not exercised |

---

## Why LOCAL_STUB is Valid for Engineering Proof

A local stub that faithfully implements the same HTTP API surface as the real chain serves several valid engineering purposes:

1. **Integration contract verification** — the gateway's airdrop call, response parsing, and error handling are proven correct against a spec-compliant stub.
2. **Signature pipeline isolation** — HMAC/webhook verification is independent of chain state; proven separately.
3. **Idempotency validation** — deduplication logic is DB-backed and proven without chain dependency.
4. **Rapid iteration** — no EC2/blockchain latency; deterministic results.

This is standard practice in payment engineering (Stripe itself provides test mode webhooks for this reason).

---

## Why This Is Not Yet Production Mainnet

1. The Apostle Chain is a Node.js stub, not the real Rust/Axum binary with Ed25519 consensus.
2. No operator signing key is configured — ATP is credited by stub fiat, not cryptographically signed transfer.
3. Stub balances are in-memory only — lost on process restart.
4. The real Rust chain runs on EC2 — not yet pointed at from gateway.
5. `X402_MODE=staged` — live settlement path is intentionally disabled.

---

## How Stripe Webhook Maps to ATP Credit

```
Stripe Dashboard (live key)
    ↓ checkout.session.completed event
CF Worker (x402.unykorn.org)
    ↓ arrayBuffer() body relay (HMAC-safe)
CF Named Tunnel → 127.0.0.1:4020
    ↓
Express gateway /v1/stripe/webhook
    ↓ timingSafeEqual HMAC verify
    ↓ UTC age guard (< 5 min)
    ↓ SQLite dedup check
    ↓ extract: agentId, atpWei, label
creditATP()
    ↓ POST http://localhost:7332/v1/airdrop
Apostle stub (LOCAL_STUB)
    ↓ in-memory balance += atpWei
    ↓ log to airdrop-stub.log
    ↓ return { ok: true, apo_balance }
Gateway: "Credited 1 ATP to agent:87724c76"
```

---

## What Still Needs to Happen Before Live Deployment

See `X402_PRODUCTION_CUTOVER_CHECKLIST.md` for the full list. In summary:

1. Deploy real Rust Apostle Chain binary to EC2
2. Configure `X402_OPERATOR_PRIVATE_KEY` securely
3. Set `X402_MODE=live`
4. Verify Ed25519-signed ATP transfer completes with real ledger finality
5. Update `APOSTLE_CHAIN_TYPE` from `LOCAL_STUB` to `AWS_RUST_CHAIN_STAGING`
6. Update truth labels accordingly
