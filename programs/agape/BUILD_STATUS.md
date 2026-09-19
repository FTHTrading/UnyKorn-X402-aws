# AGAPE Build Status

**Timestamp (UTC):** 2026-05-22T13:28:31Z
**STATUS:** BUILD_PARTIAL
**Program ID (Anchor.toml):** `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEtYHKKH9YTSvxRN`

## Toolchain (this run)

| Tool | Version | Notes |
|------|---------|-------|
| rustc (default) | 1.93.0 | Used for `cargo build-sbf` / program compile |
| rustc (anchor install) | 1.79.0 | Required to compile `anchor-cli` 0.30.1 on Windows |
| anchor | 0.30.1 | `~/.cargo/bin/anchor.exe` |
| solana | 4.0.0 (Agave) | `~/.local/share/solana/install/active_release/bin` |

## Results

| Step | Result |
|------|--------|
| `anchor build --no-idl` | **PASS** — SBF program compiles (warnings only) |
| `anchor build` (with IDL) | **FAIL** — `anchor-syn` / `proc_macro2::Span::source_file` on Rust 1.93 |
| `anchor test` | **FAIL** — same IDL build error |

## Repo fixes applied (Windows)

- `Cargo.toml`: `members = ["programs/agape"]` (glob `programs/*` breaks `cargo metadata` on Windows)
- `programs/agape/Cargo.toml`: added `idl-build = ["anchor-lang/idl-build"]`

## Deploy artifact

No `target/deploy/agape.so` observed under workspace `target/` (only `idl/`, `types/`). Solana CLI 4.x may differ from Anchor 0.30.1 expected 1.18 toolchain; recommend aligned Solana 1.18.x for production deploy.

## If fully blocked on native Windows

Run in **WSL2 (Ubuntu)** from repo root:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --tag v0.30.1
cd programs/agape && anchor build && anchor test
```

## PATH for this machine (PowerShell)

```powershell
$env:Path = "$env:USERPROFILE\.local\share\solana\install\active_release\bin;$env:USERPROFILE\.cargo\bin;" + $env:Path
```
