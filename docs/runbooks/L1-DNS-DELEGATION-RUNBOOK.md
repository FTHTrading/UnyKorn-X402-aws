# L1 DNS Delegation Runbook

> **Blocker:** B1 — l1.unykorn.org unreachable from public internet  
> **Root Cause:** Cloudflare manages `unykorn.org` but has no NS records delegating `l1.unykorn.org` to Route53  
> **Impact:** ALL public endpoints (facilitator, treasury, guardian, rpc, api, demo, dashboard) unreachable  

---

## Prerequisites

- Cloudflare dashboard access for `unykorn.org` (zone ID: `8aa6916f4c1c7e8e42130455dfd5c029`)
- Route53 hosted zone confirmed: `Z08184221LQW6HTHIC1D2`

## Route53 Nameservers

These are the authoritative nameservers for the `l1.unykorn.org` hosted zone:

```
ns-600.awsdns-11.net
ns-1855.awsdns-39.co.uk
ns-1501.awsdns-59.org
ns-307.awsdns-38.com
```

---

## Step 1: Add NS Records in Cloudflare

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select zone: **unykorn.org**
3. Go to **DNS → Records**
4. Add **4 NS records** (do NOT proxy — must be DNS-only):

| Type | Name | Content | TTL | Proxy |
|------|------|---------|-----|-------|
| NS | l1 | ns-600.awsdns-11.net | Auto | DNS only (grey cloud) |
| NS | l1 | ns-1855.awsdns-39.co.uk | Auto | DNS only (grey cloud) |
| NS | l1 | ns-1501.awsdns-59.org | Auto | DNS only (grey cloud) |
| NS | l1 | ns-307.awsdns-38.com | Auto | DNS only (grey cloud) |

**CRITICAL:** These MUST be DNS-only (grey cloud icon, NOT orange proxied). NS records cannot be proxied.

## Step 2: Remove Any Conflicting Records

Check Cloudflare for any existing A, AAAA, or CNAME records for `l1.unykorn.org` or `*.l1.unykorn.org`. If any exist, **delete them** — they will conflict with the NS delegation.

## Step 3: Wait for Propagation

DNS propagation typically takes 5-30 minutes, but can take up to 48 hours.

## Step 4: Verify

```powershell
# Check NS delegation
nslookup -type=NS l1.unykorn.org 8.8.8.8

# Expected output should show the 4 Route53 nameservers

# Check A record resolution
nslookup l1.unykorn.org 8.8.8.8
nslookup rpc.l1.unykorn.org 8.8.8.8
nslookup facilitator.l1.unykorn.org 8.8.8.8
nslookup treasury.l1.unykorn.org 8.8.8.8
nslookup guardian.l1.unykorn.org 8.8.8.8
nslookup api.l1.unykorn.org 8.8.8.8

# Check HTTPS connectivity
curl -v https://facilitator.l1.unykorn.org/health
curl -v https://rpc.l1.unykorn.org:3001
curl -v https://l1.unykorn.org
```

## Step 5: Verify via Automated Script

```powershell
.\scripts\ops\check-dns-resolution.ps1
```

---

## Rollback

If something breaks:
1. Delete the 4 NS records from Cloudflare
2. DNS will revert within TTL (usually 5 min for Cloudflare)
3. No other systems are affected — this is a forward-only change

---

## Cloudflare API Alternative

If you prefer CLI over the dashboard:

```powershell
$CF_TOKEN = "cfut_h4DGEoHBLT0qZN4aOVbyLYDc4cndPl7ixISRm22H385776d4"
$ZONE = "8aa6916f4c1c7e8e42130455dfd5c029"

$nameservers = @(
    "ns-600.awsdns-11.net",
    "ns-1855.awsdns-39.co.uk",
    "ns-1501.awsdns-59.org",
    "ns-307.awsdns-38.com"
)

foreach ($ns in $nameservers) {
    $body = @{
        type    = "NS"
        name    = "l1"
        content = $ns
        ttl     = 3600
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" `
        -Method POST `
        -Headers @{ Authorization = "Bearer $CF_TOKEN"; "Content-Type" = "application/json" } `
        -Body $body

    Write-Host "Added NS: $ns"
}
```

> **Note:** Use the read-only token above for verification. For writes, you need a token with DNS edit permissions.
