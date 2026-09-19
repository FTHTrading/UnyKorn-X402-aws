# Build registry/cloudflare-pages-inventory.json from pasted URL list.
# Run: powershell -ExecutionPolicy Bypass -File scripts/build-cf-inventory.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root "registry\cloudflare-pages-inventory.json"

$rawUrls = @(
  "https://xrplloans.unykorn.org/platform",
  "https://2a6cdbce.xrpl-standards.pages.dev/",
  "https://363b0c1c.xrpl-standards.pages.dev/",
  "https://yess-mensofgod.pages.dev/",
  "https://wholesale-lighting.pages.dev/",
  "https://tax.unykorn.org/",
  "https://fthusdf.pages.dev/",
  "https://triton.unykorn.org/",
  "https://fth-demo.pages.dev/",
  "https://bot1-f39.pages.dev/",
  "https://ridgemont-academy.pages.dev/",
  "https://fthtcb.pages.dev/",
  "https://bio-unykorn.pages.dev/",
  "https://cricket-frontend.pages.dev/",
  "https://gamified-cricket.pages.dev/",
  "https://kalishi-edge-dashboard.pages.dev/",
  "https://dignity.unykorn.org/",
  "https://gmiie-dev.pages.dev/",
  "https://legal-chain-web.pages.dev/",
  "https://system-unykorn.pages.dev/",
  "https://nil33.pages.dev/",
  "https://x402-unykorn.pages.dev/",
  "https://explorer-unykorn.pages.dev/",
  "https://legal-unykorn.pages.dev/",
  "https://tronsite-unykorn.pages.dev/",
  "https://tronfraud-unykorn.pages.dev/login",
  "https://marquis-unykorn.pages.dev/login",
  "https://law-unykorn.pages.dev/",
  "https://stoanhedge.mensofgod.com/",
  "https://build.mensofgod.com/",
  "https://childfirst.mensofgod.com/",
  "https://unykorn-explorer.pages.dev/",
  "https://chi-mensofgod.pages.dev/",
  "https://x402-site-a5m.pages.dev/",
  "https://fitzherbert-university.pages.dev/",
  "https://eternalchain-v2.pages.dev/",
  "https://eternalchain.pages.dev/",
  "https://234f3067.super-s.pages.dev/",
  "https://gmiie-news.pages.dev/",
  "https://mensofgod.com/",
  "https://mensofgod.com/mog",
  "https://www.mensofgod.com/guide",
  "https://drunks-app.pages.dev/",
  "https://2500-donkeys.pages.dev/",
  "https://unykorn-ico.pages.dev/",
  "https://buck-fraud-system.pages.dev/",
  "https://b01f5329.unykorn-institutional.pages.dev/",
  "https://0b249214.unykorn-institutional.pages.dev/",
  "https://y3kmarkets.pages.dev/",
  "https://unykorn-gold-portal.pages.dev/",
  "https://mog-liquidity-desk.pages.dev/",
  "https://dr.optkas.org/",
  "https://unykorn-4c2.pages.dev/",
  "https://avax-unykorn.pages.dev/",
  "https://a07de520.needai-platform.pages.dev/",
  "https://freelance-command-center-8z7.pages.dev/",
  "https://donk.unykorn.org/",
  "https://helios-films.pages.dev/",
  "https://xxxiii-io.pages.dev/",
  "https://doc-intelligence.pages.dev/",
  "https://www.mensofgod.com/intake",
  "https://optkas-site.pages.dev/",
  "https://4fb1847f.bio-unykorn.pages.dev/",
  "https://bio.unykorn.org/",
  "https://optkas-golf-hole.pages.dev/",
  "https://optkas.org/",
  "https://helios-donk-city.pages.dev/",
  "https://helios-digital-site.pages.dev/",
  "https://fifa-unykorn.pages.dev/",
  "https://ba6d2057.fifa-unykorn.pages.dev/",
  "https://d567975e.fifa-unykorn.pages.dev/",
  "https://needai-site.pages.dev/",
  "https://7aa2a519.needai-site.pages.dev/",
  "https://bed7ead5.needai-site.pages.dev/",
  "https://2c76e325.needai-site.pages.dev/",
  "https://51e68082.needai-site.pages.dev/",
  "https://f0d11d87.needai-site.pages.dev/",
  "https://console.optkas.org/",
  "https://d458f510.brokerdealer-unykorn.pages.dev/",
  "https://3f5a7287.brokerdealer-unykorn.pages.dev/",
  "https://94513a58.brokerdealer-unykorn.pages.dev/",
  "https://c3f872c6.brokerdealer-unykorn.pages.dev/",
  "https://sblc.optkas.org/",
  "https://fifa-wilkins.pages.dev/",
  "https://e32044d3.silver-unykorn-org.pages.dev/",
  "https://fifa-wilkins.kevanbtc.workers.dev/select-language",
  "https://abf5659d.needai-site.pages.dev/",
  "https://youth.unykorn.org/missions",
  "https://trades.unykorn.org/",
  "https://fthedu.unykorn.org/",
  "https://brokerdealer.unykorn.org/",
  "https://portfolio.unykorn.org/",
  "https://x402.unykorn.org/",
  "https://law.unykorn.org/",
  "https://unykorn.org/",
  "https://tronfraud.unykorn.org/",
  "https://tronsite.unykorn.org/",
  "https://fthtrading.github.io/sunfarm--platform/",
  "https://mensofgod.com/guide",
  "https://fraud.mensofgod.com/buck/",
  "https://troptionsexchange.unykorn.org/exchange-os",
  "https://fifa.unykorn.org/",
  "https://black.unykorn.org/",
  "https://t.drunks.app/troptions",
  "https://fifa.unykorn.org/emergency",
  "https://troptionsexchange.unykorn.org/exchange-os/solana",
  "https://legacy-vault-protocol.vercel.app/",
  "https://papers.ssrn.com/Sol3/Cf_Dev/AbsByAuth.cfm?per_id=10381097",
  "https://crates.io/crates/genesis-multiverse",
  "https://www.moltbook.com/u/genesisprotocol",
  "https://super-s.pages.dev/genesis",
  "https://zenodo.org/records/18729652",
  "https://xxxiii.io/briefs/",
  "https://news.unykorn.org/",
  "https://donkeys.xxxiii.io/",
  "https://la.unykorn.org/",
  "https://xxxiii.io/",
  "https://diaintake.netlify.app/",
  "https://fthtrading.github.io/M1/",
  "https://fthtrading.github.io/Ai-Franchise/",
  "https://heliosdigital.xyz/",
  "https://ridgemont.unykorn.org/faculty",
  "https://paid.unykorn.org/",
  "https://pay.drunks.app/",
  "https://troptionslive.unykorn.org/",
  "https://troptions.unykorn.org/",
  "https://3fs.unykorn.org/",
  "https://api.unykorn.org/",
  "https://xrplloans.unykorn.org/"
)

function Get-UrlType([string]$u) {
  if ($u -match '\.pages\.dev') { return 'pages.dev' }
  if ($u -match '\.workers\.dev') { return 'workers.dev' }
  if ($u -match 'github\.io|github\.com') { return 'github' }
  if ($u -match 'vercel\.app|netlify\.app') { return 'external' }
  if ($u -match 'ssrn\.com|zenodo\.org|crates\.io|moltbook\.com') { return 'external' }
  return 'custom'
}

function Get-Zone([string]$u) {
  if ($u -match 'unykorn\.org') { return 'unykorn.org' }
  if ($u -match 'mensofgod\.com') { return 'mensofgod.com' }
  if ($u -match 'drunks\.app') { return 'drunks.app' }
  if ($u -match 'optkas\.org') { return 'optkas.org' }
  if ($u -match 'heliosdigital\.xyz') { return 'heliosdigital.xyz' }
  if ($u -match 'xxxiii\.io') { return 'xxxiii.io' }
  if ($u -match 'y3kmarkets') { return 'y3kmarkets.com' }
  if ($u -match 'nil33') { return 'nil33.com' }
  return $null
}

function Get-ProjectGuess([string]$u) {
  if ($u -match 'ridgemont') { return 'ridgemont-academy' }
  if ($u -match 'xrpl-standards|xrplloans') { return 'xrpl-standards' }
  if ($u -match 'needai') { return 'needai-site' }
  if ($u -match 'fifa') { return 'fifa-unykorn' }
  if ($u -match 'bio-unykorn|bio\.unykorn') { return 'bio-unykorn' }
  if ($u -match 'brokerdealer') { return 'brokerdealer-unykorn' }
  if ($u -match 'x402') { return 'x402-unykorn' }
  if ($u -match 'mensofgod|mog') { return 'mensofgod-site' }
  if ($u -match 'optkas') { return 'optkas-site' }
  if ($u -match 'helios') { return 'helios-digital-site' }
  if ($u -match 'troptions') { return 'troptions' }
  if ($u -match 'fthusdf|usdf') { return 'fthusdf' }
  return ($u -replace '^https?://','' -replace '/.*$','' -replace '^[a-f0-9]+\.','')
}

$seen = @{}
$items = foreach ($url in $rawUrls) {
  $norm = $url.Trim().TrimEnd('/')
  if ($seen.ContainsKey($norm)) { continue }
  $seen[$norm] = $true
  [ordered]@{
    url = $url
    type = Get-UrlType $url
    project_guess = Get-ProjectGuess $url
    zone = Get-Zone $url
    status = 'inventory'
  }
}

$doc = [ordered]@{
  meta = [ordered]@{
    version = 1
    updatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    count = $items.Count
    account = 'kevanbtc@gmail.com'
    hubUrl = 'https://xrplloans.unykorn.org/platform'
    zonesKnown = @('unykorn.org','mensofgod.com','drunks.app','optkas.org','heliosdigital.xyz','xxxiii.io','y3kmarkets.com','nil33.com')
  }
  entries = $items
}

$doc | ConvertTo-Json -Depth 6 | Set-Content -Path $outPath -Encoding UTF8
Write-Host "Wrote $($items.Count) entries to $outPath"
