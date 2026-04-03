# Treasury & Wallet Rail Activation Runbook

> **Created:** 2026-03-28  
> **Scope:** Activate deposit rails, fund treasury wallets, start treasury/guardian services

---

## Wallet Status (as of 2026-03-28)

| Chain | Address | Balance | Status |
|-------|---------|---------|--------|
| **XRPL** | `rsJ3PGGDH4vPpedjfVRe9YKTCf9BWu6TDC` | 14 XRP | ACTIVE — only 4 XRP above 10 XRP reserve |
| **Stellar Treasury** | `GBJF54FBYPBVHR6Z3OKWWEMPF6QYPNH3RZZYX3E4V7AUMUWIEV7Z3DPX` | 0 XLM | **NOT ACTIVATED** — needs ≥1 XLM |
| **OPTKAS Issuer** | `GBJIMHMBGTPN5RS42OGBUY5NC2ATZLPT3B3EWV32SM2GQLS46TRJWG4I` | ~50 XLM + 50M FTHUSD + 50M USDF | ACTIVE |
| **OPTKAS Distrib** | `GAKCD7OKDM4HLZDBEE7KXTRFAYIE755UHL3JFQEOOHDPIMM5GEFY3RPF` | ~54 XLM + 1.54B FTHUSD + 1.54B USDF + RWA tokens | ACTIVE |
| **OPTKAS Anchor** | `GC6O6Q7FG5FZGHE5D5BHGA6ZTLRAU7UWFJKKWNOJ36G3PKVVKVYLQGA6` | ~26 XLM + 10M FTHUSD + 10M USDF | ACTIVE |
| **Polygon** | `0x7d9a65d06dcc435a52D5880C6310Bd6E96c156DB` | 15 POL | ACTIVE |
| **Ethereum** | `0x7d9a65d06dcc435a52D5880C6310Bd6E96c156DB` | 0 ETH | **EMPTY** — no gas for ERC-20 |
| **TRON** | `TDZ8teLQSTP8htgKV1HQiL6gp39stcaGVd` | Unverified (rate-limited) | Needs manual check |

---

## Step 1: Activate Stellar Treasury Wallet

The FTH Pay Stellar treasury address `GBJF54...DPX` returned 404 from Horizon — it has never received XLM and is not activated.

**Option A — Fund from OPTKAS Distrib (has ~54 XLM):**

```bash
# From OPTKAS Distrib account, send 5 XLM to activate the treasury
# Use Stellar Laboratory: https://laboratory.stellar.org/
# Or via CLI:
stellar tx new \
  --source GAKCD7OKDM4HLZDBEE7KXTRFAYIE755UHL3JFQEOOHDPIMM5GEFY3RPF \
  create-account GBJF54FBYPBVHR6Z3OKWWEMPF6QYPNH3RZZYX3E4V7AUMUWIEV7Z3DPX 5 \
  --network mainnet --sign --submit
```

**Option B — Buy XLM on exchange and send to address.**

**Verification:**
```bash
curl -s https://horizon.stellar.org/accounts/GBJF54FBYPBVHR6Z3OKWWEMPF6QYPNH3RZZYX3E4V7AUMUWIEV7Z3DPX | jq '.balances[] | select(.asset_type=="native") | .balance'
```

After activation, set up trustlines for USDC, USDF, FTHUSD.

---

## Step 2: Fund Ethereum Treasury

The EVM treasury `0x7d9a65d06dcc435a52D5880C6310Bd6E96c156DB` has 0 ETH — it cannot process any ERC-20 transfers (USDT, USDC, XAUT).

**Minimum needed:** 0.01 ETH (~$25) for gas buffer.  
**Recommended:** 0.05 ETH (~$125) for sustained operations.

Send ETH from an exchange or existing wallet.

**Verification:**
```powershell
$body = '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0x7d9a65d06dcc435a52D5880C6310Bd6E96c156DB","latest"],"id":1}'
$r = Invoke-WebRequest "https://ethereum-rpc.publicnode.com" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
python -c "print('ETH:', int('$(($r.Content | ConvertFrom-Json).result)', 16) / 1e18)"
```

---

## Step 3: Top Up XRPL Treasury

The XRPL treasury has 14 XRP with a 10 XRP reserve, leaving only 4 XRP for operations.

**Recommended:** Send 50+ XRP to `rsJ3PGGDH4vPpedjfVRe9YKTCf9BWu6TDC`.

---

## Step 4: Verify TRON Treasury

TronGrid rate-limited the balance check. Manually verify:

1. Visit: https://tronscan.org/#/address/TDZ8teLQSTP8htgKV1HQiL6gp39stcaGVd
2. Check TRX balance (need ~100 TRX for bandwidth/energy for USDT transfers)
3. Check TRC-20 token balances (USDT)

---

## Step 5: Start x402 Treasury Service (Port 3200)

The treasury service at `packages/fth-x402-treasury` is NOT running.

**Prerequisites:**
- PostgreSQL on port 5450 (database: `fth_x402`) — ✅ Running
- `.env` with `DATABASE_URL`, `FTH_SERVICE_SECRET`, `ADMIN_API_TOKEN` — ✅ Exists

**Start command:**
```powershell
cd C:\Users\Kevan\UnyKorn-X402-aws
# Load env vars
Get-Content .env | Where-Object { $_ -match '^[A-Z]' } | ForEach-Object { $k,$v = $_ -split '=',2; [System.Environment]::SetEnvironmentVariable($k,$v,'Process') }
# Start treasury
npx tsx packages/fth-x402-treasury/src/index.ts
```

**Verify:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3200/treasury/status" -UseBasicParsing
```

---

## Step 6: Start Guardian Service (Port 3300)

The guardian daemon army at `packages/fth-guardian` provides 8 monitoring daemons.

**Start command:**
```powershell
cd C:\Users\Kevan\UnyKorn-X402-aws
npx tsx packages/fth-guardian/src/index.ts
```

**Verify:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3300/health" -UseBasicParsing
```

---

## FTH Pay Rate Limiter Fix

The fth-pay API (port 3100) has `RATE_LIMIT_MAX=100` in `.env` — only 100 requests per 15 minutes per IP. This is too aggressive for production.

**Fix applied:** Health check route moved BEFORE rate limiter middleware in `app.ts` so ALB health checks never get 429'd.

**Recommended .env change:**
```
RATE_LIMIT_MAX=2000
```

---

## Post-Activation Checklist

- [ ] Stellar treasury activated with ≥5 XLM
- [ ] Stellar trustlines set: USDC, USDF, FTHUSD
- [ ] Ethereum treasury funded with ≥0.05 ETH
- [ ] XRPL treasury topped up to ≥50 XRP
- [ ] TRON treasury verified and funded (≥100 TRX)
- [ ] x402 Treasury service running on :3200
- [ ] Guardian service running on :3300
- [ ] FTH Pay rate limit raised to 2000
- [ ] Deposit watcher polling all 4 chains confirmed
