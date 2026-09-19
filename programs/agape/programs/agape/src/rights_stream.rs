//! Rights Stream — Phase 1 atomic on-chain monetization (smart-contract law, not ToS).
//!
//! **Permanent Rights** attach to provenance; this is not an NFT or tradable collectible.
//! Default split: 6000 / 2000 / 2000 bps → Creator / Infrastructure / Family Legacy Trust.
//! Troptions and x402 are settlement **endpoints**; splits execute here in one instruction.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{validate_rights_bps, AgapeError, BPS_DENOMINATOR};

/// Default policy (blueprint): 60% / 20% / 20%.
pub const DEFAULT_CREATOR_BPS: u16 = 6000;
pub const DEFAULT_INFRA_BPS: u16 = 2000;
pub const DEFAULT_FAMILY_BPS: u16 = 2000;

pub mod seeds {
    pub const RIGHTS: &[u8] = b"rights";
    pub const CREATOR_VAULT: &[u8] = b"creator_vault";
    pub const INFRA_POOL: &[u8] = b"infra_pool";
    pub const LEGACY_TRUST: &[u8] = b"legacy_trust";
}

// ---------- Accounts ----------

/// Immutable basis-point split for an estate (sum must equal 10_000).
#[account]
#[derive(InitSpace)]
pub struct RightsTemplate {
    pub estate: Pubkey,
    pub creator_bps: u16,
    pub infrastructure_bps: u16,
    pub family_trust_bps: u16,
    pub bump: u8,
}

/// Creator share vault — lamports held; `withdraw_authority` signs outbound transfers.
#[account]
#[derive(InitSpace)]
pub struct CreatorVault {
    pub estate: Pubkey,
    pub withdraw_authority: Pubkey,
    pub lamports_accounted: u64,
    pub withdrawn_total: u64,
    pub bump: u8,
}

/// Infrastructure pool PDA for platform / ops rail share.
#[account]
#[derive(InitSpace)]
pub struct InfraPool {
    pub estate: Pubkey,
    pub operator: Pubkey,
    pub lamports_accounted: u64,
    pub bump: u8,
}

/// Family / legacy trust custodian vault.
#[account]
#[derive(InitSpace)]
pub struct FamilyTrustVault {
    pub estate: Pubkey,
    pub trustee: Pubkey,
    pub lamports_accounted: u64,
    pub bump: u8,
}

// ---------- Instructions ----------

pub fn initialize_creator_vault(
    ctx: Context<crate::InitializeCreatorVault>,
    infra_operator: Pubkey,
    family_trustee: Pubkey,
) -> Result<()> {
    require_keys_neq!(
        infra_operator,
        Pubkey::default(),
        AgapeError::VaultPartyInvalid
    );
    require_keys_neq!(
        family_trustee,
        Pubkey::default(),
        AgapeError::VaultPartyInvalid
    );

    let estate_key = ctx.accounts.estate_registry.key();
    let authority = ctx.accounts.creator.key();
    let clock = Clock::get()?;

    let vault = &mut ctx.accounts.creator_vault;
    vault.estate = estate_key;
    vault.withdraw_authority = authority;
    vault.lamports_accounted = 0;
    vault.withdrawn_total = 0;
    vault.bump = ctx.bumps.creator_vault;

    let infra = &mut ctx.accounts.infra_pool;
    infra.estate = estate_key;
    infra.operator = infra_operator;
    infra.lamports_accounted = 0;
    infra.bump = ctx.bumps.infra_pool;

    let family = &mut ctx.accounts.family_trust_vault;
    family.estate = estate_key;
    family.trustee = family_trustee;
    family.lamports_accounted = 0;
    family.bump = ctx.bumps.family_trust_vault;

    emit!(CreatorVaultInitialized {
        estate: estate_key,
        creator_vault: vault.key(),
        infra_pool: infra.key(),
        family_trust_vault: family.key(),
        withdraw_authority: authority,
        infra_operator,
        family_trustee,
        initialized_at: clock.unix_timestamp,
    });

    Ok(())
}

pub fn initialize_rights_template(
    ctx: Context<crate::InitializeRightsTemplate>,
    creator_bps: u16,
    infrastructure_bps: u16,
    family_bps: u16,
) -> Result<()> {
    validate_rights_bps(creator_bps, infrastructure_bps, family_bps)?;

    let template = &mut ctx.accounts.rights_template;
    template.estate = ctx.accounts.estate_registry.key();
    template.creator_bps = creator_bps;
    template.infrastructure_bps = infrastructure_bps;
    template.family_trust_bps = family_bps;
    template.bump = ctx.bumps.rights_template;

    emit!(RightsTemplateInitialized {
        estate: template.estate,
        rights_template: template.key(),
        creator_bps,
        infrastructure_bps,
        family_bps,
    });

    Ok(())
}

/// Route lamports from payer to vault PDAs atomically per `RightsTemplate` bps.
pub fn execute_rights_payment(
    ctx: Context<crate::ExecuteRightsPayment>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, AgapeError::PaymentAmountZero);

    let template = &ctx.accounts.rights_template;
    require!(
        template.estate == ctx.accounts.estate_registry.key(),
        AgapeError::RightsEstateMismatch
    );

    let (creator_amt, infra_amt, family_amt) = split_lamports(
        amount,
        template.creator_bps,
        template.infrastructure_bps,
        template.family_trust_bps,
    )?;

    let payer = &ctx.accounts.payer;
    let system = &ctx.accounts.system_program;

    if creator_amt > 0 {
        transfer(
            CpiContext::new(
                system.to_account_info(),
                Transfer {
                    from: payer.to_account_info(),
                    to: ctx.accounts.creator_vault.to_account_info(),
                },
            ),
            creator_amt,
        )?;
        ctx.accounts.creator_vault.lamports_accounted = ctx
            .accounts
            .creator_vault
            .lamports_accounted
            .checked_add(creator_amt)
            .ok_or(AgapeError::LamportsAccountingOverflow)?;
    }

    if infra_amt > 0 {
        transfer(
            CpiContext::new(
                system.to_account_info(),
                Transfer {
                    from: payer.to_account_info(),
                    to: ctx.accounts.infra_pool.to_account_info(),
                },
            ),
            infra_amt,
        )?;
        ctx.accounts.infra_pool.lamports_accounted = ctx
            .accounts
            .infra_pool
            .lamports_accounted
            .checked_add(infra_amt)
            .ok_or(AgapeError::LamportsAccountingOverflow)?;
    }

    if family_amt > 0 {
        transfer(
            CpiContext::new(
                system.to_account_info(),
                Transfer {
                    from: payer.to_account_info(),
                    to: ctx.accounts.family_trust_vault.to_account_info(),
                },
            ),
            family_amt,
        )?;
        ctx.accounts.family_trust_vault.lamports_accounted = ctx
            .accounts
            .family_trust_vault
            .lamports_accounted
            .checked_add(family_amt)
            .ok_or(AgapeError::LamportsAccountingOverflow)?;
    }

    emit!(RightsPaymentExecuted {
        estate: ctx.accounts.estate_registry.key(),
        payer: payer.key(),
        amount,
        creator_lamports: creator_amt,
        infrastructure_lamports: infra_amt,
        family_trust_lamports: family_amt,
        creator_vault: ctx.accounts.creator_vault.key(),
        infra_pool: ctx.accounts.infra_pool.key(),
        family_trust_vault: ctx.accounts.family_trust_vault.key(),
        executed_at: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn withdraw_creator_vault(
    ctx: Context<crate::WithdrawCreatorVault>,
    amount_lamports: u64,
) -> Result<()> {
    require!(amount_lamports > 0, AgapeError::WithdrawAmountZero);

    let vault = &ctx.accounts.creator_vault;
    let vault_lamports = ctx.accounts.creator_vault.to_account_info().lamports();
    require!(
        vault_lamports >= amount_lamports,
        AgapeError::InsufficientVaultBalance
    );

    let estate_key = ctx.accounts.estate_registry.key();
    let seeds = &[
        seeds::CREATOR_VAULT,
        estate_key.as_ref(),
        &[vault.bump],
    ];
    let signer = &[&seeds[..]];

    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.creator_vault.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
            },
            signer,
        ),
        amount_lamports,
    )?;

    let vault_mut = &mut ctx.accounts.creator_vault;
    vault_mut.lamports_accounted = vault_mut
        .lamports_accounted
        .saturating_sub(amount_lamports);
    vault_mut.withdrawn_total = vault_mut
        .withdrawn_total
        .checked_add(amount_lamports)
        .ok_or(AgapeError::WithdrawOverflow)?;

    emit!(CreatorVaultWithdrawn {
        estate: estate_key,
        vault: vault_mut.key(),
        authority: ctx.accounts.withdraw_authority.key(),
        amount_lamports,
        withdrawn_total: vault_mut.withdrawn_total,
    });

    Ok(())
}

// ---------- Events ----------

#[event]
pub struct CreatorVaultInitialized {
    pub estate: Pubkey,
    pub creator_vault: Pubkey,
    pub infra_pool: Pubkey,
    pub family_trust_vault: Pubkey,
    pub withdraw_authority: Pubkey,
    pub infra_operator: Pubkey,
    pub family_trustee: Pubkey,
    pub initialized_at: i64,
}

#[event]
pub struct RightsTemplateInitialized {
    pub estate: Pubkey,
    pub rights_template: Pubkey,
    pub creator_bps: u16,
    pub infrastructure_bps: u16,
    pub family_bps: u16,
}

#[event]
pub struct RightsPaymentExecuted {
    pub estate: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub creator_lamports: u64,
    pub infrastructure_lamports: u64,
    pub family_trust_lamports: u64,
    pub creator_vault: Pubkey,
    pub infra_pool: Pubkey,
    pub family_trust_vault: Pubkey,
    pub executed_at: i64,
}

#[event]
pub struct CreatorVaultWithdrawn {
    pub estate: Pubkey,
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub amount_lamports: u64,
    pub withdrawn_total: u64,
}

// ---------- Helpers ----------

pub fn split_lamports(
    amount: u64,
    creator_bps: u16,
    infrastructure_bps: u16,
    family_bps: u16,
) -> Result<(u64, u64, u64)> {
    validate_rights_bps(creator_bps, infrastructure_bps, family_bps)?;

    let creator = (amount as u128)
        .checked_mul(creator_bps as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .ok_or(AgapeError::LamportsAccountingOverflow)? as u64;

    let infra = (amount as u128)
        .checked_mul(infrastructure_bps as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .ok_or(AgapeError::LamportsAccountingOverflow)? as u64;

    let family = amount
        .checked_sub(creator)
        .and_then(|r| r.checked_sub(infra))
        .ok_or(AgapeError::LamportsAccountingOverflow)?;

    Ok((creator, infra, family))
}

pub fn default_rights_template_bps() -> (u16, u16, u16) {
    (
        DEFAULT_CREATOR_BPS,
        DEFAULT_INFRA_BPS,
        DEFAULT_FAMILY_BPS,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_split_sums_to_amount() {
        let (c, i, f) = split_lamports(1_000_000, 6000, 2000, 2000).unwrap();
        assert_eq!(c + i + f, 1_000_000);
        assert_eq!(c, 600_000);
        assert_eq!(i, 200_000);
        assert_eq!(f, 200_000);
    }

    #[test]
    fn remainder_goes_to_family_on_odd_amount() {
        let (c, i, f) = split_lamports(10_001, 6000, 2000, 2000).unwrap();
        assert_eq!(c + i + f, 10_001);
    }
}
