# How to Monetize Premium APIs Without Rebuilding Your Backend

**Published:** 2026-04-04  
**Track:** Technical Authority  
**Author:** FTH Trading / UnyKorn x402 Team

---

The x402 integration pattern is designed to be additive, not replacement. Your existing API stays intact. Your authentication and authorization logic, if any, continues to function. x402 adds an economic enforcement layer that lives in middleware — it doesn't touch your business logic.

This post is a practical implementation guide for API providers who want to add paid access without rearchitecting.

---

## The Two-Layer Pattern

Think of x402 integration as adding a checkpoint in front of your existing endpoints:

```
Client → [x402 Middleware] → [Your Existing Handler]
                ↕
        Apostle Chain (verification)
```

If the checkpoint passes (payment verified), the request reaches your handler exactly as before. If it doesn't pass (no proof or invalid proof), the checkpoint returns 402. Your handler is never invoked.

This means:
- Your existing handler code doesn't change
- Your existing database and business logic are unaffected
- Existing authenticated clients can continue using other access methods (if you want hybrid access)
- x402 middleware can be toggled on/off per endpoint or globally

---

## Framework Integration Patterns

### FastAPI

```python
from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
from x402_facilitator import FacilitatorSDK

app = FastAPI()
sdk = FacilitatorSDK(
    chain_url="https://apostle.unykorn.org",
    agent_id=os.environ["SERVICE_AGENT_ID"],
    private_key_hex=os.environ["SERVICE_AGENT_KEY"]
)

# Reusable dependency
async def require_payment(request: Request, price: int = 5_000_000_000_000_000):
    proof = request.headers.get("X-Payment-Proof")
    if not proof:
        challenge = await sdk.create_challenge(
            service_uri=f"x402://{request.url.netloc}{request.url.path}",
            asset="ATP",
            amount=str(price)
        )
        raise HTTPException(status_code=402, detail={"challenge": challenge})
    
    result = await sdk.verify_proof(proof)
    if not result.ok:
        raise HTTPException(status_code=402, detail={"error": result.reason})
    
    return result.agent_id

# Apply to existing endpoint with Depends — zero change to handler body
@app.post("/v1/inference")
async def inference(body: InferenceRequest, payer: str = Depends(require_payment)):
    # Your existing inference logic, completely unchanged
    return await run_inference(body)
```

### aiohttp

```python
from aiohttp import web
from x402_facilitator import FacilitatorSDK

sdk = FacilitatorSDK(...)

@web.middleware
async def x402_middleware(request, handler):
    priced_routes = {"/v1/embed": 1_000_000_000_000_000}
    
    if request.path not in priced_routes:
        return await handler(request)
    
    proof = request.headers.get("X-Payment-Proof")
    if not proof:
        challenge = await sdk.create_challenge(
            service_uri=f"x402://{request.host}{request.path}",
            asset="ATP",
            amount=str(priced_routes[request.path])
        )
        return web.json_response({"challenge": challenge}, status=402)
    
    result = await sdk.verify_proof(proof)
    if not result.ok:
        return web.json_response({"error": result.reason}, status=402)
    
    request["payer_agent"] = result.agent_id
    return await handler(request)

app = web.Application(middlewares=[x402_middleware])
```

### Express.js

```javascript
const express = require('express');
const { FacilitatorSDK } = require('@unykorn/x402-facilitator');

const sdk = new FacilitatorSDK({
  chainUrl: 'https://apostle.unykorn.org',
  agentId: process.env.SERVICE_AGENT_ID,
  privateKeyHex: process.env.SERVICE_AGENT_KEY
});

function x402Middleware(priceAtp) {
  return async (req, res, next) => {
    const proof = req.headers['x-payment-proof'];
    if (!proof) {
      const challenge = await sdk.createChallenge({
        serviceUri: `x402://${req.hostname}${req.path}`,
        asset: 'ATP',
        amount: priceAtp
      });
      return res.status(402).json({ challenge });
    }
    
    const result = await sdk.verifyProof(proof);
    if (!result.ok) return res.status(402).json({ error: result.reason });
    
    req.payerAgent = result.agentId;
    next();
  };
}

// Drop it on any existing route
router.post(
  '/v1/search',
  x402Middleware('2000000000000000'),  // 0.002 ATP
  searchHandler  // Your existing handler, unchanged
);
```

### Rust / Axum

```rust
use axum::{
    middleware::{self, Next},
    extract::{Request, State},
    response::Response,
};
use x402_facilitator::{FacilitatorSdk, ChallengeParams};

async fn x402_layer(
    State(sdk): State<Arc<FacilitatorSdk>>,
    req: Request,
    next: Next,
) -> Response {
    let proof = req.headers().get("x-payment-proof");
    
    if proof.is_none() {
        let challenge = sdk.create_challenge(ChallengeParams {
            service_uri: format!("x402://{}{}", req.headers()["host"].to_str().unwrap(), req.uri().path()),
            asset: "ATP".into(),
            amount: "5000000000000000".into(),
        }).await.unwrap();
        
        return (axum::http::StatusCode::PAYMENT_REQUIRED,
            axum::Json(serde_json::json!({"challenge": challenge}))).into_response();
    }
    
    let result = sdk.verify_proof(proof.unwrap().to_str().unwrap()).await.unwrap();
    if !result.ok {
        return (axum::http::StatusCode::PAYMENT_REQUIRED,
            axum::Json(serde_json::json!({"error": result.reason}))).into_response();
    }
    
    next.run(req).await
}

// Apply to existing router
let app = Router::new()
    .route("/v1/inference", post(inference_handler))
    .layer(middleware::from_fn_with_state(sdk.clone(), x402_layer));
```

---

## Proof Verification Under the Hood

The `verify_proof()` call does three things:

1. **Decodes the proof JWT** — extracts `agent_id`, `tx_hash`, `amount`, `service_uri`, `timestamp`
2. **Verifies the signature** — checks the Ed25519 signature against the agent's public key on Apostle Chain
3. **Confirms settlement** — queries `GET /v1/receipts?tx={tx_hash}` to confirm the transaction settled

Fast-path verification (< 50ms) completes steps 1-2 locally using a cached copy of the agent's public key. Full chain verification adds step 3 via the receipt API.

For latency-sensitive endpoints, use fast-path and accept receipts for accounting. For high-value endpoints (> 0.1 ATP), use full verification.

```python
result = await sdk.verify_proof(proof, mode="fast")   # < 50ms
result = await sdk.verify_proof(proof, mode="full")   # 50-200ms, chain-confirmed
```

---

## Handling the HTTP 402 Client Side

For non-x402 clients hitting your endpoint, they'll receive a `402 Payment Required` response with a challenge body. This is distinct from `401 Unauthorized` and `403 Forbidden` — it means "this content costs something."

Your existing API documentation should note that x402 endpoints require payment proof in the `X-Payment-Proof` header. Non-paying clients aren't getting an error — they're getting accurate information about the endpoint's access model.

The HTTP 402 status code was specifically reserved by the IETF for "reserved for future use" — and the x402 protocol is that future use.

---

## What You Don't Need to Build

After this integration, you don't need:

- Payment processor integration (Stripe, Braintree, etc.) for machine clients
- API key issuance and rotation workflows
- Billing database tables and invoice generation
- Rate limiting per-customer logic (economic enforcement handles it)
- Fraud detection for over-use (overpay just means more revenue)
- Account management UI for AI agent consumers

The protocol handles commerce. Your backend handles capability. That's the correct separation.

---

*Source code for the x402 facilitator SDK is available at [github.com/unykorn/x402-facilitator]. Enterprise support: [x402api.unykorn.org/enterprise].*
