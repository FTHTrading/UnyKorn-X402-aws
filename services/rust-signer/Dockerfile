# ===========================================================================
# rust-signer — Multi-stage build
# ===========================================================================
# Stage 1: Build the binary
FROM rust:1.85-slim-bookworm AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src/ src/

# Build release binary (static linking for smaller image)
RUN apt-get update && apt-get install -y pkg-config && \
    cargo build --release && \
    strip target/release/rust-signer

# Stage 2: Minimal runtime image
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd -r signer && useradd -r -g signer -d /app signer
WORKDIR /app

COPY --from=builder /build/target/release/rust-signer /app/rust-signer

# SQLite database will be stored in a volume
RUN mkdir -p /app/data && chown -R signer:signer /app
VOLUME /app/data

USER signer

ENV SIGNER_HOST=0.0.0.0
ENV SIGNER_PORT=4050
ENV SIGNER_DB_PATH=/app/data/signer.db

EXPOSE 4050

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD curl -sf http://127.0.0.1:4050/health || exit 1

ENTRYPOINT ["/app/rust-signer"]
