"""
bootstrap.py — Re-airdrops all x402 mesh agents to get fresh Ed25519 keypairs.

Run once: python src/bootstrap.py
Output: keys/agents.json  (gitignored — private keys stored here)

This hits /v1/airdrop with each existing agent UUID so the chain:
  1. Generates a new Ed25519 keypair
  2. Re-registers the agent with the new public key
  3. Credits ATP (real amounts per tier — not 1 base unit)
  4. Returns the private_key_hex
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import urllib.request
import urllib.error

APOSTLE_URL = os.environ.get("APOSTLE_URL", "http://localhost:7332")
KEYS_FILE = Path(__file__).parent.parent / "keys" / "agents.json"
REGISTRY_FILE = Path(__file__).parent.parent.parent.parent / "registry" / "apostle-agents-7332.json"

# 1 ATP = 10^18 base units
_ATP = 10 ** 18

# Agents to bootstrap — all mesh agents + operator wallets
AGENT_DEFINITIONS = [
    # ── Operator wallets ─────────────────────────────────────────────────────
    {"label": "kevan-burns-chairman",  "agent_id": "87724c76-da93-4b1a-9fa6-271ba856338e", "tier": "operator",     "apo_amount": str(500_000 * _ATP)},
    {"label": "genesis-treasury",      "agent_id": "caf9cf0c-1d11-4632-a7c1-188c7fd95ebd", "tier": "operator",     "apo_amount": str(1_000_000 * _ATP)},
    {"label": "unykorn-operator",      "agent_id": "d55c60a0-5087-434c-9860-35fcd519eca4", "tier": "operator",     "apo_amount": str(250_000 * _ATP)},
    {"label": "x402-credit-pool",      "agent_id": "7f0d2538-c09b-46f6-93ef-7be0cc5feab5", "tier": "operator",     "apo_amount": str(500_000 * _ATP)},
    {"label": "mesh-pay-reserve",      "agent_id": "adf01234-e3f3-40f7-a59c-a9d6c7592c1a", "tier": "operator",     "apo_amount": str(200_000 * _ATP)},
    # ── Control tier ─────────────────────────────────────────────────────────
    {"label": "treasury",              "agent_id": "2e5d78c2-1e58-4cf7-88eb-a139c6c620ef", "tier": "control",      "apo_amount": str(100_000 * _ATP)},
    {"label": "compliance",            "agent_id": "164d75a7-87d5-425b-a051-417bb8d99836", "tier": "control",      "apo_amount": str(100_000 * _ATP)},
    {"label": "policy",                "agent_id": "867c0d41-3e01-4028-97f9-cd8f6e5f6214", "tier": "control",      "apo_amount": str(100_000 * _ATP)},
    {"label": "risk",                  "agent_id": "87e76b9e-8482-436c-823b-980068dff480", "tier": "control",      "apo_amount": str(100_000 * _ATP)},
    # ── Execution tier ───────────────────────────────────────────────────────
    {"label": "exchange-listing",      "agent_id": "07c62dc1-0f4f-4633-adff-3fa684611502", "tier": "execution",    "apo_amount": str(50_000 * _ATP)},
    {"label": "listing-packet",        "agent_id": "3268af3d-016f-426f-a849-5ff366ce3efe", "tier": "execution",    "apo_amount": str(50_000 * _ATP)},
    {"label": "onboarding",            "agent_id": "3b76ff5a-b426-4506-b94c-d09e467febb5", "tier": "execution",    "apo_amount": str(50_000 * _ATP)},
    {"label": "wallet-ops",            "agent_id": "7bb4032b-a446-4a24-ae0e-0da9b3712c3d", "tier": "execution",    "apo_amount": str(50_000 * _ATP)},
    {"label": "reconciliation",        "agent_id": "58216231-2d7d-4236-bb3a-1ca0679075be", "tier": "execution",    "apo_amount": str(30_000 * _ATP)},
    {"label": "incident-response",     "agent_id": "2a3523f6-0778-46cc-ba8e-79afb6905a2c", "tier": "execution",    "apo_amount": str(30_000 * _ATP)},
    {"label": "settlement",            "agent_id": "73a8658a-3cde-4b50-8720-97611d577209", "tier": "execution",    "apo_amount": str(100_000 * _ATP)},
    {"label": "documentation",         "agent_id": "3f621911-3a00-469c-b186-fd3c46d009bc", "tier": "execution",    "apo_amount": str(30_000 * _ATP)},
    # ── Intelligence tier ────────────────────────────────────────────────────
    {"label": "market-monitor",        "agent_id": "7162580d-e519-4162-b18b-bee69b063fa0", "tier": "intelligence", "apo_amount": str(30_000 * _ATP)},
    {"label": "intelligence",          "agent_id": "b1859b36-fb49-4e11-bf5f-a544097495b1", "tier": "intelligence", "apo_amount": str(50_000 * _ATP)},
    # ── Interface tier ───────────────────────────────────────────────────────
    {"label": "customer-desk",         "agent_id": "a15174da-264f-4784-b5a0-3fb171a93f81", "tier": "interface",    "apo_amount": str(30_000 * _ATP)},
]


def _post_json(url: str, data: dict) -> dict:
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": e.read().decode("utf-8", errors="replace")}


def bootstrap():
    print(f"[bootstrap] Apostle URL: {APOSTLE_URL}")
    print(f"[bootstrap] Bootstrapping {len(AGENT_DEFINITIONS)} agents ...")

    recipients = [
        {
            "agent_id": a["agent_id"],
            "label": a["label"],
            "apo_amount": a["apo_amount"],
        }
        for a in AGENT_DEFINITIONS
    ]

    result = _post_json(f"{APOSTLE_URL}/v1/airdrop", {"recipients": recipients})

    if not result.get("ok"):
        print(f"[bootstrap] FAILED: {json.dumps(result, indent=2)}")
        sys.exit(1)

    dropped = result.get("dropped", 0)
    print(f"[bootstrap] Airdrop OK -- {dropped} agents re-keyed")

    # Map results by label
    result_map = {r["label"]: r for r in result.get("results", [])}

    keys_out = []
    registry_updates = {}
    for agent_def in AGENT_DEFINITIONS:
        label = agent_def["label"]
        r = result_map.get(label)
        if not r:
            print(f"  [WARN] No result for {label}")
            continue

        raw_id = r["agent_id"].replace("agent:", "")
        atp_bal = int(r.get("apo_balance", 0)) // _ATP
        entry = {
            "label": label,
            "agent_id": raw_id,
            "tier": agent_def["tier"],
            "private_key_hex": r["private_key_hex"],
            "public_key_hex": r["public_key_hex"],
            "apo_balance": str(r.get("apo_balance", 0)),
        }
        keys_out.append(entry)
        registry_updates[label] = {
            "agent_id": raw_id,
            "public_key": r["public_key_hex"],
            "tier": agent_def["tier"],
        }
        print(f"  ok {label} | {raw_id[:8]}... | pub={r['public_key_hex'][:16]}... | {atp_bal:,} ATP")

    # Save keys
    KEYS_FILE.parent.mkdir(parents=True, exist_ok=True)
    KEYS_FILE.write_text(json.dumps({"agents": keys_out}, indent=2))
    print(f"\n[bootstrap] Keys saved -> {KEYS_FILE}")

    # Update registry JSON with new public keys
    if REGISTRY_FILE.exists():
        registry = json.loads(REGISTRY_FILE.read_text())
        for label, upd in registry_updates.items():
            if label in registry.get("operators", {}):
                registry["operators"][label]["public_key"] = upd["public_key"]
            elif label in registry.get("mesh_agents", {}):
                registry["mesh_agents"][label]["public_key"] = upd["public_key"]
        REGISTRY_FILE.write_text(json.dumps(registry, indent=2))
        print(f"[bootstrap] Registry updated -> {REGISTRY_FILE}")

    print("\n[bootstrap] SUCCESS -- run: python src/agent_runner.py")


if __name__ == "__main__":
    bootstrap()
