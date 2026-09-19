# Cloudflare team strategies — Hail · Storm · Law

**Account:** `07bcc4a189ef176261b818409c95891f` · **Edge worker:** `jarvis-hail-storm-law` · **x402 proxy:** `unykorn-x402-proxy` on `paid.unykorn.org`

**Security:** API token lives only in operator Desktop file + `$env:CLOUDFLARE_API_TOKEN`. Rotate if exposed in chat. Never commit `cfut_*` values.

---

## Hail team (Command)

**Mission:** JARVIS HUD, voice reports, operator dashboard — primary speaking command surface.

| Item | Value |
|------|--------|
| **Hostname** | https://hail.unykorn.org |
| **Wrangler / Pages** | `jarvis-hail` (`apps/jarvis-command` → `npm run deploy:hail`) |
| **Edge router** | `jarvis-hail-storm-law` → `ORIGIN_HAIL` |
| **Nerve owners** | `main`, `infra-watchdog` |

**KPIs**

- `/__jarvis/health` returns 200 within 2s
- `/api/status` shows x402 + paid gateway probes green at edge
- Voice dock loads donk-live (tunnel or :5174 when operator home)
- Operator can hear status summary without reading Nerve markdown

**Deploy**

```powershell
cd C:\Users\Kevan\UnyKorn-X402-aws\apps\jarvis-command
npm run deploy:hail
cd C:\Users\Kevan\UnyKorn-X402-aws\cloudflare\hail-storm-law
.\scripts\deploy-hail-storm-law.ps1
```

---

## Storm team (Ops)

**Mission:** Build logs, swarm status, cron evidence, sprint telemetry.

| Item | Value |
|------|--------|
| **Hostname** | https://storm.unykorn.org |
| **Wrangler / Pages** | `jarvis-storm` |
| **Edge router** | `ORIGIN_STORM` |
| **Cron hooks** | OpenClaw `crons/` + weekend pulse scripts |
| **Nerve owners** | `infra-watchdog`, `troptions-scout` |

**KPIs**

- Sprint log panel shows fresh tail (edge stub → tunnel to `WEEKEND_SPRINT_LOG.md` phase 2)
- Agent army table ≥ 5 rows from `preflight-agents.json`
- Deploy hash posted to `TEAM_BUS.md` after each Pages push
- Storm panel polls `/api/status` every 8s without CORS errors

**Deploy**

```powershell
cd C:\Users\Kevan\UnyKorn-X402-aws\apps\jarvis-command
npm run deploy:storm
```

---

## Law team (x402)

**Mission:** Paywall, `ROUTING_PROOF_LAW`, x402 agent billing, SNP compliance links.

| Item | Value |
|------|--------|
| **Hostname** | https://law.unykorn.org |
| **Wrangler / Pages** | `jarvis-law` |
| **Edge x402** | Worker law paths → facilitator `https://x402.unykorn.org` |
| **Paid gate (reference)** | `https://paid.unykorn.org` (`unykorn-x402-proxy`) |
| **Nerve owners** | `x402-ranger`, `intel-partner`, `agape-guardian` |

**KPIs**

- `curl` to `/api/v1/test` on law host → **402** + `WWW-Authenticate: x402`
- Facilitator verify path healthy (`x402.unykorn.org/health`)
- `ROUTING_PROOF_LAW.md` emitted from SNP clone (intel-partner)
- Apostle chain ID **7332** cited on law panel with live health when tunneled

**Deploy**

```powershell
cd C:\Users\Kevan\UnyKorn-X402-aws\apps\jarvis-command
npm run deploy:law
# x402 proxy (if paid routes drift):
cd C:\Users\Kevan\UnyKorn-X402-aws\workers\x402-proxy\scripts
.\deploy-x402-proxy.ps1 -StagingRoutesOnly
```

---

## Shared inventory

- Pages inventory script: `UnyKorn-X402-aws/scripts/build-cf-inventory.ps1`
- DNS master: `docs/CLOUDFLARE_DNS_MASTER.md`
- Empire SSOT: `~/.openclaw/workspace/docs/UNYKORN_EMPIRE_MASTER_MAP.md`
