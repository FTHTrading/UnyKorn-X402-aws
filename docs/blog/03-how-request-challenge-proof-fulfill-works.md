# How Request → Challenge → Proof → Fulfill Works

**Published:** 2026-04-04  
**Track:** Technical Authority  
**Author:** FTH Trading / UnyKorn x402 Team

---

The x402 protocol is four steps. This post walks through each one with enough technical depth to understand what's happening at the wire level — and why the design choices matter.

---

## The four-step cycle

```
1.  Agent        →  Provider:  HTTP request (no payment yet)
2.  Provider     →  Agent:     402 + challenge payload
3.  Agent        →  Chain:     POST /v1/tx (signed TxEnvelope)
4.  Agent        →  Provider:  HTTP request + X-Payment-Proof header
    Provider     →  Agent:     200 OK + receipt
```

This maps directly to the HTTP protocol. The 402 status code ("Payment Required") has been reserved since 1996 and never had a standard implementation. x402 gives it one.

---

## Step 1: The initial request

The agent makes a standard HTTP request to the provider's endpoint:

```
GET /v1/price-feed?asset=BTC&window=1h HTTP/1.1
Host: monitor.unykorn.org
X-Agent-ID: agent:87724c76-da93-4b1a-9fa6-271ba856338e
```

The `X-Agent-ID` header is optional but recommended — it lets providers implement per-agent rate limiting or budget caps separate from payment.

---

## Step 2: The challenge

If the provider requires payment, it returns a 402 with a structured challenge:

```json
{
  "status": 402,
  "challenge": {
    "amount": "2000000000000000000",
    "asset": "ATP",
    "destination": "agent:3f9a1b2c-...",
    "chain_id": 7332,
    "nonce_hint": 141,
    "service_uri": "x402://monitor.unykorn.org/v1/price-feed",
    "expires_at": "2026-04-04T06:45:00Z"
  }
}
```

Key fields:

- **amount**: base units (ATP uses 18 decimals, so `2 × 10^18` = 2.0 ATP)
- **asset**: always a string matching the chain's asset enum ("ATP", "UNY", "USDF")
- **destination**: the receiving agent's on-chain ID
- **chain_id**: 7332 (Apostle Chain always and only)
- **nonce_hint**: the last known nonce for this agent — helps the agent build a valid tx without a round-trip to the chain
- **service_uri**: the `x402://` URI that gets embedded in the transaction for receipt provenance
- **expires_at**: the challenge window (typically 30s)

---

## Step 3: The payment transaction

The agent constructs a `TxEnvelope` and POST it to `/v1/tx` on Apostle Chain:

```json
{
  "hash": "a1b2c3d4e5f6...",
  "from": "87724c76-da93-4b1a-9fa6-271ba856338e",
  "nonce": 141,
  "chain_id": 7332,
  "payload": {
    "type": "transfer",
    "to": "3f9a1b2c-...",
    "asset": "ATP",
    "amount": "2000000000000000000"
  },
  "signature": "a3f4...",
  "timestamp": "2026-04-04T06:44:52.431Z"
}
```

Critical implementation notes:

- `amount` is a **string** in JSON — not a number. JavaScript's `Number` type cannot represent 18-decimal ATP values precisely; the chain rejects numeric representations.
- `hash` is 64-character hex **without** a `0x` prefix.
- `signature` is 128-character Ed25519 hex covering `hash + payload + nonce + chain_id + timestamp`.
- `from` is a bare UUID — not the `agent:UUID` display format.

The chain's fast-path settlement processes this in <50ms. The response is:

```json
{
  "ok": true,
  "tx_hash": "a1b2c3d4e5f6...",
  "height": 2786
}
```

---

## Step 4: Proof + fulfillment

The agent retries its original request with the payment proof:

```
GET /v1/price-feed?asset=BTC&window=1h HTTP/1.1
Host: monitor.unykorn.org
X-Payment-Proof: {"tx_hash":"a1b2c3d4e5f6...","chain_id":7332}
X-Agent-ID: agent:87724c76-...
```

The provider verifies the tx_hash against the chain — either by querying `/v1/receipts` or by using the facilitator SDK's `verify_proof()` helper — and fulfills the request:

```
HTTP/1.1 200 OK
X-Receipt-Hash: d4e5f6a1b2c3...
X-Settled-At: 2026-04-04T06:44:53.012Z
Content-Type: application/json
```

The `X-Receipt-Hash` header is the settlement receipt ID. Providers should log it; agents should forward it to their audit trail or evidence bundle.

---

## What the chain does with the transaction

The Apostle Chain's `/v1/tx` handler does two things simultaneously:

1. **Mempool insert**: the transaction enters the mempool for the next block proposal (50ms tick, only fires on non-empty mempool)
2. **Fast-path settlement**: the ledger debit/credit is applied immediately, before block confirmation

This means the proof is valid before the block is finalized. Providers don't need to wait for block confirmation to fulfill — they verify the fast-path settlement record. Block inclusion provides the durable, immutable record for audit.

---

## Error cases

| Condition | Response |
|---|---|
| Challenge expired | 402 with a fresh challenge |
| Insufficient balance | Chain returns `{"ok":false,"error":"insufficient balance"}` |
| Wrong chain_id | Chain rejects with `{"ok":false,"error":"wrong chain"}` |
| Stale nonce | Chain rejects with `{"ok":false,"error":"invalid nonce"}` |
| Proof already used | Provider detects duplicate receipt and returns 409 |

Agents should implement exponential backoff on 402 (challenge refresh) and treat settlement failures as budget signals — not errors to silence.

---

*Full TxEnvelope schema and facilitator SDK reference: [x402api.unykorn.org/docs](https://x402api.unykorn.org)*
