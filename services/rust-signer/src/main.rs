//! UnyKorn Rust Signer — Custody-grade internal signer and key orchestration service.
//!
//! Handles Ed25519 keygen, signing, verification with policy enforcement,
//! audit logging, and key lifecycle management.

mod crypto;
mod policy;
mod routes;
mod store;

use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "rust_signer=info,tower_http=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Database path from env or default
    let db_url = std::env::var("SIGNER_DB_URL")
        .unwrap_or_else(|_| "sqlite:signer.db?mode=rwc".to_string());
    let port: u16 = std::env::var("SIGNER_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4050);

    tracing::info!("Initializing store at {}", db_url);
    let store = store::Store::new(&db_url)
        .await
        .expect("Failed to initialize database");

    let state = routes::AppState { store };
    let app = routes::router(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("rust-signer listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    axum::serve(listener, app)
        .await
        .expect("Server error");
}
