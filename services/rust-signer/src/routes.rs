//! Axum HTTP routes for the signer service.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::crypto;
use crate::policy::{self, SignRequest, WalletDomain};
use crate::store::{KeyRecord, Store};

// ── App State ──────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub store: Store,
}

// ── Request / Response types ───────────────────────────────

#[derive(Deserialize)]
pub struct GenerateKeyReq {
    pub domain: WalletDomain,
    pub label: Option<String>,
    pub actor_id: String,
}

#[derive(Serialize)]
pub struct GenerateKeyRes {
    pub key_id: String,
    pub public_key: String,
    pub domain: WalletDomain,
    pub algorithm: String,
    /// Private key returned ONLY on generation. Caller must store it.
    pub private_key: String,
}

#[derive(Deserialize)]
pub struct SignReq {
    pub key_id: String,
    pub domain: WalletDomain,
    pub action: policy::SignAction,
    pub payload_hex: String,
    pub amount_usd: Option<f64>,
    pub counterparty: Option<String>,
    pub asset: Option<String>,
    pub actor_id: String,
    pub reason: String,
}

#[derive(Serialize)]
pub struct SignRes {
    pub signature: String,
    pub public_key: String,
    pub policy_decision: policy::PolicyDecision,
}

#[derive(Deserialize)]
pub struct VerifyReq {
    pub public_key_hex: String,
    pub payload_hex: String,
    pub signature_hex: String,
}

#[derive(Serialize)]
pub struct VerifyRes {
    pub valid: bool,
}

#[derive(Deserialize)]
pub struct RotateReq {
    pub actor_id: String,
    pub reason: String,
}

#[derive(Serialize)]
pub struct KeyMeta {
    pub id: String,
    pub public_key: String,
    pub domain: String,
    pub algorithm: String,
    pub created_by: String,
    pub created_at: String,
    pub rotated_from: Option<String>,
    pub revoked: bool,
    pub label: Option<String>,
}

#[derive(Deserialize)]
pub struct ListKeysQuery {
    pub domain: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Deserialize)]
pub struct AuditQuery {
    pub key_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Serialize)]
pub struct HealthRes {
    pub service: String,
    pub status: String,
    pub uptime_secs: u64,
    pub timestamp: String,
}

// ── Routes ─────────────────────────────────────────────────

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/keys/generate", post(generate_key))
        .route("/keys", get(list_keys))
        .route("/keys/{id}/meta", get(key_meta))
        .route("/keys/{id}/rotate", post(rotate_key))
        .route("/sign", post(sign))
        .route("/verify", post(verify))
        .route("/policies/evaluate-sign-request", post(evaluate_policy))
        .route("/audit", get(audit_log))
        .with_state(state)
}

// ── Handlers ───────────────────────────────────────────────

async fn health() -> Json<HealthRes> {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    let start = START.get_or_init(std::time::Instant::now);

    Json(HealthRes {
        service: "rust-signer".to_string(),
        status: "healthy".to_string(),
        uptime_secs: start.elapsed().as_secs(),
        timestamp: Utc::now().to_rfc3339(),
    })
}

async fn generate_key(
    State(state): State<AppState>,
    Json(req): Json<GenerateKeyReq>,
) -> Result<(StatusCode, Json<GenerateKeyRes>), (StatusCode, String)> {
    let (public_hex, private_hex) = crypto::generate_ed25519();
    let key_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // Store key metadata (private_key_ref is NOT the raw key in production — use encrypted ref)
    let record = KeyRecord {
        id: key_id.clone(),
        public_key_hex: public_hex.clone(),
        private_key_ref: private_hex.clone(), // TODO: encrypt or use vault reference
        domain: serde_json::to_string(&req.domain).unwrap_or_default().trim_matches('"').to_string(),
        algorithm: "ed25519".to_string(),
        created_by: req.actor_id.clone(),
        created_at: now.clone(),
        rotated_from: None,
        revoked: false,
        revoked_at: None,
        label: req.label.clone(),
    };

    state.store.insert_key(&record).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("db error: {e}"))
    })?;

    // Audit
    let event = Store::audit(
        &key_id, "generate", &req.domain, &req.actor_id,
        "n/a", "success", "key generated",
    );
    let _ = state.store.append_audit(&event).await;

    Ok((StatusCode::CREATED, Json(GenerateKeyRes {
        key_id,
        public_key: public_hex,
        domain: req.domain,
        algorithm: "ed25519".to_string(),
        private_key: private_hex,
    })))
}

async fn sign(
    State(state): State<AppState>,
    Json(req): Json<SignReq>,
) -> Result<Json<SignRes>, (StatusCode, String)> {
    // Policy check first
    let sign_req = SignRequest {
        key_id: req.key_id.clone(),
        domain: req.domain,
        action: req.action,
        payload_hex: req.payload_hex.clone(),
        amount_usd: req.amount_usd,
        counterparty: req.counterparty.clone(),
        asset: req.asset.clone(),
        actor_id: req.actor_id.clone(),
        reason: req.reason.clone(),
    };
    let decision = policy::evaluate(&sign_req);

    // Hash the payload for audit
    let payload_bytes = hex::decode(&req.payload_hex).unwrap_or_default();
    let payload_hash = hex::encode(Sha256::digest(&payload_bytes));

    if !decision.allowed {
        // Audit the rejection
        let event = Store::audit(
            &req.key_id, "sign_rejected", &req.domain, &req.actor_id,
            &payload_hash, "denied", &decision.reason,
        );
        let _ = state.store.append_audit(&event).await;

        return Err((StatusCode::FORBIDDEN, decision.reason.clone()));
    }

    // Fetch key
    let key = state.store.get_key(&req.key_id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("db error: {e}")))?
        .ok_or((StatusCode::NOT_FOUND, "key not found".to_string()))?;

    if key.revoked {
        return Err((StatusCode::FORBIDDEN, "key is revoked".to_string()));
    }

    // Sign
    let signature = crypto::sign_ed25519(&payload_bytes, &key.private_key_ref)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("sign error: {e}")))?;

    // Audit success
    let event = Store::audit(
        &req.key_id, "sign", &req.domain, &req.actor_id,
        &payload_hash, "success", &req.reason,
    );
    let _ = state.store.append_audit(&event).await;

    Ok(Json(SignRes {
        signature,
        public_key: key.public_key_hex,
        policy_decision: decision,
    }))
}

async fn verify(
    Json(req): Json<VerifyReq>,
) -> Result<Json<VerifyRes>, (StatusCode, String)> {
    let payload_bytes = hex::decode(&req.payload_hex)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("bad payload hex: {e}")))?;

    let valid = crypto::verify_ed25519(&payload_bytes, &req.signature_hex, &req.public_key_hex)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    Ok(Json(VerifyRes { valid }))
}

async fn key_meta(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<KeyMeta>, (StatusCode, String)> {
    let key = state.store.get_key(&id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("db error: {e}")))?
        .ok_or((StatusCode::NOT_FOUND, "key not found".to_string()))?;

    Ok(Json(KeyMeta {
        id: key.id,
        public_key: key.public_key_hex,
        domain: key.domain,
        algorithm: key.algorithm,
        created_by: key.created_by,
        created_at: key.created_at,
        rotated_from: key.rotated_from,
        revoked: key.revoked,
        label: key.label,
    }))
}

async fn rotate_key(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<RotateReq>,
) -> Result<(StatusCode, Json<GenerateKeyRes>), (StatusCode, String)> {
    // Get old key
    let old_key = state.store.get_key(&id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("db error: {e}")))?
        .ok_or((StatusCode::NOT_FOUND, "key not found".to_string()))?;

    if old_key.revoked {
        return Err((StatusCode::CONFLICT, "key already revoked".to_string()));
    }

    let domain: WalletDomain = serde_json::from_str(&format!("\"{}\"", old_key.domain))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "invalid domain in db".to_string()))?;

    // Revoke old key
    state.store.revoke_key(&id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("revoke error: {e}")))?;

    // Generate new key
    let (public_hex, private_hex) = crypto::generate_ed25519();
    let new_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let record = KeyRecord {
        id: new_id.clone(),
        public_key_hex: public_hex.clone(),
        private_key_ref: private_hex.clone(),
        domain: old_key.domain.clone(),
        algorithm: "ed25519".to_string(),
        created_by: req.actor_id.clone(),
        created_at: now,
        rotated_from: Some(id.clone()),
        revoked: false,
        revoked_at: None,
        label: old_key.label,
    };

    state.store.insert_key(&record).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("db error: {e}")))?;

    // Audit
    let event = Store::audit(
        &new_id, "rotate", &domain, &req.actor_id,
        &id, "success", &req.reason,
    );
    let _ = state.store.append_audit(&event).await;

    Ok((StatusCode::CREATED, Json(GenerateKeyRes {
        key_id: new_id,
        public_key: public_hex,
        domain,
        algorithm: "ed25519".to_string(),
        private_key: private_hex,
    })))
}

async fn list_keys(
    State(state): State<AppState>,
    Query(q): Query<ListKeysQuery>,
) -> Result<Json<Vec<KeyMeta>>, (StatusCode, String)> {
    let limit = q.limit.unwrap_or(50).min(500);
    let offset = q.offset.unwrap_or(0);
    let keys = state.store.list_keys(q.domain.as_deref(), limit, offset).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("db error: {e}")))?;

    Ok(Json(keys.into_iter().map(|k| KeyMeta {
        id: k.id,
        public_key: k.public_key_hex,
        domain: k.domain,
        algorithm: k.algorithm,
        created_by: k.created_by,
        created_at: k.created_at,
        rotated_from: k.rotated_from,
        revoked: k.revoked,
        label: k.label,
    }).collect()))
}

async fn evaluate_policy(
    State(state): State<AppState>,
    Json(req): Json<SignReq>,
) -> Json<policy::PolicyDecision> {
    let sign_req = SignRequest {
        key_id: req.key_id.clone(),
        domain: req.domain,
        action: req.action,
        payload_hex: req.payload_hex,
        amount_usd: req.amount_usd,
        counterparty: req.counterparty,
        asset: req.asset,
        actor_id: req.actor_id.clone(),
        reason: req.reason,
    };
    let decision = policy::evaluate(&sign_req);

    // Audit the evaluation
    let event = Store::audit(
        &req.key_id, "policy_evaluate", &req.domain, &req.actor_id,
        "n/a", if decision.allowed { "allowed" } else { "denied" }, &decision.reason,
    );
    let _ = state.store.append_audit(&event).await;

    Json(decision)
}

async fn audit_log(
    State(state): State<AppState>,
    Query(q): Query<AuditQuery>,
) -> Result<Json<Vec<crate::store::AuditEvent>>, (StatusCode, String)> {
    let limit = q.limit.unwrap_or(100).min(1000);

    let events = if let Some(ref key_id) = q.key_id {
        state.store.get_audit_by_key(key_id, limit).await
    } else {
        state.store.get_recent_audit(limit).await
    };

    events.map(Json).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("db error: {e}")))
}
