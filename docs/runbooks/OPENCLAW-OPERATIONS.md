# OpenClaw Operations Runbook

> Production hardening guide based on confirmed incidents from the 5-phase remediation (2026-07).
> All tooling lives in `packages/openclaw-hardening/` with operator scripts in `scripts/ops/`.

---

## Table of Contents

1. [Quick Reference — Valid Delivery Modes](#1-valid-delivery-modes)
2. [Cron Model Resolution](#2-cron-model-resolution)
3. [Validation Commands](#3-validation-commands)
4. [Smoke Test](#4-smoke-test)
5. [Queue Management](#5-queue-management)
6. [Plugin Troubleshooting](#6-plugin-troubleshooting)
7. [Memory Provider](#7-memory-provider)
8. [State Backup & Restore](#8-state-backup--restore)
9. [Clean Startup Checklist](#9-clean-startup-checklist)
10. [Troubleshooting Reference](#10-troubleshooting-reference)
11. [Golden Path — Day-to-Day Operations](#11-golden-path--day-to-day-operations)
12. [Post-Incident Recovery](#12-post-incident-recovery)

---

## 1. Valid Delivery Modes

| Mode        | Behavior                                    |
|-------------|---------------------------------------------|
| `announce`  | Deliver to configured channel (Telegram)    |
| `webhook`   | POST to configured webhook URL              |
| `deliver`   | Generic outbound delivery                   |
| **`none`**  | **Suppress all outbound delivery**          |

### Critical: `silent` is NOT valid

The mode `"silent"` was the root cause of ghost delivery attempts.
OpenClaw's default-branch logic treats unrecognized modes as `"announce"`,
causing jobs intended to be quiet to still fire delivery attempts.

**These modes are all INVALID:** `silent`, `quiet`, `off`, `disabled`, `false`, `null`, `mute`

If no delivery is needed, **always use `"none"`.**

---

## 2. Cron Model Resolution

Cron jobs resolve their model through a 3-level precedence chain:

```
1. job.model          ← highest priority (job-level override in jobs.json)
2. agent.model        ← agent-level override (agents.list[0].model)
3. defaults.model     ← global fallback (agents.defaults.model.primary)
```

### Unsafe Providers for Cron

These providers require VS Code auth tokens that **do not exist in cron contexts**:

| Provider          | Safe for Cron? | Reason                          |
|-------------------|:--------------:|---------------------------------|
| `github-copilot`  | **NO**         | Requires VS Code session auth   |
| `copilot`         | **NO**         | Requires VS Code session auth   |
| `vscode-copilot`  | **NO**         | Requires VS Code session auth   |
| `ollama`          | YES            | Local, no auth needed           |
| `llamafile`       | YES            | Local, no auth needed           |
| `lmstudio`        | YES            | Local, no auth needed           |
| `localai`         | YES            | Local, no auth needed           |

### Known Incident

`agents.list[0].model` was set to `github-copilot/claude-opus-4.6`.
This overrode the global default for all cron jobs, causing silent failures.
**Fix:** Set agent model to a local provider:

```
openclaw config set agents.list.0.model "ollama/qwen2.5:7b"
```

### Diagnostic Command

```powershell
.\scripts\ops\openclaw-cron-resolve.ps1
```

---

## 3. Validation Commands

### Full Config Validation

Runs all sub-validators (config parse, providers, plugins, memory, cron, delivery queue):

```powershell
.\scripts\ops\openclaw-validate.ps1
# or
node packages/openclaw-hardening/src/validate-config.mjs
```

Exit code 0 = all clear, nonzero = failures found.

### What It Checks

| Area           | Checks                                              |
|----------------|-----------------------------------------------------|
| Config parse   | `openclaw.json` loads and is valid JSON              |
| Providers      | All providers have `models[]` with `id` + `name`    |
| Plugins        | Known-problematic plugins are disabled               |
| Memory         | Provider is explicit (not `auto`), embedding model exists |
| Cron           | All jobs have valid delivery modes + cron-safe models |
| Queue          | No stale/orphaned entries in delivery queue          |

---

## 4. Smoke Test

Full 8-section integration smoke test with pass/fail/warn counts:

```powershell
.\scripts\ops\openclaw-smoke.ps1
# or
node packages/openclaw-hardening/src/smoke-test.mjs
```

### Sections

1. **Config** — Parse and validate `openclaw.json`
2. **Gateway** — HTTP health check on port 18789
3. **Plugins** — Classify all plugins, flag problematic ones
4. **Ollama** — Connectivity check + model listing
5. **Cron** — Validate all jobs (delivery + model + provider)
6. **Queue** — Audit pending/failed delivery entries
7. **Memory** — Embedding endpoint reachability + dimension check
8. **Summary** — Formatted startup summary

---

## 5. Queue Management

### Inspect Queue

Shows all pending and failed queue entries with metadata:

```powershell
.\scripts\ops\openclaw-queue-inspect.ps1
```

### Purge Stale Entries

Dry run (preview what would be purged):

```powershell
.\scripts\ops\openclaw-queue-purge.ps1 -DryRun
```

Execute purge (archives to `.purged/` before deleting):

```powershell
.\scripts\ops\openclaw-queue-purge.ps1
```

### What Gets Purged

- Invalid JSON files
- Entries missing `jobId`
- Entries referencing deleted/unknown jobs
- Entries for jobs with `delivery.mode = "none"`
- Entries with `@heartbeat` target (invalid placeholder)
- Entries with invalid delivery modes (e.g. `"silent"`)

---

## 6. Plugin Troubleshooting

### Known-Problematic Plugins

| Plugin      | Issue                                        | Fix                    |
|-------------|----------------------------------------------|------------------------|
| `google`    | ajv schema compilation → stack overflow      | Disable in config      |
| `minimax`   | ajv schema compilation → stack overflow      | Disable in config      |

These plugins cause `RangeError: Maximum call stack size exceeded` during gateway
startup, which poisons the entire CLI session.

### Check Plugin Status

```powershell
.\scripts\ops\openclaw-plugins-status.ps1
```

### Disable a Plugin

In `~/.openclaw/openclaw.json` → `plugins.entries`:

```json
{ "name": "google", "enabled": false }
```

Or via CLI:

```
openclaw config set plugins.entries.0.enabled false
```

---

## 7. Memory Provider

### The Auto-Selection Bug

OpenClaw's Ollama embedding adapter does **not** set `autoSelectPriority`.
The `listAutoSelectAdapters()` function filters by `typeof autoSelectPriority === "number"`,
which silently skips Ollama. When all builtin providers fail (no API keys),
memory provider resolves to `null` → vector search disabled.

### Fix

Explicitly set the provider to `ollama`:

```
openclaw config set agents.defaults.memorySearch.provider ollama
```

### Check Status

```powershell
.\scripts\ops\openclaw-memory-status.ps1
```

### Required Setup

1. Ollama running at `localhost:11434`
2. `nomic-embed-text` model pulled: `ollama pull nomic-embed-text`
3. Memory search enabled: `agents.defaults.memorySearch.enabled = true`
4. Provider set explicitly: `agents.defaults.memorySearch.provider = "ollama"`

---

## 8. State Backup & Restore

### Create Backup

```powershell
.\scripts\ops\openclaw-backup-state.ps1
# or
node packages/openclaw-hardening/src/backup.mjs
```

Creates a timestamped backup in `~/.openclaw/backups/` containing:
- `openclaw.json` (redacted — tokens/API keys stripped)
- `openclaw.json.original` (full, for restore)
- `jobs.json` (cron configuration)
- Queue entries + memory content files
- `manifest.json` (timestamp, file list, versions)

### List Backups

```powershell
.\scripts\ops\openclaw-backup-state.ps1 -List
# or
node packages/openclaw-hardening/src/backup.mjs --list
```

### Restore

Backups include a `manifest.json` with restore instructions.
Copy files back from the backup directory to their original locations.

---

## 9. Clean Startup Checklist

Run before deploying changes or after incidents:

- [ ] **Config validates:** `.\scripts\ops\openclaw-validate.ps1` → exit 0
- [ ] **Delivery modes:** All cron jobs use valid modes (no `"silent"`)
- [ ] **Model resolution:** All cron jobs resolve to local providers
- [ ] **Plugins safe:** Google/minimax disabled
- [ ] **Memory provider:** Explicitly set to `ollama` (not `auto`)
- [ ] **Ollama running:** `curl http://localhost:11434/api/tags` returns models
- [ ] **Embedding works:** `nomic-embed-text` pulled and responding
- [ ] **Gateway healthy:** `curl http://127.0.0.1:18789/health` returns 200
- [ ] **Queue clean:** No stale entries in delivery queue
- [ ] **Smoke test passes:** `.\scripts\ops\openclaw-smoke.ps1` → exit 0

---

## 10. Troubleshooting Reference

### T1: Cron jobs silently fail

**Symptom:** Scheduled jobs run but produce no output or errors.

**Cause:** Model resolves to `github-copilot/*` which needs VS Code session auth.

**Fix:**
```
openclaw config set agents.list.0.model "ollama/qwen2.5:7b"
openclaw config set agents.defaults.model.primary "ollama/qwen2.5:7b"
```

**Verify:** `.\scripts\ops\openclaw-cron-resolve.ps1` — all jobs should show `ollama/*`.

---

### T2: Delivery attempts for "none" jobs

**Symptom:** Queue entries appear for jobs with `delivery.mode = "none"`.

**Cause:** Entries from before the mode was fixed, or a code path that enqueues before checking mode.

**Fix:** `.\scripts\ops\openclaw-queue-purge.ps1`

---

### T3: Gateway hangs on startup

**Symptom:** `openclaw` CLI hangs indefinitely after starting gateway.

**Cause:** `google` or `minimax` plugin enabled → ajv schema compilation stack overflow.

**Fix:** Disable in `openclaw.json`:
```json
{ "name": "google", "enabled": false },
{ "name": "minimax", "enabled": false }
```

**Verify:** `.\scripts\ops\openclaw-plugins-status.ps1`

---

### T4: Memory search returns no results

**Symptom:** `openclaw memory search "query"` returns empty even with indexed content.

**Cause:** Provider is `auto` → Ollama adapter skipped → vector search disabled.

**Fix:**
```
openclaw config set agents.defaults.memorySearch.provider ollama
```

**Verify:** `.\scripts\ops\openclaw-memory-status.ps1`

---

### T5: "silent" delivery mode causes ghost attempts

**Symptom:** Queue entries pile up in `delivery-queue/` and `delivery-queue/failed/`.

**Cause:** `"silent"` is not a valid mode — falls through to `"announce"` behavior.

**Fix:**
1. Change all `delivery.mode` from `"silent"` to `"none"` in `jobs.json`
2. Purge stale queue entries: `.\scripts\ops\openclaw-queue-purge.ps1`

---

### T6: Ollama embedding unreachable

**Symptom:** Memory indexing fails, smoke test reports embedding failure.

**Cause:** Ollama not running, or `nomic-embed-text` model not pulled.

**Fix:**
```powershell
ollama serve              # Start Ollama daemon
ollama pull nomic-embed-text   # Pull embedding model
```

**Verify:** `.\scripts\ops\openclaw-memory-status.ps1`

---

### T7: Provider model not found in config

**Symptom:** Validation warns "model not found in provider config".

**Cause:** Model string in agent/job config doesn't match any entry in `models.providers.*.models[]`.

**Fix:** Add the model to the appropriate provider's `models` array in `openclaw.json`:
```json
{
  "models": {
    "providers": {
      "ollama": {
        "models": [
          { "id": "qwen2.5:7b", "name": "Qwen 2.5 7B" }
        ]
      }
    }
  }
}
```

---

### T8: Cron error counters growing

**Symptom:** `openclaw status` shows increasing error counts on cron jobs.

**Diagnosis:** Run the full validation suite:
```powershell
.\scripts\ops\openclaw-validate.ps1
.\scripts\ops\openclaw-cron-resolve.ps1
```

**Common causes:** Invalid delivery mode, unreachable model provider, or stale queue entries.

---

### T9: Backup fails with permission error

**Symptom:** `openclaw-backup-state.ps1` errors on file access.

**Cause:** OpenClaw or gateway process has file locks.

**Fix:** Stop gateway first:
```
openclaw gateway stop
.\scripts\ops\openclaw-backup-state.ps1
openclaw gateway start
```

---

### T10: Queue entries reference deleted jobs

**Symptom:** Queue inspection shows entries with unknown `jobId`.

**Cause:** Job was removed from `jobs.json` but queue wasn't cleaned.

**Fix:** `.\scripts\ops\openclaw-queue-purge.ps1`

---

## Operator Scripts Reference

| Script                         | Purpose                          |
|--------------------------------|----------------------------------|
| `openclaw-validate.ps1`        | Full config validation           |
| `openclaw-smoke.ps1`           | 8-section integration smoke test |
| `openclaw-backup-state.ps1`    | Backup state (with redaction)    |
| `openclaw-queue-inspect.ps1`   | Inspect delivery queue entries   |
| `openclaw-queue-purge.ps1`     | Purge stale queue entries        |
| `openclaw-cron-resolve.ps1`    | Show cron model resolution chain |
| `openclaw-plugins-status.ps1`  | Plugin classification & health   |
| `openclaw-memory-status.ps1`   | Memory provider readiness        |

All scripts are in `scripts/ops/` and can be run from the repo root.

---

## npm Scripts

```
npm run openclaw:validate   # Config validation
npm run openclaw:smoke      # Full smoke test
npm run openclaw:backup     # State backup
npm run openclaw:test       # Run hardening test suite
```

---

## 11. Golden Path — Day-to-Day Operations

### Before Any Code Change

```powershell
# 1. Backup current state
.\scripts\ops\openclaw-backup-state.ps1

# 2. Validate config is clean
.\scripts\ops\openclaw-validate.ps1

# 3. Run test suite
npm run openclaw:test
```

### After Config Changes

```powershell
# 1. Validate the new config
.\scripts\ops\openclaw-validate.ps1

# 2. Run full smoke test (needs Ollama + gateway running)
.\scripts\ops\openclaw-smoke.ps1

# 3. Check cron model resolution (if you touched agents/models)
.\scripts\ops\openclaw-cron-resolve.ps1
```

### After OpenClaw Upgrade

```powershell
# 1. Backup before upgrading
.\scripts\ops\openclaw-backup-state.ps1

# 2. Upgrade OpenClaw (pip/npm/whatever)

# 3. Run full validation suite
.\scripts\ops\openclaw-validate.ps1
.\scripts\ops\openclaw-smoke.ps1

# 4. Check plugins haven't regressed
.\scripts\ops\openclaw-plugins-status.ps1

# 5. Verify memory provider survived upgrade
.\scripts\ops\openclaw-memory-status.ps1
```

### Weekly Maintenance

```powershell
# 1. Backup state
.\scripts\ops\openclaw-backup-state.ps1

# 2. Inspect and purge stale queue entries
.\scripts\ops\openclaw-queue-inspect.ps1
.\scripts\ops\openclaw-queue-purge.ps1 -DryRun   # preview
.\scripts\ops\openclaw-queue-purge.ps1            # execute if needed

# 3. Full smoke test
.\scripts\ops\openclaw-smoke.ps1
```

---

## 12. Post-Incident Recovery

### Step 1: Assess

```powershell
.\scripts\ops\openclaw-validate.ps1
# If exit code is nonzero, config is broken — proceed to Step 2.
```

### Step 2: Restore from Backup

```powershell
# List available backups (newest first)
node packages/openclaw-hardening/src/backup.mjs --list

# View restore instructions for a specific backup
node packages/openclaw-hardening/src/backup.mjs --restore <backup-dir>
```

Manual restore:
1. Copy `openclaw.json.original` from the backup to `~/.openclaw/openclaw.json`
2. Copy `jobs.json` from the backup to `~/.openclaw/cron/jobs.json`
3. Restart the gateway: `openclaw gateway restart`

### Step 3: Validate Restored State

```powershell
.\scripts\ops\openclaw-validate.ps1     # Must exit 0
.\scripts\ops\openclaw-smoke.ps1        # Must show all PASS
```

### Step 4: Drain Bad Queue Entries

If the incident caused ghost deliveries:

```powershell
.\scripts\ops\openclaw-queue-inspect.ps1    # See the damage
.\scripts\ops\openclaw-queue-purge.ps1      # Purge (archives first)
```

### Step 5: Reset Cron Error Counters

After fixing the root cause, reset cron job error counters:

```
openclaw cron reset-errors
```

### Step 6: Verify Recovery

```powershell
.\scripts\ops\openclaw-smoke.ps1   # Full integration check — must pass
```

### Common Incident Patterns

| Incident | Root Cause | Recovery Path |
|----------|-----------|---------------|
| Cron failures after reboot | Ollama not running | `ollama serve`, then smoke test |
| Ghost delivery attempts | Invalid delivery mode (`"silent"`) | Fix mode → `"none"`, purge queue |
| Gateway won't start | Problematic plugin enabled | Disable google/minimax, restart |
| Memory search empty | Provider set to `auto` | Set to `ollama`, pull nomic-embed-text |
| Config corrupted | Bad manual edit | Restore from backup |
