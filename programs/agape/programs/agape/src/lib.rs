//! AGAPE — All Generational Provenance Engine
//! Phase 0: Experience Provenance + Digital Inheritance Contract (Solana anchor)
//!
//! Sovereignty: creator-signed PDAs only; experience commitments are non-transferable.
//! LPS-1 is a design pattern only — deterministic roots, proof bundles, state machine.
//!
//! ## Estate Seal (Layer 1 identity)
//! - `register_estate` creates `EstateRegistry` PDA: seeds `["estate", creator, estate_name[32]]`.
//! - `EstateRegistry.creator` is the sole authority signer for estate-scoped instructions.
//! - Optional `parent_estate` forms the on-chain **Lineage Record** (`lineage_index` increments).
//! - Off-chain **Digital Self Root**: `did:agape:estate:<estate_registry_pubkey>` — see
//!   `packages/agape-did/` and `docs/AGAPE_ESTATE_IDENTITY.md`.
//! - **EstateAnchor** succession (authority rotation on vault) lives in `packages/agape-anchor`
//!   until merged; generational namespace handoff uses child `register_estate` + `parent_estate`.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

mod rights_stream;

pub use rights_stream::{
    default_rights_template_bps, seeds, split_lamports, CreatorVault, CreatorVaultInitialized,
    CreatorVaultWithdrawn, DEFAULT_CREATOR_BPS, DEFAULT_FAMILY_BPS, DEFAULT_INFRA_BPS,
    FamilyTrustVault, InfraPool, RightsPaymentExecuted, RightsTemplate,
    RightsTemplateInitialized,
};

// Placeholder program id — sync with `target/deploy/agape-keypair.json` after deploy.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEtYHKKH9YTSvxRN");

pub const ESTATE_NAME_LEN: usize = 32;
pub const EXPERIENCE_ID_LEN: usize = 32;
pub const MAX_IPFS_CID_LEN: usize = 128;
pub const MAX_ARWEAVE_TX_LEN: usize = 128;
pub const MAX_METADATA_URI_LEN: usize = 256;
pub const BPS_DENOMINATOR: u16 = 10_000;

#[program]
pub mod agape {
    use super::*;

    /// Register an **Estate Seal** — namespace root PDA bound to `creator` signer.
    ///
    /// PDA: `["estate", creator.key(), estate_name]`. Optional `parent_estate` account sets
    /// **Lineage Record** (`parent_estate` pubkey + `lineage_index = parent.lineage_index + 1`).
    /// Emits `EstateRegistered` for DID `estateSeal` metadata (`docs/AGAPE_ESTATE_IDENTITY.md`).
    pub fn register_estate(
        ctx: Context<RegisterEstate>,
        estate_name: [u8; ESTATE_NAME_LEN],
    ) -> Result<()> {
        require!(
            !is_zero_name(&estate_name),
            AgapeError::EstateNameInvalid
        );

        let lineage_index = if let Some(parent) = &ctx.accounts.parent_estate {
            parent
                .lineage_index
                .checked_add(1)
                .ok_or(AgapeError::LineageOverflow)?
        } else {
            0
        };

        let estate = &mut ctx.accounts.estate_registry;
        let clock = Clock::get()?;

        estate.creator = ctx.accounts.creator.key();
        estate.estate_name = estate_name;
        estate.parent_estate = ctx.accounts.parent_estate.as_ref().map(|p| p.key());
        estate.lineage_index = lineage_index;
        estate.bump = ctx.bumps.estate_registry;

        emit!(EstateRegistered {
            estate: estate.key(),
            creator: estate.creator,
            estate_name,
            parent_estate: estate.parent_estate,
            lineage_index,
            registered_at: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Anchor triple proof: IPFS CID + Arweave tx + on-chain root hash. Emits `ExperienceCommitted`.
    pub fn commit_experience(
        ctx: Context<CommitExperience>,
        proof_bundle: ProofBundle,
    ) -> Result<()> {
        proof_bundle.validate()?;

        let estate = &ctx.accounts.estate_registry;
        require_keys_eq!(
            estate.creator,
            ctx.accounts.creator.key(),
            AgapeError::CreatorMismatch
        );

        let computed = compute_experience_root_hash(
            proof_bundle.ipfs_cid.as_bytes(),
            proof_bundle.arweave_tx_id.as_bytes(),
            &proof_bundle.experience_id,
        );

        if let Some(supplied) = proof_bundle.root_hash {
            require!(supplied == computed, AgapeError::RootHashMismatch);
        }

        let commitment = &mut ctx.accounts.experience_commitment;
        let clock = Clock::get()?;

        commitment.estate = estate.key();
        commitment.experience_id = proof_bundle.experience_id;
        commitment.ipfs_cid = proof_bundle.ipfs_cid;
        commitment.arweave_tx = proof_bundle.arweave_tx_id;
        commitment.root_hash = computed;
        commitment.content_class = proof_bundle.content_class;
        commitment.committed_at = clock.unix_timestamp;
        commitment.memorial_locked = false;
        commitment.metadata_uri = proof_bundle.metadata_uri;
        commitment.bump = ctx.bumps.experience_commitment;

        emit!(ExperienceCommitted {
            estate: estate.key(),
            experience: commitment.key(),
            experience_id: commitment.experience_id,
            root_hash: commitment.root_hash,
            content_class: commitment.content_class,
            committed_at: commitment.committed_at,
        });

        Ok(())
    }

    /// Freeze inheritance record — creator only; no further mutation after lock.
    pub fn lock_memorial(ctx: Context<LockMemorial>, experience_id: [u8; EXPERIENCE_ID_LEN]) -> Result<()> {
        require!(
            experience_id == ctx.accounts.experience_commitment.experience_id,
            AgapeError::ExperienceIdMismatch
        );

        let commitment = &mut ctx.accounts.experience_commitment;
        require!(
            !commitment.memorial_locked,
            AgapeError::MemorialAlreadyLocked
        );

        commitment.memorial_locked = true;

        emit!(MemorialLocked {
            estate: commitment.estate,
            experience: commitment.key(),
            experience_id,
            locked_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Phase 1: Creator / infra / family vault PDAs + withdraw authority.
    pub fn initialize_creator_vault(
        ctx: Context<InitializeCreatorVault>,
        infra_operator: Pubkey,
        family_trustee: Pubkey,
    ) -> Result<()> {
        rights_stream::initialize_creator_vault(ctx, infra_operator, family_trustee)
    }

    /// Phase 1: Immutable split template (bps sum = 10_000). Default: 6000 / 2000 / 2000.
    pub fn initialize_rights_template(
        ctx: Context<InitializeRightsTemplate>,
        creator_bps: u16,
        infrastructure_bps: u16,
        family_bps: u16,
    ) -> Result<()> {
        rights_stream::initialize_rights_template(
            ctx,
            creator_bps,
            infrastructure_bps,
            family_bps,
        )
    }

    /// Phase 1: Atomic lamport routing from payer to vault PDAs per RightsTemplate.
    pub fn execute_rights_payment(
        ctx: Context<ExecuteRightsPayment>,
        amount: u64,
    ) -> Result<()> {
        rights_stream::execute_rights_payment(ctx, amount)
    }

    /// Creator withdraws accumulated share from CreatorVault PDA.
    pub fn withdraw_creator_vault(
        ctx: Context<WithdrawCreatorVault>,
        amount_lamports: u64,
    ) -> Result<()> {
        rights_stream::withdraw_creator_vault(ctx, amount_lamports)
    }
}

// ---------- Accounts ----------

#[derive(Accounts)]
#[instruction(estate_name: [u8; ESTATE_NAME_LEN])]
pub struct RegisterEstate<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + EstateRegistry::INIT_SPACE,
        seeds = [b"estate", creator.key().as_ref(), estate_name.as_ref()],
        bump
    )]
    pub estate_registry: Account<'info, EstateRegistry>,

    /// Optional parent estate for generational lineage.
    pub parent_estate: Option<Account<'info, EstateRegistry>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proof_bundle: ProofBundle)]
pub struct CommitExperience<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [b"estate", creator.key().as_ref(), estate_registry.estate_name.as_ref()],
        bump = estate_registry.bump,
        has_one = creator @ AgapeError::CreatorMismatch,
    )]
    pub estate_registry: Account<'info, EstateRegistry>,

    #[account(
        init,
        payer = creator,
        space = 8 + ExperienceCommitment::INIT_SPACE,
        seeds = [
            b"experience",
            estate_registry.key().as_ref(),
            proof_bundle.experience_id.as_ref(),
        ],
        bump
    )]
    pub experience_commitment: Account<'info, ExperienceCommitment>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(experience_id: [u8; EXPERIENCE_ID_LEN])]
pub struct LockMemorial<'info> {
    pub creator: Signer<'info>,

    #[account(
        seeds = [b"estate", creator.key().as_ref(), estate_registry.estate_name.as_ref()],
        bump = estate_registry.bump,
        has_one = creator @ AgapeError::CreatorMismatch,
    )]
    pub estate_registry: Account<'info, EstateRegistry>,

    #[account(
        mut,
        seeds = [
            b"experience",
            estate_registry.key().as_ref(),
            experience_id.as_ref(),
        ],
        bump = experience_commitment.bump,
        constraint = experience_commitment.estate == estate_registry.key() @ AgapeError::EstateMismatch,
        constraint = !experience_commitment.memorial_locked @ AgapeError::MemorialAlreadyLocked,
    )]
    pub experience_commitment: Account<'info, ExperienceCommitment>,
}

// ---------- Rights Stream account contexts (crate root for #[program]) ----------

#[derive(Accounts)]
pub struct InitializeCreatorVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [b"estate", creator.key().as_ref(), estate_registry.estate_name.as_ref()],
        bump = estate_registry.bump,
        has_one = creator @ AgapeError::CreatorMismatch,
    )]
    pub estate_registry: Account<'info, EstateRegistry>,

    #[account(
        init,
        payer = creator,
        space = 8 + CreatorVault::INIT_SPACE,
        seeds = [seeds::CREATOR_VAULT, estate_registry.key().as_ref()],
        bump
    )]
    pub creator_vault: Account<'info, CreatorVault>,

    #[account(
        init,
        payer = creator,
        space = 8 + InfraPool::INIT_SPACE,
        seeds = [seeds::INFRA_POOL, estate_registry.key().as_ref()],
        bump
    )]
    pub infra_pool: Account<'info, InfraPool>,

    #[account(
        init,
        payer = creator,
        space = 8 + FamilyTrustVault::INIT_SPACE,
        seeds = [seeds::LEGACY_TRUST, estate_registry.key().as_ref()],
        bump
    )]
    pub family_trust_vault: Account<'info, FamilyTrustVault>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeRightsTemplate<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [b"estate", creator.key().as_ref(), estate_registry.estate_name.as_ref()],
        bump = estate_registry.bump,
        has_one = creator @ AgapeError::CreatorMismatch,
    )]
    pub estate_registry: Account<'info, EstateRegistry>,

    #[account(
        init,
        payer = creator,
        space = 8 + RightsTemplate::INIT_SPACE,
        seeds = [seeds::RIGHTS, estate_registry.key().as_ref()],
        bump
    )]
    pub rights_template: Account<'info, RightsTemplate>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteRightsPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub estate_registry: Account<'info, EstateRegistry>,

    #[account(
        seeds = [seeds::RIGHTS, estate_registry.key().as_ref()],
        bump = rights_template.bump,
        constraint = rights_template.estate == estate_registry.key() @ AgapeError::RightsEstateMismatch,
    )]
    pub rights_template: Account<'info, RightsTemplate>,

    #[account(
        mut,
        seeds = [seeds::CREATOR_VAULT, estate_registry.key().as_ref()],
        bump = creator_vault.bump,
        constraint = creator_vault.estate == estate_registry.key() @ AgapeError::VaultEstateMismatch,
    )]
    pub creator_vault: Account<'info, CreatorVault>,

    #[account(
        mut,
        seeds = [seeds::INFRA_POOL, estate_registry.key().as_ref()],
        bump = infra_pool.bump,
        constraint = infra_pool.estate == estate_registry.key() @ AgapeError::VaultEstateMismatch,
    )]
    pub infra_pool: Account<'info, InfraPool>,

    #[account(
        mut,
        seeds = [seeds::LEGACY_TRUST, estate_registry.key().as_ref()],
        bump = family_trust_vault.bump,
        constraint = family_trust_vault.estate == estate_registry.key() @ AgapeError::VaultEstateMismatch,
    )]
    pub family_trust_vault: Account<'info, FamilyTrustVault>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawCreatorVault<'info> {
    #[account(mut)]
    pub withdraw_authority: Signer<'info>,

    #[account(
        seeds = [
            b"estate",
            estate_registry.creator.as_ref(),
            estate_registry.estate_name.as_ref(),
        ],
        bump = estate_registry.bump,
    )]
    pub estate_registry: Account<'info, EstateRegistry>,

    #[account(
        mut,
        seeds = [seeds::CREATOR_VAULT, estate_registry.key().as_ref()],
        bump = creator_vault.bump,
        has_one = withdraw_authority @ AgapeError::WithdrawAuthorityMismatch,
        constraint = creator_vault.estate == estate_registry.key() @ AgapeError::VaultEstateMismatch,
    )]
    pub creator_vault: Account<'info, CreatorVault>,

    /// CHECK: lamport destination (creator wallet or Troptions settlement leaf).
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Estate Seal account — Digital Self Root on-chain; maps to `did:agape:estate:<self>`.
///
/// `creator` must sign `commit_experience` / `lock_memorial`. Not transferable.
/// Lineage: `parent_estate` → prior `EstateRegistry`; use `packages/agape-anchor` `EstateAnchor`
/// for vault authority succession (`succession_authority`) on economic spine accounts.
#[account]
#[derive(InitSpace)]
pub struct EstateRegistry {
    pub creator: Pubkey,
    pub estate_name: [u8; ESTATE_NAME_LEN],
    pub parent_estate: Option<Pubkey>,
    pub lineage_index: u64,
    pub bump: u8,
}

/// Non-transferable experience provenance anchor (digital inheritance record).
#[account]
#[derive(InitSpace)]
pub struct ExperienceCommitment {
    pub estate: Pubkey,
    pub experience_id: [u8; EXPERIENCE_ID_LEN],
    #[max_len(MAX_IPFS_CID_LEN)]
    pub ipfs_cid: String,
    #[max_len(MAX_ARWEAVE_TX_LEN)]
    pub arweave_tx: String,
    pub root_hash: [u8; 32],
    pub content_class: ContentClass,
    pub committed_at: i64,
    pub memorial_locked: bool,
    #[max_len(MAX_METADATA_URI_LEN)]
    pub metadata_uri: Option<String>,
    pub bump: u8,
}

// ---------- Types ----------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ContentClass {
    Skill,
    Art,
    Athletic,
    Personal,
    Legacy,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProofBundle {
    pub ipfs_cid: String,
    pub arweave_tx_id: String,
    pub experience_id: [u8; EXPERIENCE_ID_LEN],
    pub content_class: ContentClass,
    pub metadata_uri: Option<String>,
    /// When set, must match on-chain SHA-256(ipfs ‖ arweave ‖ experience_id).
    pub root_hash: Option<[u8; 32]>,
}

impl ProofBundle {
    pub fn validate(&self) -> Result<()> {
        require!(
            !self.ipfs_cid.is_empty() && self.ipfs_cid.len() <= MAX_IPFS_CID_LEN,
            AgapeError::IpfsCidInvalid
        );
        require!(
            !self.arweave_tx_id.is_empty() && self.arweave_tx_id.len() <= MAX_ARWEAVE_TX_LEN,
            AgapeError::ArweaveTxInvalid
        );
        require!(
            !is_zero_name(&self.experience_id),
            AgapeError::ExperienceIdInvalid
        );
        if let Some(uri) = &self.metadata_uri {
            require!(
                !uri.is_empty() && uri.len() <= MAX_METADATA_URI_LEN,
                AgapeError::MetadataUriInvalid
            );
        }
        Ok(())
    }
}

// ---------- Events ----------

#[event]
pub struct EstateRegistered {
    pub estate: Pubkey,
    pub creator: Pubkey,
    pub estate_name: [u8; ESTATE_NAME_LEN],
    pub parent_estate: Option<Pubkey>,
    pub lineage_index: u64,
    pub registered_at: i64,
}

#[event]
pub struct ExperienceCommitted {
    pub estate: Pubkey,
    pub experience: Pubkey,
    pub experience_id: [u8; EXPERIENCE_ID_LEN],
    pub root_hash: [u8; 32],
    pub content_class: ContentClass,
    pub committed_at: i64,
}

#[event]
pub struct MemorialLocked {
    pub estate: Pubkey,
    pub experience: Pubkey,
    pub experience_id: [u8; EXPERIENCE_ID_LEN],
    pub locked_at: i64,
}

// ---------- Helpers ----------

/// Triple-proof root: SHA-256(ipfs_cid ‖ arweave_tx_id ‖ experience_id).
pub fn compute_experience_root_hash(
    ipfs_cid: &[u8],
    arweave_tx_id: &[u8],
    experience_id: &[u8; EXPERIENCE_ID_LEN],
) -> [u8; 32] {
    let mut data = Vec::with_capacity(ipfs_cid.len() + arweave_tx_id.len() + EXPERIENCE_ID_LEN);
    data.extend_from_slice(ipfs_cid);
    data.extend_from_slice(arweave_tx_id);
    data.extend_from_slice(experience_id);
    hash(&data).to_bytes()
}

pub fn validate_rights_bps(creator: u16, infrastructure: u16, family_trust: u16) -> Result<()> {
    let sum = creator as u32 + infrastructure as u32 + family_trust as u32;
    require!(sum == BPS_DENOMINATOR as u32, AgapeError::RightsBpsInvalid);
    Ok(())
}

fn is_zero_name(bytes: &[u8]) -> bool {
    bytes.iter().all(|&b| b == 0)
}

// ---------- Errors ----------

#[error_code]
pub enum AgapeError {
    #[msg("Estate name must be non-zero 32-byte label")]
    EstateNameInvalid,
    #[msg("Experience id must be non-zero")]
    ExperienceIdInvalid,
    #[msg("IPFS CID invalid or too long")]
    IpfsCidInvalid,
    #[msg("Arweave transaction id invalid or too long")]
    ArweaveTxInvalid,
    #[msg("Metadata URI invalid or too long")]
    MetadataUriInvalid,
    #[msg("Supplied root_hash does not match on-chain computation")]
    RootHashMismatch,
    #[msg("Rights bps must sum to 10000")]
    RightsBpsInvalid,
    #[msg("Signer must match estate creator")]
    CreatorMismatch,
    #[msg("Experience commitment estate mismatch")]
    EstateMismatch,
    #[msg("Experience id does not match commitment")]
    ExperienceIdMismatch,
    #[msg("Memorial already locked")]
    MemorialAlreadyLocked,
    #[msg("Lineage index overflow")]
    LineageOverflow,
    #[msg("Payment amount must be > 0")]
    PaymentAmountZero,
    #[msg("Withdraw amount must be > 0")]
    WithdrawAmountZero,
    #[msg("Vault has insufficient lamports")]
    InsufficientVaultBalance,
    #[msg("Withdraw total overflow")]
    WithdrawOverflow,
    #[msg("Lamports accounting overflow")]
    LamportsAccountingOverflow,
    #[msg("Rights template estate mismatch")]
    RightsEstateMismatch,
    #[msg("Vault estate mismatch")]
    VaultEstateMismatch,
    #[msg("Withdraw authority must match CreatorVault")]
    WithdrawAuthorityMismatch,
    #[msg("Infra operator or family trustee cannot be default pubkey")]
    VaultPartyInvalid,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn experience_root_hash_includes_id() {
        let id = [1u8; 32];
        let a = compute_experience_root_hash(b"QmA", b"ar-1", &id);
        let b = compute_experience_root_hash(b"QmA", b"ar-1", &id);
        assert_eq!(a, b);
        let id2 = [2u8; 32];
        let c = compute_experience_root_hash(b"QmA", b"ar-1", &id2);
        assert_ne!(a, c);
    }

    #[test]
    fn rights_bps_must_sum() {
        assert!(validate_rights_bps(6000, 2000, 2000).is_ok());
        assert!(validate_rights_bps(5000, 2000, 2000).is_err());
    }
}
