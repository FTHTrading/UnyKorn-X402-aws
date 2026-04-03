# Unresolved Issues

> These issues were **intentionally not fixed** in this audit cycle — either because they require operational decisions, are not currently exploitable, or need coordinated deployment changes. Each entry includes a specific recommended action.

---

## L-1 — SSM Command Safety: Prefix-Matching Instead of Exact Allowlist

**File:** `packages/fth-guardian/src/routes/commands.ts`
**Severity:** LOW (not exploitable today) → CRITICAL when implemented
**OWASP:** A01 Broken Access Control

### Description

The `POST /api/commands/ssm` route contains a safety check using prefix-matching:

```typescript
if (!command.startsWith('docker logs') && !command.startsWith('systemctl status')) {
  return reply.status(400).send({ error: 'Unsafe SSM command' });
}
```

This pattern passes strings like `docker logs --follow /etc/passwd` or `docker logs; rm -rf /`. The route currently returns a placeholder note ("SSM execution would be implemented here"), so it is **not exploitable today**. However if SSM execution is ever wired in with this safety check in place, it becomes a remote command injection vulnerability for any authenticated service-token holder.

### Recommended Fix

Replace the prefix check with an exact-match allowlist, matching the pattern used for `/api/commands/exec`:

```typescript
const SAFE_SSM_COMMANDS = new Set([
  'docker logs fth-guardian',
  'docker logs fth-x402-treasury',
  'docker logs fth-x402-facilitator',
  'docker logs fth-x402-gateway',
  'systemctl status docker',
  'systemctl status fth-guardian',
]);

if (!SAFE_SSM_COMMANDS.has(command)) {
  return reply.status(400).send({
    error: 'Disallowed SSM command',
    allowed: [...SAFE_SSM_COMMANDS],
  });
}
```

**Priority:** Fix this before any SSM execution is implemented.

---

## L-2 — Treasury db.ts: Hardcoded Fallback Password `"fth_dev"`

**File:** `packages/fth-x402-treasury/src/db.ts`
**Severity:** LOW
**OWASP:** A07 Identification and Authentication Failures

### Description

The PostgreSQL connection pool is created with:

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  password: process.env.PGPASSWORD ?? 'fth_dev',
  // ...
});
```

If `PGPASSWORD` (or the embedded credentials in `DATABASE_URL`) are absent in a production deployment, the service silently falls back to the hardcoded dev credential. In misconfigured environments this causes:

1. A confusing auth error that looks like a network issue
2. Possible accidental connection to a dev/staging database if one exists with that password

### Current Production Mitigation

The `.env.example` documents `PGPASSWORD` as required. The EC2 deployment's `.env` file has this set. There is no enforced startup validation, only the convenience fallback.

### Recommended Fix

Add an explicit fail-fast when `NODE_ENV=production` and the credential is absent:

```typescript
const pgPassword = process.env.PGPASSWORD;
if (!pgPassword && process.env.NODE_ENV === 'production') {
  console.error('[DB] FATAL: PGPASSWORD is required in production');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  password: pgPassword ?? 'fth_dev',
  // ...
});
```

Or, preferably, rely solely on `DATABASE_URL` which should already embed credentials, and remove the separate `password` field entirely:

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## Deployment Warning — M-3 Breaking Change

**This is not an unresolved bug; it is a coordination requirement for the fixes already applied.**

### What Changed

`fth-x402-core/src/auth.ts` — `buildSignatureMessage` now accepts a `secret` parameter and uses it to key the body HMAC. Previously, the body was hashed with the hardcoded string `"fth-body"` as the HMAC key.

### Impact

**The canonical message format used for signature verification has changed.** Any service running the old `fth-x402-core` will reject requests from services running the new version, and vice versa.

### Services Affected

| Service | Package | Port |
|---------|---------|------|
| fth-x402-treasury | `packages/fth-x402-treasury` | 3200 |
| fth-guardian | `packages/fth-guardian` | 3300 |
| fth-x402-facilitator | `packages/fth-x402-facilitator` | (facilitator port) |
| fth-x402-gateway | `packages/fth-x402-gateway` | (gateway port) |

### Required Action

All four services must be rebuilt and redeployed in a **coordinated simultaneous rollout**. A partial deploy (e.g., treasury updated but gateway not) will break inter-service authentication until all services are on the new version.

**Rollout checklist:**

1. Build all four Docker images from the updated source
2. Push all four to ECR
3. Update `docker-compose.yml` image tags for all four services simultaneously
4. Do a single `docker compose up -d` to replace all containers at once
5. Verify `/health` endpoints on all services before removing old containers

---

## Production Ops Notes (from this audit)

These are non-finding operational notes that should be actioned before the next deploy:

| Item | Action |
|------|--------|
| `CORS_ORIGIN` | Set to `https://app.unykorn.org` (or comma-separated list) in fth-pay EC2 `.env` |
| `METRICS_PUBLIC` | Set to `true` in fth-guardian `.env` if Prometheus scraping is desired |
| M-3 coordinated rollout | All x402 services must be redeployed together before any inter-service calls resume |
