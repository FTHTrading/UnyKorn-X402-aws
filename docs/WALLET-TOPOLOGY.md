# UnyKorn Wallet Topology

> **Version**: 1.0 — Last updated: 2026-03-26

## System Wallet Domains (Infrastructure)

These are baked into the rust-signer and cannot be changed at runtime.

| Domain | Purpose | Can Sign Directly | Daily Limit |
|--------|---------|-------------------|-------------|
| `cold_root_governance` | Root governance keys | No (multisig) | $0 (offline) |
| `treasury_vault` | Treasury operations | No (multisig) | $1,000,000 |
| `issuance_control` | Token minting/burning | Yes | $500,000 |
| `upgrade_admin` | Protocol upgrades | No (requires human) | $0 |
| `operations` | Day-to-day operations | Yes | $50,000 |
| `burner` | Token burning only | Yes | $100,000 |
| `agent_execution` | Agent task execution | Yes | $10,000 |
| `agent_escrow` | Agent escrow locks | Yes | $50,000 |
| `agent_settlement` | Settlement relay | Yes | $100,000 |
| `agent_observer` | Read-only agent accounts | No | $0 |

## A2A Agent Wallet Types (Per-Agent)

Each registered agent gets ONE wallet policy. These map to system domains:

| Wallet Type | System Domain | Allowed Actions | Per-Tx Limit |
|-------------|---------------|-----------------|-------------|
| `observer` | agent_observer | view | $0 |
| `execution` | agent_execution | view, transfer, lock, settle | $5,000 |
| `escrow` | agent_escrow | view, lock, release | $10,000 |
| `settlement_relay` | agent_settlement | view, transfer, settle | $25,000 |

## Key Flow

```
Agent Registration
       │
       ▼
  agent-gateway
       │
       ▼ POST /keys/generate (domain: agent_execution)
  rust-signer
       │
       ├── Generate Ed25519 keypair
       ├── Store metadata in SQLite
       ├── Log audit event
       └── Return key_id + public_key_hex
       │
       ▼
  agent-gateway stores public_key on Agent record
  (private key NEVER leaves signer boundary)
```

## Signing Flow

```
Agent needs to sign a settlement
       │
       ▼
  TS service calls SigningClient.sign()
       │
       ▼ POST /sign
  rust-signer
       │
       ├── Evaluate policy (domain rules)
       │     ├── Action allowed?
       │     ├── Amount within limits?
       │     ├── Counterparty in allowlist?
       │     └── Asset in allowlist?
       │
       ├── If rejected → 403 + audit log
       │
       ├── If allowed → sign with Ed25519
       ├── Log audit event
       └── Return signature_hex + policy_decision
```

## Domain Isolation

Keys in one domain cannot be used to sign for another domain.
The signer enforces this at the API layer — the `domain` in the sign request
must match the `domain` of the key.
