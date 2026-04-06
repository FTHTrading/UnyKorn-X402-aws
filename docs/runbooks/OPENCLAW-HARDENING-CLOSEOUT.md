# OpenClaw Hardening — Implementation Closeout Report

> Final implementation report for the OpenClaw platform hardening suite.
> Date: 2026-07 | Package: `@unykorn/openclaw-hardening` v1.0.0

---

## 1. What Was Fixed

### Root Causes Addressed

| Issue | Root Cause | Fix Applied |
|-------|-----------|-------------|
| Cron jobs silently failing | `agents.list[0].model` set to `github-copilot/claude-opus-4.6` — requires VS Code session auth unavailable in cron | Changed to `ollama/qwen2.5:7b`; built validation that flags non-cron-safe providers |
| Ghost delivery attempts | `delivery.mode = "silent"` — unrecognized by OpenClaw, falls through to `"announce"` | Changed all jobs to `"none"`; built strict mode validation rejecting invalid modes |
| Gateway crashes on startup | `google` and `minimax` plugins cause `RangeError: Maximum call stack size exceeded` during ajv schema compilation | Disabled both plugins; built plugin classifier that flags known-problematic plugins |
| Memory search returns empty | Ollama embedding adapter doesn't set `autoSelectPriority` → provider auto-selection skips it → vector search disabled | Set provider to `ollama` explicitly; built memory config validator |
| Stale queue entries pile up | Entries from before mode fixes remain in delivery queue | Built queue audit + purge tooling with archival |

### Hardening Closeout Pass

| Issue | Fix |
|-------|-----|
| Package test script path wrong (`../../../` instead of `../../`) | Corrected to `../../tests/openclaw-hardening.test.mjs` |
| Dead import `OPENCLAW_PATHS` in `validate-cron.mjs` | Removed |
| Dead import `basename` in `backup.mjs` | Removed |
| Misleading `--purge` remediation hint in validate-config.mjs and smoke-test.mjs | Redirected to actual purge commands |
| `backup.mjs` CLI missing exit codes | Added `try/catch` with `process.exit(0)` on success and `process.exit(1)` on failure |
| `openclaw-queue-inspect.ps1` missing exit code | Added `exit 0` |
| `openclaw-queue-purge.ps1` missing exit code | Added `exit 0` |
| `openclaw-plugins-status.ps1` no exit on dangerous plugins | Added `exit 1` when dangerous plugins found, `exit 0` otherwise |
| Runbook missing golden path and recovery sections | Added sections 11 (Golden Path) and 12 (Post-Incident Recovery) |

---

## 2. Why Failures Happened

### The Model Resolution Chain Problem

OpenClaw resolves cron job models through a 3-level precedence chain:

```
job.model → agent.model → defaults.model
```

The `agent.model` field was set to `github-copilot/claude-opus-4.6`, which overrode
the safe global default for **all** cron jobs. Since `github-copilot` requires a VS Code
session auth token (unavailable in cron contexts), every scheduled job silently failed.

### The Delivery Mode Problem

OpenClaw's default-branch logic treats unrecognized `delivery.mode` values as `"announce"`.
The mode `"silent"` was never a valid option — it fell through to announce behavior,
causing delivery attempts for jobs intended to be quiet.

### The Plugin Compilation Problem

The `google` and `minimax` plugins trigger deeply recursive ajv JSON schema compilation
during gateway startup, causing `RangeError: Maximum call stack size exceeded`.
This poisons the entire CLI process, not just those plugins.

---

## 3. Safeguards Added

| Safeguard | Module | What It Catches |
|-----------|--------|-----------------|
| Delivery mode validation | `validate-delivery.mjs` | Rejects `silent`, `quiet`, `off`, `disabled`, `false`, `null`, `mute` |
| Cron-safe provider check | `validate-cron.mjs` | Flags `github-copilot`, `copilot`, `vscode-copilot` as unsafe for cron |
| Model resolution chain audit | `validate-cron.mjs` | Traces job → agent → default model with exact provenance |
| Plugin classification | `validate-plugins.mjs` | Flags `google` and `minimax` as dangerous if enabled |
| Memory provider validation | `validate-memory.mjs` | Rejects `auto` provider, validates Ollama embedding endpoint |
| Queue entry audit | `delivery-recovery.mjs` | Identifies stale, orphaned, and invalid queue entries |
| Full config validator | `validate-config.mjs` | Runs all sub-validators in one pass |
| 8-section smoke test | `smoke-test.mjs` | Live integration test: config + gateway + plugins + Ollama + cron + queue + memory |
| 104 unit tests | `openclaw-hardening.test.mjs` | Pure-logic regression suite (no external deps) |
| State backup with redaction | `backup.mjs` | Timestamped backups with secret stripping |

---

## 4. New Commands

### npm Scripts (run from repo root)

```
npm run openclaw:validate   # Full config validation
npm run openclaw:smoke      # 8-section integration smoke test
npm run openclaw:backup     # State backup with redaction
npm run openclaw:test       # Run 104-test suite
```

### PowerShell Operator Scripts (run from repo root)

```powershell
.\scripts\ops\openclaw-validate.ps1        # Full config validation
.\scripts\ops\openclaw-smoke.ps1           # 8-section integration smoke test
.\scripts\ops\openclaw-backup-state.ps1    # State backup
.\scripts\ops\openclaw-queue-inspect.ps1   # Inspect delivery queue
.\scripts\ops\openclaw-queue-purge.ps1     # Purge stale entries (with archive)
.\scripts\ops\openclaw-cron-resolve.ps1    # Show cron model resolution chain
.\scripts\ops\openclaw-plugins-status.ps1  # Plugin classification + health
.\scripts\ops\openclaw-memory-status.ps1   # Memory provider readiness
```

---

## 5. Files

### Package: `packages/openclaw-hardening/`

| File | Purpose |
|------|---------|
| `package.json` | Package manifest with exports map |
| `src/index.mjs` | Barrel re-export of all public APIs |
| `src/constants.mjs` | Single source of truth for all validation constants |
| `src/validate-delivery.mjs` | Delivery mode validation + strict mode list |
| `src/validate-cron.mjs` | Cron job validation + model resolution chain |
| `src/validate-models.mjs` | Model/provider validation + Ollama connectivity |
| `src/validate-memory.mjs` | Memory provider validation + embedding check |
| `src/validate-plugins.mjs` | Plugin health classification + gateway check |
| `src/delivery-recovery.mjs` | Queue audit + purge with archival |
| `src/validate-config.mjs` | Master validator (CLI entry point) |
| `src/smoke-test.mjs` | 8-section integration smoke test (CLI entry point) |
| `src/backup.mjs` | State backup + restore (CLI entry point) |

### Operator Scripts: `scripts/ops/`

| File | Purpose |
|------|---------|
| `openclaw-validate.ps1` | Wraps `validate-config.mjs` |
| `openclaw-smoke.ps1` | Wraps `smoke-test.mjs` |
| `openclaw-backup-state.ps1` | Wraps `backup.mjs` |
| `openclaw-queue-inspect.ps1` | Native PS1 queue inspection |
| `openclaw-queue-purge.ps1` | Native PS1 queue purge with archive |
| `openclaw-cron-resolve.ps1` | Native PS1 model resolution chain |
| `openclaw-plugins-status.ps1` | Native PS1 plugin classification |
| `openclaw-memory-status.ps1` | Native PS1 memory check |

### Tests & Docs

| File | Purpose |
|------|---------|
| `tests/openclaw-hardening.test.mjs` | 104 tests, 26 suites (zero external deps) |
| `docs/runbooks/OPENCLAW-OPERATIONS.md` | Full operator runbook (12 sections) |
| `docs/runbooks/OPENCLAW-HARDENING-CLOSEOUT.md` | This report |

---

## 6. Test Coverage

- **104 tests across 26 suites** — all passing
- Framework: `node:test` + `node:assert` (zero external dependencies)
- Run: `npm run openclaw:test` or `node --test tests/openclaw-hardening.test.mjs`

### Coverage by Module

| Module | Tests | Coverage |
|--------|------:|----------|
| `validate-delivery.mjs` | 16 | All valid modes, all known-invalid modes, edge cases |
| `validate-cron.mjs` | 22 | Model resolution chain (3 levels), provider safety, delivery mode in cron context |
| `validate-models.mjs` | 14 | Provider structure, model refs, cron-safe classification |
| `validate-memory.mjs` | 12 | Provider validation, auto-reject, embedding model check |
| `validate-plugins.mjs` | 14 | Plugin classification, enable/disable combos, gateway format |
| `delivery-recovery.mjs` | 12 | Queue entry classification, purge logic, edge cases |
| `validate-config.mjs` | 8 | Full validation integration, section aggregation |
| `backup.mjs` | 6 | Secret redaction, backup structure |

---

## 7. Migration Notes

### If upgrading from pre-hardening OpenClaw

1. **Delivery modes**: Change all `"silent"` to `"none"` in `~/.openclaw/cron/jobs.json`
2. **Agent model**: Change `agents.list[0].model` from `github-copilot/*` to `ollama/qwen2.5:7b`
3. **Memory provider**: Set `agents.defaults.memorySearch.provider` to `"ollama"` (not `"auto"`)
4. **Plugins**: Disable `google` and `minimax` in `~/.openclaw/openclaw.json`
5. **Embedding model**: Pull `nomic-embed-text` via `ollama pull nomic-embed-text`
6. **Queue cleanup**: Run `.\scripts\ops\openclaw-queue-purge.ps1` to clear stale entries
7. **Verify**: Run `.\scripts\ops\openclaw-smoke.ps1` — all sections should PASS

---

## 8. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| OpenClaw upgrade may re-enable problematic plugins | Medium | Run `openclaw-plugins-status.ps1` after every upgrade |
| Ollama model updates may change embedding dimensions | Low | Smoke test section 7 checks embedding dims |
| New invalid delivery modes may appear in future versions | Low | `KNOWN_INVALID_MODES` list in constants.mjs — extend as needed |
| PS1 scripts duplicate some JS logic | Low (architectural) | Unavoidable — PS1 can't import Node modules; keep in sync manually |
| Queue entries may accumulate between maintenance windows | Low | Weekly purge in golden path; smoke test flags stale entries |

---

## 9. Next Enhancements

- [ ] CI integration: add `openclaw:test` to GitHub Actions workflow
- [ ] Automated nightly smoke test with alerting
- [ ] `--purge` flag on `delivery-recovery.mjs` CLI for direct queue cleanup
- [ ] PS1 scripts could shell out to Node for complex logic instead of reimplementing
- [ ] Config drift detection: compare current config against last known-good backup
- [ ] Commit message + PR description pack for this hardening suite
