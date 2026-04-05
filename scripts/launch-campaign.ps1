# Launch Campaign — x402 + FTH EDU
# Opens all posting interfaces with content pre-staged in your clipboard
# Run from PowerShell: .\scripts\launch-campaign.ps1

param(
    [ValidateSet("all","twitter","linkedin","hn","reddit","producthunt","devto","discord")]
    [string]$Target = "all"
)

function Set-Clipboard-And-Open {
    param([string]$Content, [string]$Url, [string]$Label)
    $Content | Set-Clipboard
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host " $Label" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " >> Copied to clipboard. Paste and post." -ForegroundColor Green
    Write-Host " >> Opening: $Url" -ForegroundColor Gray
    Write-Host ""
    Write-Host $Content -ForegroundColor White
    Write-Host ""
    Start-Sleep -Milliseconds 800
    Start-Process $Url
    Write-Host "Press ENTER when posted (or S to skip)..." -ForegroundColor DarkYellow
    $key = Read-Host
    if ($key -eq "s" -or $key -eq "S") {
        Write-Host "  Skipped." -ForegroundColor DarkGray
    }
}

# ─────────────────────────────────────────────
#  TWITTER / X
# ─────────────────────────────────────────────

$tweet1 = @"
HTTP 402 Payment Required has been in the spec since 1996.

"Reserved for future use."

The future is AI agents making request-level payments to other AI systems.

Here's how x402 on Apostle Chain works, and why we built it:

🧵1/8
"@

$tweet2 = @"
2/ The problem with API keys for AI agents:

- Keys are shared across agents (no attribution)
- No economic signal per request
- No proof of what was received
- No cryptographic receipt chain

When AI agents are autonomous, you need economic enforcement, not key management.
"@

$tweet3 = @"
3/ x402 replaces the key with a payment proof.

Agent calls your endpoint →
Gets a 402 challenge back →
Pays ATP from its sovereign wallet →
You verify in <50ms →
Settlement hits the chain →
Receipt recorded forever.

Both parties walk away with cryptographic evidence.
"@

$tweet4 = @"
4/ The middleware (FastAPI):

@app.middleware("http")
async def require_payment(request, call_next):
    proof = request.headers.get("X-Payment-Proof")
    if not proof:
        return JSONResponse(402, {"challenge": await sdk.create_challenge(...)})
    result = await sdk.verify_proof(proof)
    if not result.ok:
        return JSONResponse(402, {"error": result.reason})
    return await call_next(request)

Your existing endpoint, now billable per request.
"@

$tweet5 = @"
5/ Live right now on Apostle Chain:

20 agents actively trading
3,200+ settled transactions
2.86M ATP in circulation
<50ms average settlement
$0 platform fee

Watch receipts settle in real time → twin.unykorn.org
"@

$tweet6 = @"
6/ For enterprise:

Every transaction = cryptographic receipt.
Evidence bundles have a Merkle root + chain signature.
Auditors verify completeness without re-reading the chain.
Budget periods enforce spend ceilings — rejected, not flagged.

This is pre-authorization enforcement, not post-hoc review.
"@

$tweet7 = @"
7/ For API providers:

- No billing portal redesign
- Per-route pricing
- No platform margin
- White-label rails
- Receipts go to your customers directly

Your existing stack. New revenue model.
"@

$tweet8 = @"
8/ We're onboarding the first wave of API providers.

If you're building inference endpoints, data feeds, retrieval services, or specialized models that AI agents will call —

Reply or DM. I'll personally walk you through the integration.

Docs: x402api.unykorn.org
Live: twin.unykorn.org
"@

$tweet_standalone_a = @"
HTTP 402 has been "reserved for future use" since 1996.

30 years later: AI agents paying each other per request, on-chain receipts, cryptographic proof of settlement.

twin.unykorn.org — live right now.
"@

$tweet_standalone_b = @"
"How do you audit what an AI agent spent money on?"

If your answer is "vendor invoice + log file" — that doesn't survive legal discovery.

x402 on Apostle Chain: cryptographic receipt per transaction, Merkle-rooted evidence bundles, chain-signed.

Built for the audit question compliance teams will ask this year.
"@

# ─────────────────────────────────────────────
#  LINKEDIN
# ─────────────────────────────────────────────

$linkedin1 = @"
I want to tell you about a line of code that's been in the HTTP spec since 1996.

Status code 402: Payment Required.

The spec says: "Reserved for future use."

We just shipped that future.

---

The problem: AI agents are making millions of API calls autonomously. They don't file expense reports. They don't rotate API keys. They have wallets.

The entire API economy was built assuming the consumer is a human developer managing billing. That assumption is wrong for AI agents.

---

x402 on Apostle Chain replaces the key with a payment proof.

The agent hits your endpoint.
Gets a 402 challenge back.
Pays from its sovereign wallet.
You verify the proof in under 50ms.
The chain records the receipt.

Both parties walk away with cryptographic evidence of every transaction.

---

For API providers:
→ Per-request pricing (not subscriptions)
→ Automatic payment from agent budgets
→ Receipt chain for audit and compliance
→ No platform margin
→ White-label deployment

I'm personally onboarding the first wave of providers this month.

If you're building inference endpoints, data feeds, retrieval services, or specialized models that AI agents will call — reply here.

Live ecosystem: twin.unykorn.org
Docs: x402api.unykorn.org
"@

$linkedin2 = @"
A question for enterprise technology leaders:

Your organization deploys AI agents. Those agents call paid external APIs. Some will charge per request.

When your auditor asks "what did the AI spend, on what service, when, and what was received in exchange" —

What do you hand them?

---

If the answer is "a vendor invoice and a log file" — I'd like to show you a better answer.

x402 on Apostle Chain produces a cryptographic receipt for every transaction:

- Service URI (exactly what was requested)
- Amount and asset denomination
- Ed25519 signature from both parties
- Block height and timestamp
- Validator signature

Evidence bundles export with a Merkle root + chain signature. Auditors verify completeness without re-reading the chain. The signature proves the bundle is authentic and cannot be produced retroactively.

---

For financial services, healthcare, and government AI deployments — the audit question is coming.

Happy to generate a sample evidence bundle from our live testnet. Reply here.
"@

# ─────────────────────────────────────────────
#  HACKER NEWS
# ─────────────────────────────────────────────

$hn_title = "Show HN: Live visualization of 20 AI agents making real payments via HTTP 402"
$hn_url = "https://twin.unykorn.org"
$hn_text = @"
HTTP 402 (Payment Required) has been "reserved for future use" since 1996. We implemented it for AI-to-AI commerce.

Live demo: https://twin.unykorn.org

What you're seeing:
- 20 AI agents with sovereign wallets on Apostle Chain (Rust/Axum, chain_id 7332)
- Agents make real requests to x402-enabled endpoints with a 402 challenge/proof flow
- The agent pays ATP (native token), provider verifies proof in <50ms, receipt written on-chain
- Receipt feed in the bottom panel updates live as transactions settle

Protocol flow: request → 402 challenge → payment proof in X-Payment-Proof header → verify → fulfill → on-chain receipt

For providers: middleware wrapper on existing endpoints, no billing portal, no API key rotation, no platform margin.

Source: https://github.com/FTHTrading/UnyKorn-X402-aws

Happy to discuss the Apostle Chain architecture, TxEnvelope format, or x402 middleware design.
"@

# ─────────────────────────────────────────────
#  REDDIT
# ─────────────────────────────────────────────

$reddit_ml_title = "HTTP 402 for AI-to-AI commerce: request-level payment proof instead of API keys"
$reddit_ml_body = @"
We've been working on a protocol layer for AI agents to pay each other at the request level. Rather than API keys with monthly billing, each request carries a payment proof. The provider verifies against an on-chain settlement layer in under 50ms, then fulfills.

Settlement layer: Apostle Chain (Rust/Axum, chain_id 7332). Payment asset: ATP. Proof: Ed25519-signed TxEnvelope.

The middleware (FastAPI):

```python
@app.middleware("http")
async def require_payment(request, call_next):
    proof = request.headers.get("X-Payment-Proof")
    if not proof:
        challenge = await sdk.create_challenge(service_uri=..., asset="ATP", amount="5000000000000000")
        return JSONResponse(status_code=402, content={"challenge": challenge})
    result = await sdk.verify_proof(proof)
    if not result.ok:
        return JSONResponse(status_code=402, content={"error": result.reason})
    return await call_next(request)
```

Live demo with 20 agents making real transactions: https://twin.unykorn.org

Curious what others are doing for billing when the API consumer is an autonomous agent rather than a developer.
"@

$reddit_webdev_title = "HTTP 402 is finally being used — payment proof per request instead of API keys for AI agents"
$reddit_webdev_body = @"
HTTP 402 Payment Required has been in the spec since 1996, listed as "reserved for future use." We're using it.

The use case: AI agents need to call premium API endpoints autonomously, without human involvement in billing. API keys don't work — shared keys destroy attribution, no economic signal per request, no proof of what was received.

Flow:
1. Agent calls endpoint
2. Endpoint returns 402 + challenge object
3. Agent signs payment proof against its wallet, retries with X-Payment-Proof header
4. Provider verifies proof in <50ms
5. Agent gets the response
6. On-chain receipt written

Your endpoint doesn't change. Just add a middleware wrapper.

Live 20-agent ecosystem: https://twin.unykorn.org
Source: https://github.com/FTHTrading/UnyKorn-X402-aws
"@

$reddit_ai_title = "20 AI agents paying each other in real time — here's what the machine economy looks like today"
$reddit_ai_body = @"
I want to show you something live, not a demo, not a mockup.

https://twin.unykorn.org

20 AI agents making real payments to each other for services. The 3D visualization shows the network graph. The receipt feed at the bottom updates live as transactions settle on-chain.

These agents have sovereign wallets. They make autonomous spending decisions within on-chain budget constraints. No human approves individual payments. No credit card. No billing department.

The API key model was built for human developers. These agents aren't that.

Protocol source: https://github.com/FTHTrading/UnyKorn-X402-aws

Curious how others are thinking about agent-to-agent economic coordination.
"@

$reddit_agents_title = "How are your agents paying for external API access? Here's what we built."
$reddit_agents_body = @"
One of the underrated problems in agent infrastructure: how does an autonomous agent pay for the APIs it needs to call?

The usual answers:
1. API key (shared, no per-agent attribution, no economic enforcement)
2. Pre-authorized credit pool (opaque, hard to audit)
3. Human approval for each spend (defeats the point of autonomy)

We built x402: request-level payment proof using HTTP 402 as the challenge mechanism.

Flow:
- Agent calls endpoint → gets 402 challenge back
- Agent pays from sovereign wallet → retry with proof in header
- Provider verifies proof in <50ms → fulfills request
- Settlement hits chain → on-chain receipt

Budget enforcement: each agent's spend ceiling is set on-chain. When ceiling is reached, transactions are rejected before they settle — not flagged, rejected.

Live 20-agent ecosystem: https://twin.unykorn.org

What patterns are others using for agent billing?
"@

# ─────────────────────────────────────────────
#  PRODUCTHUNT
# ─────────────────────────────────────────────

$ph_tagline = "x402 on Apostle Chain — HTTP 402 Payment Required, finally used"
$ph_description = @"
HTTP 402 Payment Required has been in the HTTP spec since 1996, listed as "reserved for future use." We implemented it for AI-to-AI commerce.

The problem: API keys were built for human developers. AI agents are autonomous — they make thousands of calls without human involvement, share keys (destroying attribution), and have no economic signal per request.

x402 replaces the key with a payment proof. Each request carries a signed ATP payment. Providers verify against Apostle Chain in <50ms. Every transaction produces an on-chain receipt.

For providers:
- Middleware wrapper on existing endpoints (~20 lines, FastAPI/Express/Axum)
- Per-request pricing at the route level
- No platform fee, no marketplace lock-in
- On-chain receipts for audit and compliance

Live demo with 20 agents running in production: https://twin.unykorn.org
Source: https://github.com/FTHTrading/UnyKorn-X402-aws
"@

# ─────────────────────────────────────────────
#  DEV.TO
# ─────────────────────────────────────────────

$devto_tags = "#webdev #api #machinelearning #blockchain"
$devto_note = "Cross-post blog post 01 or 03 from docs/blog/ as the article body."

# ─────────────────────────────────────────────
#  DISCORD
# ─────────────────────────────────────────────

$discord_general = @"
Hey everyone — wanted to share something we've been building.

We implemented HTTP 402 Payment Required for AI agent commerce. Flow: agent calls a premium endpoint → gets a 402 challenge → pays from its wallet → provider verifies in <50ms → receipt written on-chain.

Live demo with 20 agents making real ATP payments: https://twin.unykorn.org — receipt feed updates live.

For devs: it's a middleware wrapper on existing endpoints. No billing portal redesign, no new auth system.

Repo: https://github.com/FTHTrading/UnyKorn-X402-aws

Happy to talk through the design.
"@

$discord_web3 = @"
Built a request-level payment protocol for AI-to-AI commerce on Apostle Chain (Rust, chain_id 7332).

The interesting part: payment proof travels in the HTTP header (X-Payment-Proof), not a separate tx. Provider verifies in <50ms without blocking. Settlement is async, proof is synchronous.

Agentic settlement demo live: https://twin.unykorn.org

Ed25519 signing, TxEnvelope format, amounts as string u128 (JSON precision). AMA.
"@

# ─────────────────────────────────────────────
#  EXECUTION
# ─────────────────────────────────────────────

Write-Host @"
╔══════════════════════════════════════════════════════════╗
║         x402 CAMPAIGN LAUNCH SCRIPT                     ║
║         twin.unykorn.org | FTHTrading/UnyKorn-X402-aws  ║
╚══════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta

Write-Host "This script opens each posting interface and copies content to clipboard." -ForegroundColor Gray
Write-Host "You paste, review, and submit. Press ENTER to advance, S to skip." -ForegroundColor Gray
Write-Host ""

if ($Target -eq "all" -or $Target -eq "twitter") {
    Write-Host "`n>>> TWITTER / X — Thread 1 (8 tweets)" -ForegroundColor Magenta
    Write-Host "Go to twitter.com/compose/tweet and post each in order as a reply thread.`n" -ForegroundColor Gray
    
    Set-Clipboard-And-Open -Content $tweet1 -Url "https://twitter.com/intent/tweet?text=" -Label "Tweet 1/8 — Copy this FIRST, start your thread"
    Set-Clipboard-And-Open -Content $tweet2 -Url "https://twitter.com/compose/tweet" -Label "Tweet 2/8 — Reply to Tweet 1"
    Set-Clipboard-And-Open -Content $tweet3 -Url "https://twitter.com/compose/tweet" -Label "Tweet 3/8 — Reply to Tweet 2"
    Set-Clipboard-And-Open -Content $tweet4 -Url "https://twitter.com/compose/tweet" -Label "Tweet 4/8 — Reply to Tweet 3"
    Set-Clipboard-And-Open -Content $tweet5 -Url "https://twitter.com/compose/tweet" -Label "Tweet 5/8 — Reply to Tweet 4"
    Set-Clipboard-And-Open -Content $tweet6 -Url "https://twitter.com/compose/tweet" -Label "Tweet 6/8 — Reply to Tweet 5"
    Set-Clipboard-And-Open -Content $tweet7 -Url "https://twitter.com/compose/tweet" -Label "Tweet 7/8 — Reply to Tweet 6"
    Set-Clipboard-And-Open -Content $tweet8 -Url "https://twitter.com/compose/tweet" -Label "Tweet 8/8 — Reply to Tweet 7"
    
    Write-Host "`n>>> TWITTER — Standalone posts (post these separately over next 2 days)" -ForegroundColor Magenta
    Set-Clipboard-And-Open -Content $tweet_standalone_a -Url "https://twitter.com/intent/tweet" -Label "Standalone A — short hook"
    Set-Clipboard-And-Open -Content $tweet_standalone_b -Url "https://twitter.com/intent/tweet" -Label "Standalone B — enterprise audit hook"
}

if ($Target -eq "all" -or $Target -eq "linkedin") {
    Write-Host "`n>>> LINKEDIN — Post 1 (founder/x402 story)" -ForegroundColor Magenta
    Set-Clipboard-And-Open -Content $linkedin1 -Url "https://www.linkedin.com/feed/" -Label "LinkedIn Post 1 — x402 founder story"
    Set-Clipboard-And-Open -Content $linkedin2 -Url "https://www.linkedin.com/feed/" -Label "LinkedIn Post 2 — enterprise audit angle"
}

if ($Target -eq "all" -or $Target -eq "hn") {
    Write-Host "`n>>> HACKER NEWS — Show HN" -ForegroundColor Magenta
    Write-Host "  Title to use: $hn_title" -ForegroundColor Yellow
    Write-Host "  URL: $hn_url" -ForegroundColor Yellow
    Write-Host ""
    Set-Clipboard-And-Open -Content $hn_text -Url "https://news.ycombinator.com/submitlink?u=https://twin.unykorn.org&t=Show+HN%3A+Live+visualization+of+20+AI+agents+making+real+payments+via+HTTP+402" -Label "HN Show HN — paste text in the 'text' field (optional for Show HN with URL)"
}

if ($Target -eq "all" -or $Target -eq "reddit") {
    Write-Host "`n>>> REDDIT — 4 posts across subreddits" -ForegroundColor Magenta
    Set-Clipboard-And-Open -Content "$reddit_ml_title`n`n$reddit_ml_body" -Url "https://www.reddit.com/r/MachineLearning/submit?type=text" -Label "Reddit r/MachineLearning"
    Set-Clipboard-And-Open -Content "$reddit_webdev_title`n`n$reddit_webdev_body" -Url "https://www.reddit.com/r/webdev/submit?type=text" -Label "Reddit r/webdev"
    Set-Clipboard-And-Open -Content "$reddit_ai_title`n`n$reddit_ai_body" -Url "https://www.reddit.com/r/artificial/submit?type=text" -Label "Reddit r/artificial"
    Set-Clipboard-And-Open -Content "$reddit_agents_title`n`n$reddit_agents_body" -Url "https://www.reddit.com/r/LLMAgents/submit?type=text" -Label "Reddit r/LLMAgents"
}

if ($Target -eq "all" -or $Target -eq "producthunt") {
    Write-Host "`n>>> PRODUCTHUNT" -ForegroundColor Magenta
    Set-Clipboard-And-Open -Content $ph_description -Url "https://www.producthunt.com/posts/new" -Label "ProductHunt — tagline: $ph_tagline"
}

if ($Target -eq "all" -or $Target -eq "devto") {
    Write-Host "`n>>> DEV.TO — Blog cross-posts" -ForegroundColor Magenta
    Write-Host "  Tags: $devto_tags" -ForegroundColor Yellow
    Write-Host "  Use content from: docs\blog\01-why-the-machine-web-needs-a-payment-challenge-layer.md" -ForegroundColor Yellow
    Set-Clipboard-And-Open -Content (Get-Content "C:\Users\Kevan\UnyKorn-X402-aws\docs\blog\01-why-the-machine-web-needs-a-payment-challenge-layer.md" -Raw) -Url "https://dev.to/new" -Label "Dev.to Post 1 — Blog post 01"
    Set-Clipboard-And-Open -Content (Get-Content "C:\Users\Kevan\UnyKorn-X402-aws\docs\blog\08-how-to-add-paid-access-to-an-api-in-minutes.md" -Raw) -Url "https://dev.to/new" -Label "Dev.to Post 2 — Blog post 08 (high conversion)"
}

if ($Target -eq "all" -or $Target -eq "discord") {
    Write-Host "`n>>> DISCORD — paste into each server" -ForegroundColor Magenta
    Write-Host "  Target servers: Hugging Face, LangChain, OpenAgents, Bankless, Alchemy" -ForegroundColor Yellow
    Set-Clipboard-And-Open -Content $discord_general -Url "https://discord.com/channels/@me" -Label "Discord — general AI/dev servers"
    Set-Clipboard-And-Open -Content $discord_web3 -Url "https://discord.com/channels/@me" -Label "Discord — Web3 servers (Bankless, Alchemy, etc.)"
}

Write-Host @"

╔══════════════════════════════════════════════════════════╗
║  CAMPAIGN LAUNCH COMPLETE                               ║
║                                                         ║
║  Next actions:                                          ║
║  1. [DONE] Stripe webhook: we_1TIhCA1OEzphv6FLTL3Ril1l ║
║     → fthedu.unykorn.org/api/stripe/webhook (live)     ║
║                                                         ║
║  2. Monitor HN/Reddit for comments (reply fast)         ║
║  3. Tomorrow: post standalone tweets A + B              ║
║  4. Day 2: Start cold email — docs\email-sequences-x402 ║
╚══════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green

