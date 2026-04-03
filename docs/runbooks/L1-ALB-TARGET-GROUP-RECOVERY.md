# L1 ALB Target Group Recovery Runbook

> **Blockers:** B4 (facilitator rate-limited), B8 (API unhealthy), B9 (dashboard unhealthy), B10 (FinCore unused)  
> **Impact:** Public endpoints return 502/503 even after DNS is fixed  

---

## Overview

The ALB (`unykorn-l1-devnet-alb`) routes traffic via host-based and path-based rules to 7 target groups. Currently:

| Target Group | Port | Health Path | Health Matcher | Current State | Issue |
|-------------|------|-------------|----------------|---------------|-------|
| rpc | TCP 3001 (NLB) | TCP check | — | HEALTHY | — |
| facilitator | 3100 | /health | 200 | DEGRADED | Rate limiter 429s /health |
| treasury | 3200 | /health | 200 | UNHEALTHY | Service not running |
| guardian | 3300 | /health | 200 | UNHEALTHY | Service not running |
| api | 3001 | / | 200 | UNHEALTHY | RPC returns JSON-RPC error on GET / |
| dashboard | 3000 | / | 200 | UNHEALTHY | Service not running on alpha |
| fincore | 4400 | /health | 200 | UNUSED | Never deployed |

---

## Fix 1: API Target Group (B8)

**Root Cause:** The API target group health check sends `GET /` to port 3001. The chain RPC on 3001 is a JSON-RPC endpoint that expects POST requests. A GET to `/` returns a non-200 status (likely 404 or 405).

**Fix Options:**

### Option A: Change health check path in Terraform (Recommended)

In `aws/terraform/modules/load-balancing/main.tf`, change the API target group health check:

```hcl
resource "aws_lb_target_group" "api" {
  # ...
  health_check {
    path                = "/health"    # Was "/"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200,404"    # Accept 404 if /health not implemented
  }
}
```

### Option B: Add a GET /health endpoint to the RPC service

If the chain node has a health endpoint (common in Rust/Axum services), use that path.

### Option C: Fix via AWS CLI (immediate)

```powershell
$tgArn = (aws elbv2 describe-target-groups --names "unykorn-l1-devnet-api" --query "TargetGroups[0].TargetGroupArn" --output text)
aws elbv2 modify-target-group --target-group-arn $tgArn --health-check-path "/health" --matcher "HttpCode=200,404"
```

---

## Fix 2: Dashboard Target Group (B9)

**Root Cause:** No dashboard process is running on alpha:3000. The user data script starts the chain node Docker container but doesn't start a dashboard.

**Fix Options:**

### Option A: Deploy dashboard to alpha

Deploy the dashboard app to alpha's Docker. The dashboard service is defined in `aws/docker/` but was never deployed.

### Option B: Remove dashboard target group

If the dashboard isn't needed yet, remove the target group and ALB default action. The current ALB default forwards to dashboard — change it to facilitator.

### Option C: Change ALB default action (immediate)

```powershell
# Point default action to facilitator instead of dead dashboard
$listenerArn = (aws elbv2 describe-listeners --load-balancer-arn <ALB_ARN> --query "Listeners[?Port==``443``].ListenerArn" --output text)
$facTgArn = (aws elbv2 describe-target-groups --names "unykorn-l1-x402-facilitator" --query "TargetGroups[0].TargetGroupArn" --output text)
aws elbv2 modify-listener --listener-arn $listenerArn --default-actions Type=forward,TargetGroupArn=$facTgArn
```

---

## Fix 3: Facilitator Rate Limiting (B4)

**Root Cause:** The facilitator's rate limiter (backed by PostgreSQL) doesn't exempt infrastructure health checks. ALB probes, daemon monitors, and manual checks all hit `GET /health` and get 429'd.

**Fix:** The rate limiter in `packages/fth-x402-facilitator/src/services/rate-limiter.ts` is a per-wallet PostgreSQL-backed limiter. The health endpoint is already in `PUBLIC_ROUTES` in auth.ts, meaning it bypasses auth. The 429 is likely coming from a different layer — possibly Fastify's built-in rate limiting or the WAF.

**Investigation Steps:**
1. Check if the facilitator has Fastify rate-limit plugin registered
2. Check WAF rules on the ALB
3. The rate limiter in rate-limiter.ts requires a `wallet_address` — health checks won't have one

**Most Likely Cause:** AWS WAF rate-based rule is blocking health check IPs that hit too frequently.

**WAF Fix:**
```powershell
# Check WAF rules
aws wafv2 list-web-acls --scope REGIONAL --query "WebACLs[].{Name:Name,ARN:ARN}" --output table
```

---

## Fix 4: FinCore Target Group (B10)

**Status:** Never deployed. The target group exists in Terraform but the fincore service is not running on delta.

**Recommendation:** Leave the target group in Terraform but document it as "planned". No ALB listener rule routes to it (it has a host-based rule but no traffic reaches it since DNS resolves to the ALB which has no matching host).

---

## Fix 5: Treasury (B2) and Guardian (B3) Services

**Root Cause:** Both services are not started locally. Ports 3200 and 3300 are not listening.

**Start Commands:**

```powershell
# Treasury
cd C:\Users\Kevan\UnyKorn-X402-aws
npx tsx packages/fth-x402-treasury/src/index.ts

# Guardian
cd C:\Users\Kevan\UnyKorn-X402-aws
npx tsx packages/fth-guardian/src/index.ts
```

Note: Both require DATABASE_URL and other env vars from `.env`. Use `dotenv` or source the env file first.

---

## Terraform Changes

Apply the API health check fix in the load-balancing module:

```hcl
# In modules/load-balancing/main.tf
# Change API target group health check from "/" to "/health"
# And change matcher to accept 200 or 404

resource "aws_lb_target_group" "api" {
  name     = "${var.project_name}-${var.environment}-api"
  port     = 3001
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/health"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200,404"
  }
}
```

---

## Verification

After fixes:

```powershell
# Check all target group health
$tgs = aws elbv2 describe-target-groups --query "TargetGroups[].TargetGroupArn" --output json | ConvertFrom-Json
foreach ($tg in $tgs) {
    $name = ($tg -split "/")[1]
    $health = aws elbv2 describe-target-health --target-group-arn $tg --query "TargetHealthDescriptions[0].TargetHealth.State" --output text
    Write-Host "$name : $health"
}
```
