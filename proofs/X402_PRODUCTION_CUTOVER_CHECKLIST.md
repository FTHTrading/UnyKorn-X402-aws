# X402 Production Cutover Checklist

**Status:** PRE-PRODUCTION — LOCAL_PROOF verified, AWS staging not yet deployed  
**Last updated:** 2026-05-08

Each item must be checked before changing `LIVE_SETTLEMENT_ENABLED` to `true`.

---

## Phase 1: Apostle Chain — Real Binary

- [ ] Locate or rebuild `apostle-chain` Rust binary (last known location: EC2)
- [ ] Confirm binary responds to `GET /health` with `{"operational":true,"chain_id":7332}`
- [ ] Confirm binary responds to `POST /v1/airdrop` with correct `{ ok, results }` format
- [ ] Confirm `POST /v1/tx` accepts `TxEnvelope` and returns `{ ok, tx_hash }`
- [ ] Confirm `GET /v1/agent/:id/balance` returns `{ balances: { ATP: "..." } }`
- [ ] Confirm block height advances on real transactions (not stub increment)
- [ ] Confirm ledger persists across process restarts (SQLite/RocksDB data directory)
- [ ] Deploy binary to EC2 with `systemd` unit for auto-restart

## Phase 2: Operator Signing Key

- [ ] Generate Ed25519 keypair for operator (if not already in EC2 `.env`)
- [ ] Register operator agent on chain via `/v1/agents/register` or airdrop genesis
- [ ] Store `X402_OPERATOR_PRIVATE_KEY` (64-char hex seed) in AWS Secrets Manager or encrypted `.env`
- [ ] Store `X402_OPERATOR_AGENT_ID` (bare UUID) alongside key
- [ ] Confirm key NEVER appears in Git history or logs
- [ ] Verify `toSecretKey()` in gateway parses the key correctly (32-byte seed → 64-byte nacl key)

## Phase 3: Gateway Live Mode

- [ ] Set `X402_MODE=live` in gateway `.env`
- [ ] Set `X402_DEV_MOCK=false` (already done)
- [ ] Set `APOSTLE_URL=http://127.0.0.1:7332` (or AWS private IP if separate EC2)
- [ ] Rebuild gateway: `npx tsc` — exit 0
- [ ] Restart gateway: confirm startup log shows `[LIVE ATP MODE]` not `[STAGED MODE]`
- [ ] Verify `GET /health` returns `real_settlement_active: true`

## Phase 4: End-to-End Live Settlement Test

- [ ] Run `test-webhook.ps1` against AWS gateway (update URL if needed)
- [ ] Confirm HTTP 200 `{"received":true}`
- [ ] Confirm gateway log shows `[stripe-onramp] Credited N ATP to agent:...`
- [ ] Confirm chain balance updated via `GET /v1/agent/:id/balance` on real chain
- [ ] Confirm `tx_hash` returned from `/v1/tx` is 64-char hex (real block inclusion)
- [ ] Confirm block height advances (proves real consensus, not stub)
- [ ] Run a **second** webhook with same event ID — confirm deduplication blocks double-credit

## Phase 5: Infrastructure & Reliability

- [ ] `systemd` unit for Apostle Chain configured and enabled
- [ ] `systemd` unit for x402 gateway configured and enabled
- [ ] Both services auto-restart after crash (`Restart=on-failure`)
- [ ] Cloudflare Tunnel points to AWS origin (not laptop `127.0.0.1`)
- [ ] `x402-origin.unykorn.org` CNAME → AWS-hosted tunnel
- [ ] Health check endpoint monitored (UptimeRobot, CF Health Checks, or equivalent)
- [ ] Log rotation configured for gateway and chain logs
- [ ] Airdrop log archived to S3 or persistent storage

## Phase 6: Security Hardening

- [ ] No secrets in any committed file or Git history
- [ ] Apostle RPC port 7332 NOT exposed publicly (security group: internal only)
- [ ] Gateway port 4020 behind Cloudflare Tunnel only (not directly exposed)
- [ ] Stripe webhook secret rotated after any potential exposure
- [ ] Admin Bearer token (`ADMIN_TOKEN`) rotated and stored securely
- [ ] SSH access to EC2 documented and limited to named individuals
- [ ] IAM role for EC2 uses least privilege (no wildcard S3/IAM permissions)

## Phase 7: Monitoring & Observability

- [ ] Gateway logs structured JSON (or at minimum searchable text)
- [ ] Chain airdrop log shipped to CloudWatch or Loki
- [ ] Alert on: gateway 5xx rate, chain unreachable, HMAC failures, duplicate events
- [ ] Dashboard shows: total ATP credited, webhook event count, chain height

## Phase 8: Public Claim Update

- [ ] Only after Phase 1–7 complete, update truth labels:
  - `APOSTLE_CHAIN_TYPE`: `AWS_RUST_CHAIN_STAGING` → `PRODUCTION`
  - `LIVE_SETTLEMENT_ENABLED`: `true`
  - `LOCAL_PROOF_ONLY`: `false`
- [ ] Update `proofs/X402_TRUTH_LABELS.json`
- [ ] Update any public site content to reflect live settlement status
- [ ] Do NOT use "mainnet live" language until this checklist is 100% complete

---

## Quick Reference: Remaining Blockers (as of 2026-05-08)

| Blocker | Priority |
|---|---|
| Apostle Chain binary on EC2 | P0 |
| `X402_OPERATOR_PRIVATE_KEY` configured | P0 |
| `X402_MODE=live` validated end-to-end | P0 |
| AWS systemd units deployed | P1 |
| Cloudflare Tunnel moved to AWS origin | P1 |
| Monitoring/alerting | P2 |
