//! SQLite-backed key metadata store and audit log.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use crate::policy::WalletDomain;

// ── Key Metadata ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct KeyRecord {
    pub id: String,
    pub public_key_hex: String,
    /// Encrypted or reference — never raw private key in this field
    pub private_key_ref: String,
    pub domain: String,
    pub algorithm: String,
    pub created_by: String,
    pub created_at: String,
    pub rotated_from: Option<String>,
    pub revoked: bool,
    pub revoked_at: Option<String>,
    pub label: Option<String>,
}

// ── Audit Event ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AuditEvent {
    pub id: String,
    pub key_id: String,
    pub action: String,
    pub domain: String,
    pub actor_id: String,
    pub payload_hash: String,
    pub result: String,
    pub reason: String,
    pub timestamp: String,
}

// ── Store ──────────────────────────────────────────────────

#[derive(Clone)]
pub struct Store {
    pool: SqlitePool,
}

impl Store {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = SqlitePool::connect(database_url).await?;
        let store = Self { pool };
        store.migrate().await?;
        Ok(store)
    }

    async fn migrate(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS keys (
                id TEXT PRIMARY KEY,
                public_key_hex TEXT NOT NULL UNIQUE,
                private_key_ref TEXT NOT NULL,
                domain TEXT NOT NULL,
                algorithm TEXT NOT NULL DEFAULT 'ed25519',
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                rotated_from TEXT,
                revoked INTEGER NOT NULL DEFAULT 0,
                revoked_at TEXT,
                label TEXT
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                key_id TEXT NOT NULL,
                action TEXT NOT NULL,
                domain TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                payload_hash TEXT NOT NULL,
                result TEXT NOT NULL,
                reason TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_audit_key ON audit_log(key_id)",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp)",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ── Key Operations ─────────────────────────────────

    pub async fn insert_key(&self, rec: &KeyRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO keys (id, public_key_hex, private_key_ref, domain, algorithm, created_by, created_at, rotated_from, revoked, revoked_at, label)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&rec.id)
        .bind(&rec.public_key_hex)
        .bind(&rec.private_key_ref)
        .bind(&rec.domain)
        .bind(&rec.algorithm)
        .bind(&rec.created_by)
        .bind(&rec.created_at)
        .bind(&rec.rotated_from)
        .bind(rec.revoked)
        .bind(&rec.revoked_at)
        .bind(&rec.label)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_key(&self, id: &str) -> Result<Option<KeyRecord>, sqlx::Error> {
        sqlx::query_as::<_, KeyRecord>("SELECT * FROM keys WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn get_key_by_public(&self, public_key_hex: &str) -> Result<Option<KeyRecord>, sqlx::Error> {
        sqlx::query_as::<_, KeyRecord>("SELECT * FROM keys WHERE public_key_hex = ?")
            .bind(public_key_hex)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn list_keys(&self, domain: Option<&str>, limit: i64, offset: i64) -> Result<Vec<KeyRecord>, sqlx::Error> {
        if let Some(d) = domain {
            sqlx::query_as::<_, KeyRecord>(
                "SELECT * FROM keys WHERE domain = ? AND revoked = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?",
            )
            .bind(d)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
        } else {
            sqlx::query_as::<_, KeyRecord>(
                "SELECT * FROM keys WHERE revoked = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?",
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
        }
    }

    pub async fn revoke_key(&self, id: &str) -> Result<bool, sqlx::Error> {
        let now = Utc::now().to_rfc3339();
        let result = sqlx::query("UPDATE keys SET revoked = 1, revoked_at = ? WHERE id = ? AND revoked = 0")
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Audit Operations ───────────────────────────────

    pub async fn append_audit(&self, event: &AuditEvent) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO audit_log (id, key_id, action, domain, actor_id, payload_hash, result, reason, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&event.id)
        .bind(&event.key_id)
        .bind(&event.action)
        .bind(&event.domain)
        .bind(&event.actor_id)
        .bind(&event.payload_hash)
        .bind(&event.result)
        .bind(&event.reason)
        .bind(&event.timestamp)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_audit_by_key(&self, key_id: &str, limit: i64) -> Result<Vec<AuditEvent>, sqlx::Error> {
        sqlx::query_as::<_, AuditEvent>(
            "SELECT * FROM audit_log WHERE key_id = ? ORDER BY timestamp DESC LIMIT ?",
        )
        .bind(key_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn get_recent_audit(&self, limit: i64) -> Result<Vec<AuditEvent>, sqlx::Error> {
        sqlx::query_as::<_, AuditEvent>(
            "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
    }

    /// Create an audit helper.
    pub fn audit(
        key_id: &str,
        action: &str,
        domain: &WalletDomain,
        actor_id: &str,
        payload_hash: &str,
        result: &str,
        reason: &str,
    ) -> AuditEvent {
        AuditEvent {
            id: Uuid::new_v4().to_string(),
            key_id: key_id.to_string(),
            action: action.to_string(),
            domain: serde_json::to_string(domain).unwrap_or_default().trim_matches('"').to_string(),
            actor_id: actor_id.to_string(),
            payload_hash: payload_hash.to_string(),
            result: result.to_string(),
            reason: reason.to_string(),
            timestamp: Utc::now().to_rfc3339(),
        }
    }
}
