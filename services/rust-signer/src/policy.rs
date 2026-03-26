//! Wallet domains and signing policy enforcement.

use serde::{Deserialize, Serialize};

/// Predefined wallet domains — every system has these baked in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WalletDomain {
    ColdRootGovernance,
    TreasuryVault,
    IssuanceControl,
    UpgradeAdmin,
    Operations,
    Burner,
    AgentExecution,
    AgentEscrow,
    AgentSettlement,
    AgentObserver,
}

/// Actions that can be requested through the signer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignAction {
    Transfer,
    Mint,
    Burn,
    Lock,
    Release,
    Settle,
    Upgrade,
    Rotate,
    Approve,
    DappConnect,
    ArbitrarySign,
}

/// Policy rule — what a wallet domain is allowed to do.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainPolicy {
    pub domain: WalletDomain,
    pub allowed_actions: Vec<SignAction>,
    pub daily_limit_usd: f64,
    pub per_tx_limit_usd: f64,
    pub approval_threshold_usd: f64,
    pub requires_simulation: bool,
    pub requires_human_approval: bool,
    pub can_sign_directly: bool,
    pub allowed_counterparties: Option<Vec<String>>,
    pub allowed_assets: Option<Vec<String>>,
}

/// A signing request to evaluate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignRequest {
    pub key_id: String,
    pub domain: WalletDomain,
    pub action: SignAction,
    pub payload_hex: String,
    pub amount_usd: Option<f64>,
    pub counterparty: Option<String>,
    pub asset: Option<String>,
    pub actor_id: String,
    pub reason: String,
}

/// Result of a policy evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDecision {
    pub allowed: bool,
    pub reason: String,
    pub requires_human_approval: bool,
    pub requires_simulation: bool,
}

/// Evaluate a signing request against the default domain policies.
pub fn evaluate(req: &SignRequest) -> PolicyDecision {
    let policy = default_policy(req.domain);

    // Check action is in allowed list
    if !policy.allowed_actions.contains(&req.action) {
        return PolicyDecision {
            allowed: false,
            reason: format!(
                "action {:?} is not allowed for domain {:?}",
                req.action, req.domain
            ),
            requires_human_approval: false,
            requires_simulation: false,
        };
    }

    // Check counterparty allowlist
    if let (Some(ref allowed), Some(ref requested)) = (&policy.allowed_counterparties, &req.counterparty) {
        if !allowed.contains(requested) {
            return PolicyDecision {
                allowed: false,
                reason: format!("counterparty {} not in allowlist for {:?}", requested, req.domain),
                requires_human_approval: false,
                requires_simulation: false,
            };
        }
    }

    // Check asset allowlist
    if let (Some(ref allowed), Some(ref requested)) = (&policy.allowed_assets, &req.asset) {
        if !allowed.contains(requested) {
            return PolicyDecision {
                allowed: false,
                reason: format!("asset {} not in allowlist for {:?}", requested, req.domain),
                requires_human_approval: false,
                requires_simulation: false,
            };
        }
    }

    // Check per-tx limit
    if let Some(amount) = req.amount_usd {
        if amount > policy.per_tx_limit_usd {
            return PolicyDecision {
                allowed: false,
                reason: format!(
                    "amount ${:.2} exceeds per-tx limit ${:.2} for {:?}",
                    amount, policy.per_tx_limit_usd, req.domain
                ),
                requires_human_approval: false,
                requires_simulation: false,
            };
        }
    }

    // Check if direct signing allowed
    if !policy.can_sign_directly {
        return PolicyDecision {
            allowed: false,
            reason: format!("domain {:?} cannot sign directly — use multisig flow", req.domain),
            requires_human_approval: true,
            requires_simulation: policy.requires_simulation,
        };
    }

    // Check approval threshold
    let needs_approval = if let Some(amount) = req.amount_usd {
        amount > policy.approval_threshold_usd || policy.requires_human_approval
    } else {
        policy.requires_human_approval
    };

    PolicyDecision {
        allowed: true,
        reason: "policy passed".to_string(),
        requires_human_approval: needs_approval,
        requires_simulation: policy.requires_simulation,
    }
}

/// Default hardcoded policies per wallet domain.
pub fn default_policy(domain: WalletDomain) -> DomainPolicy {
    match domain {
        WalletDomain::ColdRootGovernance => DomainPolicy {
            domain,
            allowed_actions: vec![SignAction::Approve, SignAction::Rotate],
            daily_limit_usd: 0.0,
            per_tx_limit_usd: 0.0,
            approval_threshold_usd: 0.0,
            requires_simulation: true,
            requires_human_approval: true,
            can_sign_directly: false,
            allowed_counterparties: None,
            allowed_assets: None,
        },
        WalletDomain::TreasuryVault => DomainPolicy {
            domain,
            allowed_actions: vec![SignAction::Transfer, SignAction::Lock, SignAction::Release],
            daily_limit_usd: 1_000_000.0,
            per_tx_limit_usd: 100_000.0,
            approval_threshold_usd: 10_000.0,
            requires_simulation: true,
            requires_human_approval: true,
            can_sign_directly: false, // multisig required
            allowed_counterparties: None,
            allowed_assets: None,
        },
        WalletDomain::IssuanceControl => DomainPolicy {
            domain,
            allowed_actions: vec![SignAction::Mint, SignAction::Burn],
            daily_limit_usd: 10_000_000.0,
            per_tx_limit_usd: 1_000_000.0,
            approval_threshold_usd: 0.0,
            requires_simulation: true,
            requires_human_approval: true,
            can_sign_directly: false, // cannot custody reserves
            allowed_counterparties: None,
            allowed_assets: Some(vec!["UNY".to_string()]),
        },
        WalletDomain::UpgradeAdmin => DomainPolicy {
            domain,
            allowed_actions: vec![SignAction::Upgrade, SignAction::Approve],
            daily_limit_usd: 0.0,
            per_tx_limit_usd: 0.0,
            approval_threshold_usd: 0.0,
            requires_simulation: true,
            requires_human_approval: true,
            can_sign_directly: false,
            allowed_counterparties: None,
            allowed_assets: None,
        },
        WalletDomain::Operations => DomainPolicy {
            domain,
            allowed_actions: vec![
                SignAction::Transfer,
                SignAction::Lock,
                SignAction::Release,
                SignAction::Settle,
                SignAction::ArbitrarySign,
            ],
            daily_limit_usd: 50_000.0,
            per_tx_limit_usd: 5_000.0,
            approval_threshold_usd: 1_000.0,
            requires_simulation: false,
            requires_human_approval: false,
            can_sign_directly: true,
            allowed_counterparties: None,
            allowed_assets: None,
        },
        WalletDomain::Burner => DomainPolicy {
            domain,
            allowed_actions: vec![
                SignAction::Transfer,
                SignAction::DappConnect,
                SignAction::ArbitrarySign,
            ],
            daily_limit_usd: 1_000.0,
            per_tx_limit_usd: 500.0,
            approval_threshold_usd: 500.0,
            requires_simulation: false,
            requires_human_approval: false,
            can_sign_directly: true,
            allowed_counterparties: None,
            allowed_assets: None,
        },
        WalletDomain::AgentExecution => DomainPolicy {
            domain,
            allowed_actions: vec![SignAction::Transfer, SignAction::Settle],
            daily_limit_usd: 10_000.0,
            per_tx_limit_usd: 1_000.0,
            approval_threshold_usd: 500.0,
            requires_simulation: false,
            requires_human_approval: false,
            can_sign_directly: true,
            allowed_counterparties: None,
            allowed_assets: Some(vec!["UNY".to_string()]),
        },
        WalletDomain::AgentEscrow => DomainPolicy {
            domain,
            allowed_actions: vec![SignAction::Lock, SignAction::Release],
            daily_limit_usd: 50_000.0,
            per_tx_limit_usd: 10_000.0,
            approval_threshold_usd: 5_000.0,
            requires_simulation: true,
            requires_human_approval: false,
            can_sign_directly: true,
            allowed_counterparties: None,
            allowed_assets: Some(vec!["UNY".to_string()]),
        },
        WalletDomain::AgentSettlement => DomainPolicy {
            domain,
            allowed_actions: vec![SignAction::Settle, SignAction::Transfer],
            daily_limit_usd: 100_000.0,
            per_tx_limit_usd: 10_000.0,
            approval_threshold_usd: 5_000.0,
            requires_simulation: true,
            requires_human_approval: false,
            can_sign_directly: true,
            allowed_counterparties: None,
            allowed_assets: Some(vec!["UNY".to_string()]),
        },
        WalletDomain::AgentObserver => DomainPolicy {
            domain,
            allowed_actions: vec![], // cannot do anything
            daily_limit_usd: 0.0,
            per_tx_limit_usd: 0.0,
            approval_threshold_usd: 0.0,
            requires_simulation: false,
            requires_human_approval: false,
            can_sign_directly: false,
            allowed_counterparties: None,
            allowed_assets: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_burner_cannot_mint() {
        let req = SignRequest {
            key_id: "test".into(),
            domain: WalletDomain::Burner,
            action: SignAction::Mint,
            payload_hex: "".into(),
            amount_usd: None,
            counterparty: None,
            asset: None,
            actor_id: "test-actor".into(),
            reason: "test".into(),
        };
        let decision = evaluate(&req);
        assert!(!decision.allowed);
        assert!(decision.reason.contains("not allowed"));
    }

    #[test]
    fn test_ops_cannot_upgrade() {
        let req = SignRequest {
            key_id: "test".into(),
            domain: WalletDomain::Operations,
            action: SignAction::Upgrade,
            payload_hex: "".into(),
            amount_usd: None,
            counterparty: None,
            asset: None,
            actor_id: "test-actor".into(),
            reason: "test".into(),
        };
        let decision = evaluate(&req);
        assert!(!decision.allowed);
    }

    #[test]
    fn test_treasury_cannot_sign_directly() {
        let req = SignRequest {
            key_id: "test".into(),
            domain: WalletDomain::TreasuryVault,
            action: SignAction::Transfer,
            payload_hex: "".into(),
            amount_usd: Some(100.0),
            counterparty: None,
            asset: None,
            actor_id: "test-actor".into(),
            reason: "pay vendor".into(),
        };
        let decision = evaluate(&req);
        assert!(!decision.allowed);
        assert!(decision.reason.contains("multisig"));
    }

    #[test]
    fn test_agent_execution_within_limits() {
        let req = SignRequest {
            key_id: "test".into(),
            domain: WalletDomain::AgentExecution,
            action: SignAction::Transfer,
            payload_hex: hex::encode(b"transfer 100 UNY"),
            amount_usd: Some(100.0),
            counterparty: None,
            asset: Some("UNY".into()),
            actor_id: "agent-001".into(),
            reason: "task payment".into(),
        };
        let decision = evaluate(&req);
        assert!(decision.allowed);
    }

    #[test]
    fn test_agent_execution_over_limit() {
        let req = SignRequest {
            key_id: "test".into(),
            domain: WalletDomain::AgentExecution,
            action: SignAction::Transfer,
            payload_hex: "".into(),
            amount_usd: Some(5000.0), // over 1000 per-tx limit
            counterparty: None,
            asset: Some("UNY".into()),
            actor_id: "agent-001".into(),
            reason: "big payment".into(),
        };
        let decision = evaluate(&req);
        assert!(!decision.allowed);
        assert!(decision.reason.contains("per-tx limit"));
    }

    #[test]
    fn test_observer_cannot_do_anything() {
        let req = SignRequest {
            key_id: "test".into(),
            domain: WalletDomain::AgentObserver,
            action: SignAction::Transfer,
            payload_hex: "".into(),
            amount_usd: None,
            counterparty: None,
            asset: None,
            actor_id: "observer".into(),
            reason: "watch".into(),
        };
        let decision = evaluate(&req);
        assert!(!decision.allowed);
    }

    #[test]
    fn test_issuance_wrong_asset() {
        // IssuanceControl can't sign directly anyway, but if it could, wrong asset should fail
        // Test the asset check against a domain that CAN sign: AgentExecution
        let req = SignRequest {
            key_id: "test".into(),
            domain: WalletDomain::AgentExecution,
            action: SignAction::Transfer,
            payload_hex: "".into(),
            amount_usd: Some(10.0),
            counterparty: None,
            asset: Some("ETH".into()), // not in allowed_assets
            actor_id: "agent".into(),
            reason: "test".into(),
        };
        let decision = evaluate(&req);
        assert!(!decision.allowed);
        assert!(decision.reason.contains("asset"));
    }
}
