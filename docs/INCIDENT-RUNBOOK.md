# UnyKorn Security Incident Runbook

> **Version**: 1.0 — Last updated: 2026-03-26

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **P0** | Key compromise, unauthorized signing | Immediate |
| **P1** | Signer service down, policy bypass | < 15 min |
| **P2** | Audit gaps, config drift | < 1 hour |
| **P3** | Warning thresholds hit | Next business day |

---

## P0: Key Compromise

### Symptoms
- Unauthorized signatures detected in audit log
- Key used from unknown actor_id
- Signature on unexpected payload

### Response

1. **Revoke the compromised key immediately**
   ```bash
   # Via signer API (if accessible)
   curl -X POST http://127.0.0.1:4050/keys/{key_id}/rotate \
     -H "Content-Type: application/json" \
     -d '{"actor_id": "incident-response"}'
   ```

2. **If signer is compromised, stop the signer process**
   ```bash
   # Kill the signer binary
   taskkill /F /IM rust-signer.exe   # Windows
   kill -9 $(pgrep rust-signer)      # Linux
   ```

3. **Freeze the affected domain**
   - Identify all keys in the compromised domain
   - Revoke each key via the API or directly in SQLite
   - Notify all downstream services

4. **Audit trail review**
   ```bash
   curl http://127.0.0.1:4050/audit?limit=1000
   ```
   - Identify all operations by the compromised key
   - Cross-reference with ledger entries

5. **Rotate all keys in the affected domain**
   - Generate new keys via `/keys/generate`
   - Update all service references

---

## P1: Signer Service Down

### Symptoms
- Health check returns non-200
- Agent registration fails with 502 (signer unavailable)
- Signing requests timeout

### Response

1. **Check signer process**
   ```bash
   curl http://127.0.0.1:4050/health
   ```

2. **Restart if needed**
   ```bash
   cd services/rust-signer
   SIGNER_PORT=4050 SIGNER_DB_URL="sqlite:signer.db?mode=rwc" \
     cargo run --release
   ```

3. **Verify SQLite database integrity**
   ```bash
   sqlite3 signer.db "PRAGMA integrity_check;"
   ```

4. **Check recent audit for anomalies**
   ```bash
   curl http://127.0.0.1:4050/audit?limit=20
   ```

---

## P1: Policy Bypass Detected

### Symptoms
- Audit log shows `sign_success` for domain/action that should be denied
- Amount exceeds configured limits

### Response

1. **Stop the signer immediately** (treat as potential compromise)
2. **Review policy.rs** — verify `default_policy()` returns correct rules
3. **Check for code changes** — `git log --oneline services/rust-signer/`
4. **Rebuild from known-good commit** if tampering detected
5. **Audit all signatures since last known-good state**

---

## P2: Audit Gaps

### Symptoms
- Missing audit events for known operations
- Sequence gaps in audit IDs

### Response

1. **Check SQLite disk space and write permissions**
2. **Verify signer logs for write errors**
3. **Cross-reference with application logs**
4. **If data loss confirmed, note the gap window and investigate cause**

---

## P3: Threshold Warnings

### Symptoms
- Domain approaching daily limit
- High volume of policy rejections
- Unusual actor patterns

### Response

1. **Review audit log for the domain**
2. **Verify the activity is legitimate**
3. **Adjust limits if needed** (requires code change + rebuild)
4. **Document in change log**

---

## Contact

| Role | Responsibility |
|------|---------------|
| Security Lead | P0/P1 response, key rotation authority |
| Ops Lead | P1/P2 response, service restarts |
| Dev Lead | P2/P3 investigation, policy changes |
