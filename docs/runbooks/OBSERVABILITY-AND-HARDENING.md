# Observability & Hardening Runbook

> **Created:** 2026-03-28  
> **Scope:** CloudWatch, WAF, alerting, monitoring, operational hardening

---

## Current IaC State

The Terraform observability module already provisions:

| Resource | Status | Notes |
|----------|--------|-------|
| CloudWatch Log Groups | ✅ Defined | `/unykorn/{alpha,bravo,charlie,delta,echo}` + `/unykorn/chain`, 30-day retention |
| CloudWatch Dashboard | ✅ Defined | CPU, Network I/O, Disk I/O, Block Height + TPS |
| CPU Alarm (per node) | ✅ Defined | >85% for 15 min |
| Status Check Alarm | ✅ Defined | StatusCheckFailed, **alarm_actions = []** (no SNS) |
| Prometheus Workspace | ✅ Defined | AMP alias `unykorn-l1-devnet` |
| Grafana Workspace | ⚠️ Optional | `enable_grafana = false` by default |
| WAF Web ACL | ✅ Defined | 4 rules: CommonRuleSet, BadInputs, IPReputation, RateLimit (2000/5min) |
| WAF Logging | ✅ Defined | To CloudWatch, 30-day retention |

---

## Gap 1: ~~SNS Alerting Not Wired~~ ✅ Done

**Status:** SNS topic `aws_sns_topic.alerts` and email subscription (kevan@unykorn.org) are wired to all CloudWatch alarms in `modules/observability/main.tf`. CPU, status-check, and ALB unhealthy-host alarms all have `alarm_actions` and `ok_actions` set. Confirm the SNS email subscription is verified (check inbox and click "Confirm subscription").

---

## Gap 2: ~~No ALB Health Check Alarms~~ ✅ Done

**Status:** `aws_cloudwatch_metric_alarm.alb_unhealthy_hosts` is defined in `modules/observability/main.tf` and sends to the SNS alerts topic. No action needed.

---

## Gap 3: Service-Level Health Monitoring — RESOLVED

**CloudWatch Synthetics canary deployed** (`aws_synthetics_canary.fth_pay_health`):

| Service | URL | Canary Name | Schedule |
|---------|-----|-------------|----------|
| FTH Pay API | `https://fth-api.unykorn.org/health` | `unykorn-l1-health` | `rate(5 minutes)` |

Alarm `unykorn-l1-devnet-canary-failed` fires to SNS `unykorn-l1-alerts` when `SuccessPercent < 100%` for 2 consecutive periods.
Artifacts stored in S3 `unykorn-l1-devnet-canary-933629770808`.

Additional synth canaries for Apostle Chain, Genesis Ledger, and Agent Gateway can be added to the same module.

---

## Gap 4: ~~WAF Rate Limit vs App Rate Limit Mismatch~~ ✅ Done

| Layer | Limit | Window |
|-------|-------|--------|
| WAF (Terraform) | 2,000 req | 5 min per IP |
| FTH Pay (Express) | 2,000 req | 15 min per real IP |

The previous mismatch (100 app / 2000 WAF) has been resolved. App default is now 2000 `RATE_LIMIT_MAX`. Health check route is moved before the rate limiter, so ALB checks always return 200. WAF Rule 0 (`AllowVPCIPs`) exempts VPC-internal IPs from rate limiting.

---

## Gap 5: ~~No Custom Metric Publishing~~ ✅ Done

**Status:** `aws/scripts/publish-metrics.sh` deployed to `/opt/unykorn/scripts/publish-metrics.sh` on the alpha EC2 node. Cron runs every minute:

```
* * * * * NODE_NAME=alpha CHAIN_RPC_PORT=7332 /opt/unykorn/scripts/publish-metrics.sh >> /var/log/unykorn/metrics.log 2>&1
```

IAM role `fth-pay-ec2-role` has inline policy `CloudWatchMetricsPublisher` granting `cloudwatch:PutMetricData`. Metrics visible in CloudWatch under namespace `UnyKorn/L1` (BlockHeight, RegisteredAgents, MempoolSize, PeersConnected).

**Note:** This EC2 is the fth-pay API server, not an L1 chain node — so BlockHeight will be 0 until the apostle-chain is also deployed here or the script is duplicated to the actual L1 nodes. When L1 nodes are deployed, copy the script and install the cron as part of `bootstrap-node.sh`.

---

## Hardening Checklist

- [x] Wire SNS topic to all CloudWatch alarms — `modules/observability/main.tf` (alarm_actions wired)
- [x] Add alarm for ALB UnHealthyHostCount — `modules/observability/main.tf` (aws_cloudwatch_metric_alarm.alb_unhealthy_hosts)
- [x] Raise `RATE_LIMIT_MAX` to 1000+ — default is 2000/15min in `config/index.ts`; health check moved before rate limiter
- [x] Enable OFAC geo-blocking rule in WAF — Rule 5 (GeoBlock: KP, IR, CU, SY) active in `modules/waf/main.tf`
- [x] Deploy custom metric publisher on alpha EC2 — `/opt/unykorn/scripts/publish-metrics.sh`, cron runs every minute, publishes to `UnyKorn/L1` namespace
- [x] Add WAF rate-limit bypass for internal VPC health check IPs — `aws_wafv2_ip_set.vpc` + Rule 0 (AllowVPCIPs) added to `modules/waf/main.tf`
- [x] Enable CloudTrail logging — `aws_cloudtrail.main` added to `modules/observability/main.tf` with S3 + CloudWatch Logs destination
- [ ] Enable Grafana (`enable_grafana = true` in tfvars + AWS SSO required)
- [x] Set up CloudWatch Synthetics canary for `fth-api.unykorn.org/health` — `aws_synthetics_canary.fth_pay_health` in `modules/observability/main.tf`, runtime `syn-nodejs-puppeteer-9.1`, schedule `rate(5 minutes)`, alarm on `SuccessPercent < 100%` → SNS
- [x] Rotate all `.env` secrets and move to AWS Secrets Manager — 8 KMS-encrypted secrets in `modules/secrets/main.tf` applied (`unykorn/x402/app`, `unykorn/fth-pay/{app,blockchain-evm,blockchain-xrpl,blockchain-stellar,blockchain-other,api-keys,email}`), populated via `aws/scripts/migrate-secrets.ps1`
