# x402-proxy — Domain route mapping

Account: `07bcc4a189ef176261b818409c95891f`  
Worker script: `unykorn-x402-proxy`  
Workers.dev (live): `https://unykorn-x402-proxy.kevanbtc.workers.dev`

## Current conflicts (must unassign before attaching proxy)

| Zone | Pattern | Current worker |
|------|---------|----------------|
| unykorn.org | api.unykorn.org/* | unykorn-api |
| unykorn.org | x402.unykorn.org/* | unykorn-x402-edge |
| unykorn.org | www.unykorn.org/* | unykorn-site |
| xxxiii.io | * | xxxiii-gmiie |
| optkas.org | dr.optkas.org/* | dics-dr |

**Strategy:** Use x402-proxy on *new* subdomains first (e.g. `paid.unykorn.org/*`) or replace `api.unykorn.org` after staging on workers.dev.

## Staging cutover (2026-05-22) — LIVE

| Pattern | Worker | DNS |
|---------|--------|-----|
| `pay.drunks.app/*` | unykorn-x402-proxy | CNAME → `98795c02-...cfargotunnel.com` (proxied) |
| `paid.unykorn.org/*` | unykorn-x402-proxy | CNAME → `98795c02-...cfargotunnel.com` (proxied) |

**Not touched:** `api.unykorn.org/*` → still `unykorn-api`.

```powershell
.\deploy-x402-proxy.ps1 -StagingRoutesOnly   # staging routes only
```

### curl verification (PowerShell: use `curl.exe`)

```bat
curl.exe -sS -w "health %%{http_code}\n" -o NUL https://pay.drunks.app/__x402/health
curl.exe -sS -w "protected %%{http_code}\n" -o NUL https://paid.unykorn.org/v1/test
curl.exe -sS -D - -o NUL https://paid.unykorn.org/v1/test
```

Expected: health `200`; protected `402` with `WWW-Authenticate: x402`, `X-402-Version: 1`.

## Zero Trust (second layer on origin)

- **Edge (public):** `paid.*` / `pay.*` — x402 Worker only; do **not** put Cloudflare Access on these hostnames (blocks 402).
- **Origin (private):** Access app `UnyKorn x402 Origin (tunnel)` on `x402-origin.unykorn.org` — operator email + service token `x402-proxy-origin` for Worker→origin `fetch`.
- **Tunnels:** `unykorn-x402-gateway` (`98795c02-...`) unchanged; cloudflared on EC2/laptop owns ingress.
- **Worker secrets still needed:** `ORIGIN_URL=https://x402-origin.unykorn.org`, `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` (store via wrangler; never commit).

## Recommended rollout

| Priority | Zone | Route pattern | Notes |
|----------|------|---------------|-------|
| P0 test | (workers.dev) | `unykorn-x402-proxy.kevanbtc.workers.dev/*` | Deployed — curl tests |
| P1 | unykorn.org | `paid.unykorn.org/*` | **DONE** — staging live |
| P2 | drunks.app | `drunks.app/*`, `www.drunks.app/*` | No worker routes today |
| P2 | heliosdigital.xyz | apex + www | No routes today |
| P2 | nil33.com | apex + www | No routes today |
| P2 | y3kmarkets.com | apex + www | No routes today |
| P3 | unykorn.org | `api.unykorn.org/*` | Replace unykorn-api after validation |

## Dashboard / API

```powershell
$env:CLOUDFLARE_API_TOKEN = "<token>"
cd C:\Users\Kevan\UnyKorn-X402-aws\workers\x402-proxy\scripts
.\deploy-x402-proxy.ps1 -RoutesOnly
```

Or Cloudflare Dashboard → Workers → `unykorn-x402-proxy` → Triggers → Add route.
