# x402 Email Sequences

## Overview

Two sequences:
- **Sequence A — Developer / API Provider onboarding** (5 emails, 10-day cadence)
- **Sequence B — Enterprise buyer trust-building** (4 emails, 7-day cadence)

Send from: `team@unykorn.org` or `kevan@unykorn.org`
Reply-to: `kevan@unykorn.org`

---

## Sequence A — Developer / API Provider

### Email A1 — Day 0 (Welcome / Hook)

**Subject:** Your API could be charging per request right now

Hi [First Name],

I want to show you something that took us about 20 lines of code.

We added paid access to an API endpoint — not with API keys, not with Stripe subscriptions, not with a billing portal. With a middleware that challenges each request for payment proof, verifies it against a chain in under 50ms, and proceeds.

The consumer pays from its own funded wallet. You receive the payment directly. Every transaction produces a cryptographic receipt stored on-chain.

We call it x402 — named for the HTTP status code that was "reserved for future use" since 1996. This is that future use.

Here's what I'd like you to see: [twin.unykorn.org](https://twin.unykorn.org)

That's a live visualization of 35 AI agents making real ATP-denominated transactions against x402-enabled endpoints, right now. The receipt feed in the bottom panel is live.

If you're building APIs that AI agents will call — inference endpoints, data feeds, retrieval services, specialized models — you should know this exists.

More next week.

— Kevan Burns  
FTH Trading / UnyKorn

---

### Email A2 — Day 3 (Problem framing)

**Subject:** API keys were never designed for this

Hi [First Name],

API keys solve a human problem: authenticate a developer who's building a product that will have users.

AI agents aren't that. They make thousands of requests autonomously. They have wallets, not billing departments. They don't submit ticket requests for key rotation. They just run.

The API key model breaks down in four ways for agent consumers:

1. **Key sharing** – agents on the same team share keys, destroying attribution
2. **No economic signal** – a key either works or doesn't; there's no price signal per request
3. **Coarse visibility** – you see "1,000 requests today from key abc123", not who did what
4. **No evidence** – when the AI takes an action that causes harm, there's no receipt chain

x402 replaces the key with an economic proof. Each request arrives with a signed ATP payment. You verify it. You serve it. The chain records it.

We wrote a more detailed breakdown here: [link to blog post #2]

What's the API you'd want to monetize first?

— Kevan

---

### Email A3 — Day 6 (Technical proof)

**Subject:** Here's the actual middleware (FastAPI, Express, aiohttp, Axum)

Hi [First Name],

I'll keep this short because the code speaks for itself.

Here's the FastAPI version:

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

Drop that on any existing endpoint. Existing clients who don't pay get a `402 Payment Required` response with a challenge. x402-capable agent clients pay and get through.

Your business logic doesn't change. Your database doesn't change. Your auth stack doesn't change.

Node, Rust, and raw HTTP examples are here: [link to blog post #8]

If you want to schedule a 30-minute integration walkthrough, reply to this email.

— Kevan

---

### Email A4 — Day 8 (Social proof + numbers)

**Subject:** 35 agents, 3,200+ transactions, $0 in platform fees

Hi [First Name],

Quick numbers from the live UnyKorn ecosystem on Apostle Chain today:

- **35 agents** actively trading
- **3,200+ settled transactions** since deployment
- **2.86M ATP** currently in circulation across agent accounts
- **< 50ms** average settlement time
- **$0** platform fee on any of those transactions

Every one of those transactions was a payment proof verified by the chain. Every one produced a receipt. No billing portal. No invoice. No late payment. No platform taking a margin.

This is what agent-native commerce looks like in production.

The live visualization is at [twin.unykorn.org](https://twin.unykorn.org) — reload it and watch the receipt feed.

If you've got a service you'd like to monetize via x402, I'd like to talk. Reply here or book a slot: [calendly link]

— Kevan

---

### Email A5 — Day 10 (CTA / Close)

**Subject:** Last email — two options

Hi [First Name],

I'll be brief.

Option 1: You're ready to integrate. The facilitator SDK docs are at [x402api.unykorn.org/docs]. If you want hands-on support for your first deployment, reply to this email.

Option 2: You want to watch before building. That's fine. Follow the UnyKorn repo on GitHub [link] and the x402 spec updates. When the moment is right, we'll be here.

Either way — the machine web is coming. Request-level commerce is how it will pay for itself.

Thanks for reading these.

— Kevan Burns  
Founder, FTH Trading  
[linkedin.com/in/kevanburns] | [x.com/kevanburns]

---

---

## Sequence B — Enterprise Buyer

### Email B1 — Day 0 (Executive hook)

**Subject:** How do you audit what an AI agent spent money on?

Hi [First Name],

Your organization is deploying AI agents. Some of them will call external APIs. Some of those APIs will charge per request.

When your auditor asks "what did the AI spend, on what service, when, and why" — what do you hand them?

Most teams will hand them a vendor invoice and a log file. Neither is verifiable. Neither proves what the agent actually received in exchange for payment. Neither survives legal discovery intact.

x402 on Apostle Chain produces a different answer: a cryptographic receipt for every transaction, stored on-chain, signed by both parties, exportable as a tamper-evident evidence bundle.

I'd like to show you what that looks like in practice. Reply here and I'll set up 30 minutes.

— Kevan Burns  
FTH Trading

---

### Email B2 — Day 7 (Budget control)

**Subject:** Finance approved the AI spend policy. The AI didn't get the memo.

Hi [First Name],

The AI governance problem that keeps compliance teams up at night isn't the risk of AI making bad decisions. It's the risk of AI spending money outside its authorized scope — and nobody noticing until month-end.

x402 on Apostle Chain enforces budget periods at the transaction level. An agent's spend ceiling is set on-chain. When the ceiling is reached, transactions are rejected before they settle. Not flagged. Rejected.

The enforcement event is itself logged as a chain event — creating a record that the control worked, not just that it was configured.

This is what IT procurement calls "pre-authorization enforcement" rather than "post-hoc review." The difference matters if you're SOX-scoped or operating under a digital asset policy.

I wrote a more detailed breakdown here: [link to blog post #4]

Happy to walk through the budget period mechanics on a call. Reply here.

— Kevan

---

### Email B3 — Day 14 (Evidence bundle)

**Subject:** Can you produce this for your auditor?

Hi [First Name],

When an AI agent's activity needs to be reviewed — for internal audit, external compliance, or legal discovery — the evidence package needs to meet a standard that log files don't.

What an evidence bundle from Apostle Chain contains:

- Complete receipt array for the specified agent and period (no gaps, no sampling)
- Merkle root over all receipt hashes (proves the bundle is complete)
- Chain signature over the Merkle root (proves the bundle was produced at a specific block height)
- Agent registry snapshot at query time

This structure lets auditors verify completeness without re-reading the entire chain. The chain signature proves the bundle is authentic and cannot be produced retroactively.

For financial services, healthcare, and government AI deployments, this is the difference between having an audit story and not having one.

I can generate a sample evidence bundle from our live testnet. Reply and I'll send it over.

— Kevan

---

### Email B4 — Day 21 (Decision email)

**Subject:** Three questions before we close the loop

Hi [First Name],

We've been in your inbox for a few weeks. Before I close out this sequence, three questions:

1. Do you have AI agents deployed or in production planning that will call paid external APIs?
2. Does your compliance posture require cryptographic evidence of AI spending activity?
3. Is there a procurement window in the next quarter where x402 infrastructure could be evaluated?

If the answer to any of these is yes — or "not yet but soon" — I'd like 30 minutes to show you the live system and the evidence bundle format.

If none of these apply yet, no problem. I'll move you to the monthly update list.

Either way, reply to this email and let me know.

— Kevan Burns  
FTH Trading / UnyKorn  
[kevan@unykorn.org]

---
