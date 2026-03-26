# UnyKorn Security Standard

> **Version**: 1.0 — Last updated: 2026-03-26

## Hard Rule

**No app should generate, store, or use privileged keys directly unless it is the designated signer service.**

All key generation, signing, and verification flows MUST go through the **rust-signer** service at `POST /keys/generate`, `POST /sign`, and `POST /verify`.

## Architecture Layers

### 1. Rust Signer (services/rust-signer)
- Ed25519 key generation and custody
- Policy-enforced signing (per-domain rules)
- SQLite metadata store (key records + audit log)
- HTTP API on port 4050 (configurable via `SIGNER_PORT`)

### 2. Signing Client (packages/signing-client)
- TypeScript HTTP client for the signer
- All TS services import `SigningClient` — never generate keys directly
- Includes type-safe request/response types matching the signer API

### 3. Wallet Policy (packages/wallet-policy)
- 10 system-level wallet domains (cold root, treasury, issuance, operations, etc.)
- 4 A2A agent wallet types (observer, execution, escrow, settlement_relay)
- `canExecute()` guard for client-side fast-fail before hitting the signer

### 4. Security Config (packages/security-config)
- Secret provider abstraction (env, static, chain)
- Per-environment configuration (dev, staging, production)
- TLS enforcement in production

### 5. Audit Events (packages/audit-events)
- Structured append-only audit trail
- Event categories: key_generate, sign_request, sign_reject, sign_success, etc.
- AuditSink interface for pluggable persistence

## Key Lifecycle

1. **Generation**: `POST /keys/generate` with domain + actor_id
2. **Usage**: `POST /sign` with key_id + domain + action + payload
3. **Rotation**: `POST /keys/{id}/rotate` — revokes old, creates new
4. **Revocation**: Keys can be revoked (soft delete in metadata)

## Audit Requirements

Every key operation is logged:
- Key generation (who, domain, when)
- Signing (payload hash, domain, action, result)
- Policy rejections (reason, domain, action)
- Key rotations (old → new)

## Environment Controls

| Control | Development | Staging | Production |
|---------|------------|---------|------------|
| TLS Required | No | No | **Yes** |
| Signer Timeout | 30s | 10s | 5s |
| Audit Retention | 30 days | 90 days | 365 days |
| Key Namespace | unykorn-development | unykorn-staging | unykorn-production |
