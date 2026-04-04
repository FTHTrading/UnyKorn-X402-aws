"""
tx_builder.py — Builds and signs Apostle Chain TxEnvelopes.

Hash: BLAKE3(chain_id_le_u32 || nonce_le_u64 || canonical_json(payload))
Signature: Ed25519(private_key_bytes, hash_bytes_32) → 128-char hex
"""
from __future__ import annotations

import json
import struct
from datetime import datetime, timezone
from typing import Optional

import blake3
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

CHAIN_ID = 7332
ATP_DECIMALS = 18
ATP_UNIT = 10 ** ATP_DECIMALS  # 1 ATP in base units


def atp(amount_float: float) -> str:
    """Convert float ATP to base-unit string (e.g. 1.5 → '1500000000000000000')."""
    return str(int(amount_float * ATP_UNIT))


def _canonical_payload(payload: dict) -> bytes:
    """Produce canonical JSON bytes matching Rust serde_json::to_vec."""
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def compute_hash(chain_id: int, nonce: int, payload: dict) -> bytes:
    """BLAKE3 hash: chain_id(LE u32) || nonce(LE u64) || json(payload)."""
    h = blake3.blake3()
    h.update(struct.pack("<I", chain_id))   # u32 LE
    h.update(struct.pack("<Q", nonce))      # u64 LE
    h.update(_canonical_payload(payload))
    return h.digest()


def sign_tx(private_key_hex: str, hash_bytes: bytes) -> str:
    """Ed25519 sign the 32-byte hash, returns 128-char hex signature."""
    sk = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(private_key_hex))
    sig = sk.sign(hash_bytes)
    return sig.hex()


def build_transfer_tx(
    from_uuid: str,
    to_uuid: str,
    amount_base_units: str,       # string u128
    private_key_hex: str,
    nonce: int,
    asset: str = "ATP",
    service_uri: Optional[str] = None,
) -> dict:
    """Build a fully-signed transfer TxEnvelope ready for POST /v1/tx."""
    payload: dict = {
        "type": "transfer",
        "to": to_uuid,
        "asset": asset,
        "amount": amount_base_units,
    }
    if service_uri:
        payload["service_uri"] = service_uri

    hash_bytes = compute_hash(CHAIN_ID, nonce, payload)
    signature = sign_tx(private_key_hex, hash_bytes)

    return {
        "hash": hash_bytes.hex(),
        "from": from_uuid,
        "nonce": nonce,
        "chain_id": CHAIN_ID,
        "payload": payload,
        "signature": signature,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    }
