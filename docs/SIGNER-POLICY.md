# UnyKorn Signer Policy Reference

> **Version**: 1.0 — Last updated: 2026-03-26

## Policy Evaluation

Every `POST /sign` request is evaluated against the domain's policy BEFORE the key is touched.

### Evaluation Order

1. **Action allowlist** — Is this action permitted for this domain?
2. **Counterparty allowlist** — If restricted, is the counterparty approved?
3. **Asset allowlist** — If restricted, is the asset approved?
4. **Per-transaction limit** — Does the amount exceed the domain's per-tx cap?
5. **Can sign directly** — Does this domain allow direct signing, or require multisig?
6. **Approval threshold** — Does the amount require human approval?

If ANY check fails, the request is rejected with a 403 and an audit event is logged.

## Default Policies

### cold_root_governance
- **Allowed actions**: rotate
- **Can sign directly**: No
- **Requires human approval**: Yes
- **Daily limit**: $0 (offline only)
- **Notes**: Root keys are for governance votes and key rotation only

### treasury_vault
- **Allowed actions**: transfer, lock, release, approve
- **Can sign directly**: No (multisig required)
- **Requires human approval**: Yes
- **Daily limit**: $1,000,000
- **Per-tx limit**: $250,000

### issuance_control
- **Allowed actions**: mint, burn
- **Can sign directly**: Yes
- **Requires simulation**: Yes
- **Daily limit**: $500,000
- **Allowed assets**: UNY

### upgrade_admin
- **Allowed actions**: upgrade
- **Can sign directly**: No
- **Requires human approval**: Yes
- **Daily limit**: $0

### operations
- **Allowed actions**: transfer, settle, approve, dapp_connect
- **Can sign directly**: Yes
- **Daily limit**: $50,000
- **Per-tx limit**: $5,000

### burner
- **Allowed actions**: burn
- **Can sign directly**: Yes
- **Daily limit**: $100,000
- **Allowed assets**: UNY

### agent_execution
- **Allowed actions**: transfer, lock, settle
- **Can sign directly**: Yes
- **Requires simulation**: Yes
- **Daily limit**: $10,000
- **Per-tx limit**: $5,000
- **Allowed assets**: UNY, USDC

### agent_escrow
- **Allowed actions**: lock, release
- **Can sign directly**: Yes
- **Requires simulation**: Yes
- **Daily limit**: $50,000
- **Per-tx limit**: $10,000

### agent_settlement
- **Allowed actions**: transfer, settle
- **Can sign directly**: Yes
- **Requires simulation**: Yes
- **Daily limit**: $100,000
- **Per-tx limit**: $25,000

### agent_observer
- **Allowed actions**: (none)
- **Can sign directly**: No
- **Daily limit**: $0
- **Notes**: Read-only. Cannot sign anything.

## Policy Decisions

Every evaluation produces a `PolicyDecision`:

```json
{
  "allowed": true|false,
  "reason": "human-readable explanation",
  "requires_human_approval": true|false,
  "requires_simulation": true|false
}
```

## Audit Trail

All policy evaluations (allowed AND rejected) are logged to the signer's audit table:

| Field | Description |
|-------|-------------|
| key_id | Which key was involved |
| action | generate / sign / rotate / reject |
| domain | Wallet domain |
| actor_id | Who initiated |
| payload_hash | SHA-256 of payload (if signing) |
| result | success / rejected |
| reason | Human-readable |
| timestamp | ISO-8601 |
