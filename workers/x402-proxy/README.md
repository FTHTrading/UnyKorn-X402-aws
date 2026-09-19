# UNYKORN x402 Edge Proxy

Payment-gated Cloudflare Worker using the Apostle ATP x402 handshake (`X-Payment-Receipt`).

## Deploy

```powershell
$env:CLOUDFLARE_API_TOKEN = "<token>"
cd C:\Users\Kevan\UnyKorn-X402-aws\workers\x402-proxy
npm install
npx wrangler secret put JWT_SECRET   # optional session cookie
npx wrangler deploy
.\scripts\deploy-x402-proxy.ps1 -RoutesOnly
```

## Test

```bash
curl -i https://api.unykorn.org/__x402/health
curl -i https://api.unykorn.org/v1/agents/pricing
```

Expect `402` on protected paths without `X-Payment-Receipt`.

## Env

| Var | Purpose |
|-----|---------|
| `FACILITATOR_URL` | Credit gateway base (verify via `/v1/x402/verify`) |
| `PROVIDER_WALLET` | `agent:<uuid>` treasury |
| `PRICE_PER_REQUEST` | Default human ATP price |
| `PRICE_MAP_JSON` | Path → price overrides |
| `PROTECTED_PATTERNS` | Comma patterns (`/*`, `/api/*`) |
| `PUBLIC_PATHS` | Bypass list |
| `JWT_SECRET` | 1h session cookie after payment |

Tunnels are unchanged — attach routes on zones already proxied through Cloudflare.
