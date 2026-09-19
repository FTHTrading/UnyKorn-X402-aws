# AGAPE Phase 0 — Solana Program

**All Generational Provenance Engine** — Experience Provenance + Digital Inheritance Contract.

Nothing is owned by the platform or an AI model. Commitments are creator-signed, non-transferable PDAs.

## Layout

```
programs/agape/
├── Anchor.toml
├── programs/agape/src/lib.rs          # Phase 0 provenance + program entry
├── programs/agape/src/rights_stream.rs # Phase 1 Rights Stream (vaults, splits)
├── tests/agape.ts
└── README.md
```

Docs (repo root): `docs/AGAPE_PHASE0_OPERATOR.md`, `docs/EXPERIENCE_PROVENANCE_SPEC.md`, `docs/AGAPE_MASTER_BLUEPRINT.md`, `docs/AGAPE_ESTATE_IDENTITY.md`.

**Identity layer:** `packages/agape-did/` (DID document schema, `.estate` resolver spec). **EstateAnchor / succession:** `packages/agape-anchor/programs/agape/src/lib.rs`.

**Superseded for Manifest bundle:** use `packages/agape-anchor/` (vault, Access Lease, Estate Anchor). This tree kept for `commit_experience` / fixed-name tests only — do not fork operator docs here.

## Prerequisites

- [Rust](https://rustup.rs/)
- [Solana CLI](https://docs.solanalabs.com/cli/install) (Agave 1.18+)
- [Anchor 0.30.1](https://www.anchor-lang.com/docs/installation)

```powershell
# Example (Windows)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
```

## Build & test

```bash
cd C:\Users\Kevan\UnyKorn-X402-aws\programs\agape
anchor build
anchor test          # local validator
```

## Devnet deploy

```bash
solana config set --url devnet
solana airdrop 2      # if needed
anchor build
anchor deploy --provider.cluster devnet
```

After first deploy, sync `declare_id!` and `[programs.devnet]` in `Anchor.toml` with the deployed program id:

```bash
solana address -k target/deploy/agape-keypair.json
```

## Instructions

| Instruction | Purpose |
|-------------|---------|
| `register_estate` | Create `EstateRegistry` PDA (`estate` + creator + 32-byte name) |
| `commit_experience` | Triple proof: IPFS + Arweave + `root_hash` on-chain |
| `lock_memorial` | Creator freezes commitment (inheritance locked) |
| `initialize_creator_vault` | Creator / infra / family vault PDAs |
| `initialize_rights_template` | Immutable bps split (default 6000/2000/2000) |
| `execute_rights_payment` | Atomic lamport routing to vaults |
| `withdraw_creator_vault` | Creator withdraw from CreatorVault PDA |

## PDAs

- `["estate", creator, estate_name[32]]`
- `["experience", estate, experience_id[32]]`
- `["rights", estate]` — RightsTemplate
- `["creator_vault", estate]` — CreatorVault
- `["infra_pool", estate]` — InfraPool
- `["legacy_trust", estate]` — FamilyTrustVault

## Triple archival (off-chain → on-chain)

Before `commit_experience`, run:

```powershell
powershell -ExecutionPolicy Bypass -File ..\..\packages\agape-storage\scripts\commit-proof-bundle.ps1
```

See `packages/agape-storage/README.md` and `docs/AGAPE_ARCHIVAL_LAYER.md`.

## Phase 1 — Rights Stream

Smart-contract law: `docs/AGAPE_RIGHTS_STREAM.md`. Default **60/20/20** (Creator / Infrastructure / Family Legacy Trust). Troptions = settlement endpoint leaf, not estate authority.
