# X402 Operator Runbook

**Environment:** Local dev (Windows 11)  
**Gateway:** port 4020 | **Apostle Stub:** port 7332

---

## Start Apostle Chain Stub

```powershell
Start-Process node `
  -ArgumentList "C:\Users\Kevan\apostle-chain\apostle-stub.js" `
  -WorkingDirectory "C:\Users\Kevan\apostle-chain" `
  -RedirectStandardOutput "C:\Users\Kevan\apostle-chain\stub-out.log" `
  -RedirectStandardError "C:\Users\Kevan\apostle-chain\stub-err.log" `
  -NoNewWindow -PassThru | Select-Object Id
```

Verify:
```powershell
Invoke-WebRequest "http://127.0.0.1:7332/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected: `{"ok":true,"operational":true,"chain_id":7332,...}`

---

## Start x402 Gateway

```powershell
$gwDir = "C:\Users\Kevan\UnyKorn-X402-aws\packages\x402-credit-gateway"
Start-Process node `
  -ArgumentList "dist/index.js" `
  -WorkingDirectory $gwDir `
  -RedirectStandardOutput "C:\Users\Kevan\UnyKorn-X402-aws\gateway.log" `
  -RedirectStandardError "C:\Users\Kevan\UnyKorn-X402-aws\gateway-err.log" `
  -NoNewWindow -PassThru | Select-Object Id
```

Verify:
```powershell
Invoke-WebRequest "http://127.0.0.1:4020/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected: `{"ok":true,"version":"2.0.0","chain":{"operational":true,...}}`

---

## Rebuild Gateway (after code changes)

```powershell
cd "C:\Users\Kevan\UnyKorn-X402-aws\packages\x402-credit-gateway"
npx tsc
```

Expect: no output = clean compile.

---

## Check Port 7332 (Apostle Stub)

```powershell
netstat -ano | Select-String ":7332"
```

Expected: `LISTENING` entry. If missing, stub is not running — restart above.

---

## Check Port 4020 (Gateway)

```powershell
netstat -ano | Select-String ":4020"
```

Expected: `LISTENING` entry. If missing, gateway is not running — restart above.

---

## Start Cloudflare Tunnel

Tunnel runs via Windows Task Scheduler:
```powershell
Start-ScheduledTask -TaskName "UnyKorn-X402-Tunnel"
(Get-ScheduledTask -TaskName "UnyKorn-X402-Tunnel").State
```

Expected: `Running`

Config file: `C:\Users\Kevan\.cloudflared\unykorn-x402-4020.yml`  
Origin: `http://127.0.0.1:4020` (NOT `localhost` — IPv6 fix applied)

---

## Run Webhook Test

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Kevan\UnyKorn-X402-aws\test-webhook.ps1"
```

Expected output:
```
HTTP: 200
Response: {"received":true}
```

---

## Read Gateway Logs

```powershell
Get-Content "C:\Users\Kevan\UnyKorn-X402-aws\gateway.log" | Select-Object -Last 30
Get-Content "C:\Users\Kevan\UnyKorn-X402-aws\gateway-err.log" | Select-Object -Last 30
```

Look for: `Credited N ATP to agent:...` after a webhook test.

---

## Read Airdrop Stub Log

```powershell
Get-Content "C:\Users\Kevan\apostle-chain\airdrop-stub.log"
```

Every airdrop call is logged with: `AIRDROP agent=... amount=... new_balance=... label=...`

---

## Verify Agent Balance (Apostle Stub)

```powershell
$agentId = "87724c76-da93-4b1a-9fa6-271ba856338e"
(Invoke-WebRequest "http://127.0.0.1:7332/v1/agent/$agentId/balance" -UseBasicParsing).Content
```

Expected: `{"agent_id":"87724c76...","balances":{"ATP":"...","APO":"..."},"nonce":0}`

---

## Check All Running Node Processes

```powershell
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, CPU, StartTime
```

You should see at least 2 node processes: one for the stub (port 7332), one for the gateway (port 4020).

---

## Kill All Node Processes (reset)

> Warning: kills BOTH stub and gateway. Restart both after.

```powershell
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
```

---

## Check Public Health (via tunnel)

```powershell
Invoke-WebRequest "https://x402-origin.unykorn.org/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected: same health JSON as local.

---

## Check Public Webhook Endpoint

```powershell
Invoke-WebRequest "https://x402.unykorn.org/v1/stripe/prices" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected: ATP price tiers JSON.

---

## Environment File Location

`C:\Users\Kevan\UnyKorn-X402-aws\packages\x402-credit-gateway\.env`

Key values:
- `X402_MODE=staged`
- `X402_DEV_MOCK=false`
- `APOSTLE_URL=http://localhost:7332`
- `ADMIN_TOKEN=<redacted>`
