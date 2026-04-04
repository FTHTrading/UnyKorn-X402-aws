# How to Add Paid Access to an API in Minutes

**Published:** 2026-04-04  
**Track:** Provider Monetization  
**Author:** FTH Trading / UnyKorn x402 Team

---

The hardest part of monetizing an API is usually not the pricing model. It's the plumbing — payment processing, account management, billing tables, invoice generation, fraud detection, support for the customer who forgot their API key.

x402 removes the plumbing. Here's how to go from an open API to a fully monetized, AI-agent-compatible service.

---

## What You Need Before You Start

1. A running API endpoint (anything — FastAPI, Express, Flask, aiohttp, raw Rust, doesn't matter)
2. A funded Apostle Chain agent identity (your "payment destination")
3. The x402 facilitator SDK

That's it. No payment processor account. No database schema changes. No webhook configuration.

---

## Step 1: Get Your Agent Identity

Your service needs a registered identity on Apostle Chain to receive payments.

```bash
curl -X POST https://apostle.unykorn.org/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "label": "my-inference-api",
    "tier": "execution",
    "tags": ["provider", "inference", "api"]
  }'
```

Response:

```json
{
  "agent_id": "agent:3a11f204-5e87-4c12-a9b4-...",
  "public_key": "ed25519:...",
  "private_key_hex": "...",
  "apo_balance": "0"
}
```

Store the `private_key_hex` securely in your environment. This is the keypair that receives ATP when agents pay your service.

---

## Step 2: Install the Facilitator SDK

```bash
pip install x402-facilitator
# or
npm install @unykorn/x402-facilitator
```

---

## Step 3: Add the 402 Challenge Middleware

The core pattern is: if no payment proof is present in the request headers, return a `402 Payment Required` response containing the challenge. If proof is present, verify it, then proceed.

**Python (FastAPI example):**

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from x402_facilitator import FacilitatorSDK, VerificationResult

app = FastAPI()
facilitator = FacilitatorSDK(
    chain_url="https://apostle.unykorn.org",
    agent_id="agent:3a11f204-...",
    private_key_hex=os.environ["AGENT_PRIVATE_KEY"]
)

PRICE_TABLE = {
    "/v1/inference": 5_000_000_000_000_000,   # 0.005 ATP
    "/v1/search": 1_000_000_000_000_000,       # 0.001 ATP
    "/v1/embed": 500_000_000_000_000,          # 0.0005 ATP
}

@app.middleware("http")
async def require_payment(request: Request, call_next):
    if request.url.path not in PRICE_TABLE:
        return await call_next(request)
    
    proof = request.headers.get("X-Payment-Proof")
    if not proof:
        price = PRICE_TABLE[request.url.path]
        challenge = await facilitator.create_challenge(
            service_uri=f"x402://{request.headers['host']}{request.url.path}",
            asset="ATP",
            amount=str(price)
        )
        return JSONResponse(status_code=402, content={"challenge": challenge})
    
    result: VerificationResult = await facilitator.verify_proof(proof)
    if not result.ok:
        return JSONResponse(status_code=402, content={"error": result.reason})
    
    request.state.payer = result.agent_id
    return await call_next(request)
```

**Node.js / Express example:**

```javascript
const { FacilitatorSDK } = require('@unykorn/x402-facilitator');

const facilitator = new FacilitatorSDK({
  chainUrl: 'https://apostle.unykorn.org',
  agentId: 'agent:3a11f204-...',
  privateKeyHex: process.env.AGENT_PRIVATE_KEY
});

const PRICES = {
  '/v1/inference': '5000000000000000',
  '/v1/search': '1000000000000000',
};

app.use(async (req, res, next) => {
  if (!PRICES[req.path]) return next();
  
  const proof = req.headers['x-payment-proof'];
  if (!proof) {
    const challenge = await facilitator.createChallenge({
      serviceUri: `x402://${req.hostname}${req.path}`,
      asset: 'ATP',
      amount: PRICES[req.path]
    });
    return res.status(402).json({ challenge });
  }
  
  const result = await facilitator.verifyProof(proof);
  if (!result.ok) return res.status(402).json({ error: result.reason });
  
  req.payerAgent = result.agentId;
  next();
});
```

---

## Step 4: Test with the x402 CLI

```bash
x402 request https://your-api.example.com/v1/inference \
  --agent-key ~/.x402/agent.key \
  --payload '{"prompt": "hello"}' \
  --asset ATP \
  --max-spend 10000000000000000
```

Output:
```
> Challenge received: 5000000000000000 ATP
> Signing payment proof...
> Payment proof submitted
> Response (200): {"result": "Hello! How can I help you?"}
> Receipt: tx:a4c8e2f1b3d7... settled in 43ms
```

---

## Step 5: View Your Payments

Your agent's balance updates on every settled transaction:

```bash
curl https://apostle.unykorn.org/v1/agent/3a11f204-.../balance
```

```json
{
  "agent_id": "agent:3a11f204-...",
  "label": "my-inference-api",
  "balances": {
    "ATP": "157000000000000000"
  }
}
```

That's 0.157 ATP from 31 verified requests at 0.005 ATP each.

---

## What You Just Got

By adding ~20 lines of middleware:

- **Revenue** — every request from an x402-capable agent is a settled payment
- **Identity** — you know exactly which agent made each request
- **Evidence** — every payment is a cryptographic receipt on Apostle Chain
- **Security** — no API keys to manage, rotate, or leak
- **Compatibility** — your API still works for non-x402 clients (they just get a 402 response instead of a 200; handle it the same as authentication failure)

---

## What Happens to Non-Paying Clients

Non-x402 clients receive a `402 Payment Required` response with the challenge JSON. This is by design — it's the standard HTTP 402 status code, which has been reserved for this use since RFC 2616.

If you want to support both paid and unpaid access (e.g., a free tier for lower-cost endpoints), the middleware can be conditional:

```python
FREE_ENDPOINTS = {"/v1/health", "/v1/status"}

@app.middleware("http")
async def require_payment(request, call_next):
    if request.url.path in FREE_ENDPOINTS:
        return await call_next(request)
    # ... rest of x402 check
```

---

## The Economics

At 0.005 ATP per request, with ATP priced at $1.00:
- 1,000 daily requests = $5/day = $150/month
- 10,000 daily requests = $50/day = $1,500/month
- 100,000 daily requests = $500/day = $15,000/month

You set the price. You control the pricing logic. Revenue flows directly to your on-chain agent identity — no platform margin, no processing fee, no invoice lag.

The effort to get there: under 30 minutes from zero to live monetized API.

---

*The x402 facilitator SDK documentation is available at [x402api.unykorn.org/docs].*
