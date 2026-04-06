# OpenClaw Hardening — Ops Baseline

**Date**: 2026-04-06  
**Branch**: `main` (merged from `feat/openclaw-hardening`)  
**Tag**: `v1.0.0-hardening`

## Commits

| SHA | Description |
|---|---|
| `5ec65da` | feat(openclaw): add hardening suite — 24 files, 3801 insertions |
| `d7b3cd6` | Merge feat/openclaw-hardening into main (PR #1) |

## Golden Path Results (2026-04-06)

### Unit Tests — 104/104 pass

```
tests 104 | suites 26 | pass 104 | fail 0 | duration_ms ~112
```

### Config Validation — 6/6 PASS

```
✓ CONFIG: PASS
✓ PROVIDERS: PASS
✓ PLUGINS: PASS        (⚠ No plugins configured — expected)
✓ MEMORY: PASS
✓ CRON: PASS
✓ DELIVERYQUEUE: PASS
```

### Smoke Test — 11/11 pass, 0 fail, 1 warning

```
[1/8] Config Validation     — 3 PASS
[2/8] Gateway Health        — 1 PASS (28ms)
[3/8] Plugin Health         — 1 PASS, 1 WARN (no plugins)
[4/8] Ollama / Inference    — 2 PASS (6 models)
[5/8] Cron Job Validation   — 1 PASS
[6/8] Delivery Queue        — 1 PASS (0 entries)
[7/8] Memory Embedding      — 2 PASS (768 dims)
[8/8] Startup Summary       — reported
```

## Live Config State

**File**: `~/.openclaw/cron/jobs.json`  
**Encoding**: UTF-8 (no BOM)

All 4 cron jobs have explicit `delivery.mode`:

| Job | ID | delivery.mode |
|---|---|---|
| health-monitor | `0a51f...` | `none` |
| revenue-scan | `3b72e...` | `none` |
| docker-watchdog | `7c83d...` | `none` |
| Check Docker Container Health | `e204a...` | `none` |

**Fix applied this session**: The "Check Docker Container Health" job had no `delivery` field. Added `delivery: { mode: "none" }` and re-encoded as UTF-8 without BOM (Windows PowerShell `Set-Content -Encoding utf8` writes BOM; used `[System.IO.File]::WriteAllText()` with `UTF8Encoding($false)`).

## Known Non-Blocking Issues

### Node.js libuv exit race on Windows (smoke-test.mjs)

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

- **Impact**: None — occurs *after* `SMOKE TEST PASSED` is printed and `process.exit(0)` is called.
- **Root cause**: libuv race condition during `process.exit()` when outbound HTTP sockets (gateway health check, Ollama connectivity) are still closing. Known Node.js issue on Windows ([nodejs/node#50328](https://github.com/nodejs/node/issues/50328)).
- **Fix**: Drain open handles before exiting. Patch applied in commit following this baseline (see `smoke-test.mjs` graceful-exit patch).

## Deliverables Summary

| Deliverable | Count |
|---|---|
| ESM source modules | 12 |
| PS1 operator scripts | 8 |
| Unit tests (node:test) | 104 |
| Runbooks | 2 (Operations + Closeout) |
| Root npm scripts | 4 (`openclaw:validate`, `openclaw:smoke`, `openclaw:backup`, `openclaw:test`) |
