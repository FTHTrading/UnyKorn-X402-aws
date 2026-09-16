# Launch: Genesis Risk Snapshot (`/risk`) — first external settlement plan

FORGE-CLASS: entity=UnyKorn LLC sec=HIGH claims=MARKETING custody=NONE hearth=TOUCHES chain=READ surface=PUBLIC

Date: 2026-09-16. Rail commit `2fcb01f` (FTHTrading/UnyKorn-X402-aws). Served and verified at https://twin.unykorn.org.

## What is live (verified against the served response, not the repo)

| Surface | Check | Result |
|---|---|---|
| `GET https://twin.unykorn.org/risk` | 402 challenge, 5 lanes in `accepts`, resource doc with tags | REAL |
| `POST /risk` with a malformed address | 400 `invalid_address`, "nothing was charged", before any payment is read | REAL |
| `GET /receipts` | stats with `external_receipts` / `internal_receipts` split, sanitized rows | REAL |
| `GET /.well-known/x402` | `services[0].name = risk`, `launch_sku` block, price 0.25 | REAL |
| Agent402 index | listed, routable, health 1, 5 networks (tool count re-probed hourly) | REAL |
| Coinbase Bazaar | not listed; indexes after settled calls through the CDP facilitator | ABSENT |
| Adversarial suite | 81/81 on a scratch instance | REAL |
| External settled calls | 0. The 3 journaled calls are internal (Scout wallet), labelled so | HONEST ZERO |

## The product

- Buyer input: `{ "params": { "address": "0x…", "chain": "base" | "polygon" } }`
- Output: `verdict` (listed / high_risk / medium_risk / low_risk / not_scored), `score`, `signals[]` each naming its dataset and severity, `sources[]` with the exact fetch URL and status, `subject` (kind, token economics, activity sample), `evidence_hash` (sha256 over the canonical signal set), `labels.limitations` carried in-band.
- Sources at request time: Blockscout (address, contract, token, top holders, tx and token-transfer samples) and blockchainfraud.org registry (OFAC SDN digital-currency entries, community scam blocklists, case registry).
- Price: 0.25 USDC on Base, Polygon or Solana through the CDP facilitator; pay-first on XRPL and Stellar. Env `PRICE_RISK_USD` overrides.
- Every paid call writes a receipt with `payer`, `internal` (operator wallet or not), `result_sha256`, `request_class`, and appears at `/receipts` within the same second.

## Buyer promise (approved copy)

"Pay once; receive a reproducible, timestamped risk snapshot with an evidence hash and a public receipt."

Forbidden in any copy about this product: guaranteed, detects all fraud, KYC decision, compliance, verified true, advice. The limitations block in the response is the canonical wording.

## The four proofs, in order

1. **Gateway genuinely LIVE** — the rail already is (`/risk` returns a real 402 with mainnet lanes). genesis402.com still says DRY_RUN until the deploy pipeline runs with repo secrets (Kevan: `push-deploy-secrets.mjs`, then `gh workflow run deploy-gateway -f mode=live`).
2. **Independent payer completes a paid request** — a wallet not in `INTERNAL_WALLETS`. The rail labels it `external` automatically; nothing to configure.
3. **Settlement observable** — reconcile `/receipts` row (receipt_id, payer, tx_hash, amount, rail, at, result_sha256) against the explorer link the feed gives per rail and the buyer's saved response (recompute `result_sha256` over the canonical JSON).
4. **Result valuable enough to repeat** — the snapshot is a pre-trade decision input; the retention triggers are in "Repeat usage" below.

## External-beta plan (5 testers, 7 days, budget ≤ 100 USDC)

Recruiting and messaging are Kevan-side: outbound email to individuals is PERMANENTLY DISABLED for this desk and nothing goes out in Kevan's name from a session. The kit below is copy-ready for him.

Tester roles, one unique task each:

| # | Role | Task | Input class |
|---|---|---|---|
| 1 | Agent builder with a Base wallet | Pay via x402 client (`@x402/fetch` or `x402-fetch`) | wallet (EOA) |
| 2 | Trading-bot operator | Token screen before a swap | ERC-20 on Base |
| 3 | Security researcher | Contract review, proxy + verification signals | contract on Polygon |
| 4 | Wallet developer | MCP/agent integration, three calls, latency log | mixed |
| 5 | Community operator (no treasury relationship) | Counterparty due diligence on a known scam address from the registry | listed address |

Each tester submits: request_id, receipt_id, payer address, tx hash, `evidence_hash`, response latency, and one sentence on whether the result was decision-useful. Anti-sybil: one wallet per tester, wallet must not appear in `INTERNAL_WALLETS`, each tester's scenario is distinct, duplicate inputs are refused for scoring. Reward: feedback and reproducible bug reports, never payment volume (no transaction-based compensation, standing rule).

Reconciliation table (fill from `/receipts` + explorer + tester submission):

| receipt_id | at | payer | rail | tx_hash | amount | result_sha256 (rail) | evidence_hash (tester) | explorer confirms | decision-useful |
|---|---|---|---|---|---|---|---|---|---|

## Outreach message (for Kevan to send from his own accounts)

"I run a pay-per-call blockchain risk endpoint on x402 (Base USDC, 0.25 per call, no account, no API key). It returns a machine-readable wallet/token/contract risk snapshot with an evidence hash and a public receipt. I'm validating independent live settlement, not selling anything: would you make one paid call from a wallet you control and send me the request_id plus one line of feedback? Terms and example: https://twin.unykorn.org/.well-known/x402 — endpoint: https://twin.unykorn.org/risk. Integration is one line with any x402 client: POST the address, pay the 402, read the JSON. Not investment or security advice."

## Integration one-liner for agents

```
npx -y @x402/fetch  # or any x402 v2 client with a Base USDC wallet
POST https://twin.unykorn.org/risk  body {"params":{"address":"0x…","chain":"base"}}
-> 402 with accepts[] -> sign EIP-3009 for 250000 atomic USDC -> resend with X-PAYMENT -> 200 JSON + receipt
```

## Repeat usage (three genuinely different outputs, not feature gating)

| Tier | Input | Output | Trigger | Price |
|---|---|---|---|---|
| Snapshot (live now) | one address | verdict + signals + evidence hash | pre-trade screen, counterparty check | 0.25 |
| Diff (next) | one address + prior `evidence_hash` | what changed since (new listing, new proxy upgrade, concentration shift) | post-transaction monitoring, alert verification | 0.10 |
| Batch (next) | up to 20 addresses | one artifact, one hash, per-address verdicts | periodic exposure review | 1.00 |

Both "next" tiers are ABSENT today. They are listed so the retention loop is designed before the first buyer, not after.

## Discovery, after the first external call

- Re-register Agent402 (`POST https://agent402.tools/api/index/register {origin}`) so its probe picks up the new tool count.
- Bazaar: indexes automatically after settled calls carrying the bazaar extension (the `/risk` challenge already carries the worked example and JSON schema).
- x402scan / x402all: browser-form submissions, Kevan-side.
- Track discovery and settlement as separate columns. Listing is distribution; an external receipt is demand.

## What is deliberately not done yet

More paid tools, dashboards that mirror the chain, Stripe as an x402 proxy, SEO. Multi-lane support already exists and is left as-is; it costs nothing to advertise and the buyer chooses.
