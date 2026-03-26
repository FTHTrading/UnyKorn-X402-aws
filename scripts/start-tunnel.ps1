# start-tunnel.ps1 — Start a Cloudflare quick tunnel to expose the Facilitator
# Usage: .\scripts\start-tunnel.ps1
#
# IMPORTANT: The quick tunnel generates a random subdomain each run.
# After starting, update wrangler.toml [env.staging.vars] FACILITATOR_URL
# with the new tunnel URL and redeploy:
#   cd packages/fth-x402-gateway
#   npx wrangler deploy --env staging
#
# The --config flag tells cloudflared to ignore the default config.yml
# (which has a catch-all http_status:404 rule that blocks quick tunnels).

$ErrorActionPreference = "Stop"
$logFile = Join-Path $PSScriptRoot "..\tunnel.log"

# Kill any existing cloudflared processes
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1

Write-Host "Starting Cloudflare quick tunnel -> http://127.0.0.1:3100"
Write-Host "Log file: $logFile"
Write-Host ""

# Start with explicit 127.0.0.1, HTTP/2 protocol, and no default config
Start-Process cloudflared `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:3100", "--no-tls-verify", "--protocol", "http2", "--config", "NUL" `
    -RedirectStandardError $logFile `
    -NoNewWindow -PassThru | Out-Null

# Wait for tunnel URL to appear in log
$maxWait = 30
$elapsed = 0
$tunnelUrl = $null
while ($elapsed -lt $maxWait) {
    Start-Sleep 2
    $elapsed += 2
    $match = Get-Content $logFile -ErrorAction SilentlyContinue | Select-String "https://.*\.trycloudflare\.com"
    if ($match) {
        $tunnelUrl = ($match.Matches[0].Value -replace "\s.*$","").Trim()
        break
    }
}

if ($tunnelUrl) {
    Write-Host "Tunnel is LIVE:"
    Write-Host "  $tunnelUrl" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Update wrangler.toml [env.staging.vars] FACILITATOR_URL = `"$tunnelUrl`""
    Write-Host "  2. cd packages/fth-x402-gateway && npx wrangler deploy --env staging"
    Write-Host "  3. Test: curl https://fth-x402-gateway-staging.kevanbtc.workers.dev/health"
} else {
    Write-Host "Tunnel did not start within ${maxWait}s. Check $logFile" -ForegroundColor Red
}
