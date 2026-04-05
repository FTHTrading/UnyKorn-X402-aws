# scripts/campaign-export.ps1
# Non-interactive campaign content exporter.
#
# Writes all campaign posts to dated files so you can:
#   - Schedule via Buffer / Hootsuite / Later
#   - Review offline before posting
#   - Pipe into automation (Twitter API, Reddit API, etc.)
#
# Usage:
#   .\scripts\campaign-export.ps1
#   .\scripts\campaign-export.ps1 -OutDir "C:\path\to\output"
#   .\scripts\campaign-export.ps1 -Platform twitter
#   .\scripts\campaign-export.ps1 -PrintSummary   # just list what would be created

param(
    [string]$OutDir = "C:\Users\Kevan\campaign-exports\$(Get-Date -Format 'yyyy-MM-dd_HHmm')",
    [ValidateSet("all","twitter","linkedin","hn","reddit","producthunt","devto","discord")]
    [string]$Platform = "all",
    [switch]$PrintSummary
)

Set-StrictMode -Version Latest

# ── Content ──────────────────────────────────────────────────────────────────

$Content = @{

  twitter = [ordered]@{
    "01-thread-hook" = @"
HTTP 402 Payment Required has been in the spec since 1996.

"Reserved for future use."

The future is AI agents making request-level payments to other AI systems.

Here's how x402 on Apostle Chain works, and why we built it:

🧵1/8
"@
    "02-thread-api-keys" = @"
2/ The problem with API keys for AI agents:

- Keys are shared across agents (no attribution)
- No economic signal per request
- No proof of what was received
- No cryptographic receipt chain

When AI agents are autonomous, you need economic enforcement, not key management.
"@
    "03-thread-flow" = @"
3/ x402 replaces the key with a payment proof.

Agent calls your endpoint →
Gets a 402 challenge back →
Pays ATP from its sovereign wallet →
You verify in <50ms →
Settlement hits the chain →
Receipt recorded forever.

Both parties walk away with cryptographic evidence.
"@
    "04-thread-code" = @"
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
    "05-thread-live" = @"
5/ Live right now on Apostle Chain:

20 agents actively trading
3,200+ settled transactions
2.86M ATP in circulation
<50ms average settlement
$0 platform fee

Watch receipts settle in real time → twin.unykorn.org
"@
    "06-thread-enterprise" = @"
6/ For enterprise:

Every transaction = cryptographic receipt.
Evidence bundles have a Merkle root + chain signature.
Auditors verify completeness without re-reading the chain.
Budget periods enforce spend ceilings — rejected, not flagged.

This is pre-authorization enforcement, not post-hoc review.
"@
    "07-thread-providers" = @"
7/ For API providers:

- No billing portal redesign
- Per-route pricing
- No platform margin
- White-label rails
- Receipts go to your customers directly

Your existing stack. New revenue model.
"@
    "08-thread-cta" = @"
8/ We're onboarding the first wave of API providers.

If you're building inference endpoints, data feeds, retrieval services, or specialized models that AI agents will call —

Reply or DM. I'll personally walk you through the integration.

Docs: x402api.unykorn.org
Live: twin.unykorn.org
"@
    "09-standalone-short" = @"
HTTP 402 has been "reserved for future use" since 1996.

30 years later: AI agents paying each other per request, on-chain receipts, cryptographic proof of settlement.

twin.unykorn.org — live right now.
"@
    "10-standalone-audit" = @"
"How do you audit what an AI agent spent money on?"

If your answer is "vendor invoice + log file" — that doesn't survive legal discovery.

x402 on Apostle Chain: cryptographic receipt per transaction, Merkle-rooted evidence bundles, chain-signed.

Built for the audit question compliance teams will ask this year.
"@
  }

  linkedin = [ordered]@{
    "01-founder-story" = @"
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
    "02-enterprise-audit" = @"
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
  }

  hn = [ordered]@{
    "show-hn" = @"
TITLE: Show HN: Live visualization of 20 AI agents making real payments via HTTP 402
URL:   https://twin.unykorn.org

TEXT (optional — paste in the 'text' field):
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
  }

  reddit = [ordered]@{
    "r-machinelearning" = @"
SUBREDDIT: r/MachineLearning
TITLE: HTTP 402 for AI-to-AI commerce: request-level payment proof instead of API keys

BODY:
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
    "r-webdev" = @"
SUBREDDIT: r/webdev
TITLE: HTTP 402 is finally being used — payment proof per request instead of API keys for AI agents

BODY:
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
    "r-artificial" = @"
SUBREDDIT: r/artificial
TITLE: 20 AI agents paying each other in real time — here's what the machine economy looks like today

BODY:
I want to show you something live, not a demo, not a mockup.

https://twin.unykorn.org

20 AI agents making real payments to each other for services. The 3D visualization shows the network graph. The receipt feed at the bottom updates live as transactions settle on-chain.

These agents have sovereign wallets. They make autonomous spending decisions within on-chain budget constraints. No human approves individual payments. No credit card. No billing department.

The API key model was built for human developers. These agents aren't that.

Protocol source: https://github.com/FTHTrading/UnyKorn-X402-aws

Curious how others are thinking about agent-to-agent economic coordination.
"@
    "r-llmagents" = @"
SUBREDDIT: r/LLMAgents
TITLE: How are your agents paying for external API access? Here's what we built.

BODY:
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
  }

  producthunt = [ordered]@{
    "post" = @"
TAGLINE: x402 on Apostle Chain — HTTP 402 Payment Required, finally used

DESCRIPTION:
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

POST URL: https://twin.unykorn.org
MAKERS: @kevanbtc (or your Twitter handle)
TOPICS: Artificial Intelligence, Developer Tools, API, Blockchain, Open Source
"@
  }

  discord = [ordered]@{
    "general-ai-dev" = @"
Hey everyone — wanted to share something we've been building.

We implemented HTTP 402 Payment Required for AI agent commerce. Flow: agent calls a premium endpoint → gets a 402 challenge → pays from its wallet → provider verifies in <50ms → receipt written on-chain.

Live demo with 20 agents making real ATP payments: https://twin.unykorn.org — receipt feed updates live.

For devs: it's a middleware wrapper on existing endpoints. No billing portal redesign, no new auth system.

Repo: https://github.com/FTHTrading/UnyKorn-X402-aws

Happy to talk through the design.
"@
    "web3" = @"
Built a request-level payment protocol for AI-to-AI commerce on Apostle Chain (Rust, chain_id 7332).

The interesting part: payment proof travels in the HTTP header (X-Payment-Proof), not a separate tx. Provider verifies in <50ms without blocking. Settlement is async, proof is synchronous.

Agentic settlement demo live: https://twin.unykorn.org

Ed25519 signing, TxEnvelope format, amounts as string u128 (JSON precision). AMA.
"@
  }
}

# ── Export ─────────────────────────────────────────────────────────────────────

if ($PrintSummary) {
    Write-Host "`nCampaign export would create the following files:`n" -ForegroundColor Cyan
    foreach ($plat in $Content.Keys) {
        if ($Platform -ne "all" -and $Platform -ne $plat) { continue }
        foreach ($key in $Content[$plat].Keys) {
            Write-Host "  $plat/$key.txt" -ForegroundColor Gray
        }
    }
    Write-Host ""
    exit 0
}

# Create output directory
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$count = 0

foreach ($plat in $Content.Keys) {
    if ($Platform -ne "all" -and $Platform -ne $plat) { continue }

    $platDir = Join-Path $OutDir $plat
    New-Item -ItemType Directory -Force -Path $platDir | Out-Null

    foreach ($key in $Content[$plat].Keys) {
        $file = Join-Path $platDir "$key.txt"
        [System.IO.File]::WriteAllText($file, $Content[$plat][$key].Trim(), [System.Text.UTF8Encoding]::new($false))
        $count++
    }
}

# Write manifest
$manifest = @{
    exported_at = (Get-Date -Format "yyyy-MM-dd HH:mm")
    out_dir     = $OutDir
    platform    = $Platform
    files       = $count
    how_to_post = @{
        hn          = "Go to news.ycombinator.com/submit — use the TITLE/URL in hn/show-hn.txt"
        twitter     = "Post 01 through 08 as a reply thread; 09 and 10 as standalone posts"
        reddit      = "Each file contains SUBREDDIT, TITLE, and BODY — paste accordingly"
        linkedin    = "Post each file as a new LinkedIn post (use rich text editor)"
        producthunt = "ph.com/posts/new — fill TAGLINE, DESCRIPTION fields from the file"
        discord     = "Paste into #general or #web3 channels on target servers"
        devto       = "Use: python3 scripts/publish-devto.py docs/blog/NN-*.md --published"
    }
} | ConvertTo-Json -Depth 5

$manifestPath = Join-Path $OutDir "MANIFEST.json"
[System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))

# Print summary
Write-Host ""
Write-Host "Campaign export complete" -ForegroundColor Green
Write-Host "  Directory : $OutDir" -ForegroundColor Cyan
Write-Host "  Files     : $count posts across $($Content.Keys.Count) platforms" -ForegroundColor Cyan
Write-Host "  Manifest  : $manifestPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Platform order recommended (highest ROI first):" -ForegroundColor Yellow
Write-Host "  1. Hacker News    —  hn\show-hn.txt"
Write-Host "  2. Twitter thread —  twitter\01-thread-hook.txt  thru  08-thread-cta.txt"
Write-Host "  3. Reddit (4x)    —  reddit\r-*.txt"
Write-Host "  4. LinkedIn       —  linkedin\*.txt"
Write-Host "  5. ProductHunt    —  producthunt\post.txt"
Write-Host "  6. Discord        —  discord\*.txt"
Write-Host "  7. dev.to         —  python3 scripts\publish-devto.py docs\blog\NN-*.md --published"
Write-Host ""
Write-Host "dev.to quick-publish all as drafts:" -ForegroundColor White
Write-Host "  `$env:DEVTO_API_KEY='YOUR_KEY_HERE'; Get-ChildItem docs\blog\*.md | ForEach-Object { python3 scripts\publish-devto.py `$_.FullName }" -ForegroundColor DarkGray
Write-Host ""

# Offer to open the folder
$open = Read-Host "Open output folder? (Y/n)"
if ($open -ne "n" -and $open -ne "N") {
    Start-Process explorer.exe $OutDir
}
