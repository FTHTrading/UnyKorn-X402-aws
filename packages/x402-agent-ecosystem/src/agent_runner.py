"""
agent_runner.py — Runs the full x402 AI agent ecosystem.

Each agent runs an async loop that:
  1. Fetches its current nonce from Apostle Chain
  2. Selects a commerce target based on role logic
  3. Builds + signs a TxEnvelope (real Ed25519)
  4. POSTs to /v1/tx (fast-path settlement)
  5. Emits a signal to mesh-pulse WebSocket
  6. Sleeps for a role-based interval

Run: python src/agent_runner.py
Requires: keys/agents.json (from bootstrap.py)

Commerce map (who pays whom for what):
  settlement      → treasury         (settlement fees)
  exchange-listing→ intelligence     (price intelligence)
  onboarding      → documentation    (doc lookups)
  market-monitor  → exchange-listing (trade signals)
  wallet-ops      → compliance       (KYC checks)
  reconciliation  → ledger           (ledger access)
  incident-response→ risk            (risk assessments)
  listing-packet  → settlement       (listing execution)
  customer-desk   → onboarding       (agent routing)
  compliance      → policy           (policy queries)
  risk            → compliance       (risk signoffs)
  policy          → treasury         (budget approval)
  treasury        → genesis-treasury (treasury sweeps)
  intelligence    → market-monitor   (data feeds)
  documentation   → listing-packet   (doc packaging)
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import time
from pathlib import Path
from typing import Optional

import aiohttp
import websockets

from tx_builder import build_transfer_tx, atp

APOSTLE_URL = os.environ.get("APOSTLE_URL", "http://localhost:7332")
PULSE_WS_URL = os.environ.get("PULSE_WS_URL", "ws://localhost:3280/pulse/stream")
KEYS_FILE = Path(__file__).parent.parent / "keys" / "agents.json"

# ── Commerce map: label → [target_labels] (picks one per cycle) ──────────────
COMMERCE_MAP: dict[str, list[str]] = {
    "settlement":        ["treasury", "genesis-treasury"],
    "exchange-listing":  ["intelligence", "market-monitor"],
    "onboarding":        ["documentation", "compliance"],
    "market-monitor":    ["exchange-listing", "intelligence"],
    "wallet-ops":        ["compliance", "treasury"],
    "reconciliation":    ["settlement", "treasury"],
    "incident-response": ["risk", "compliance"],
    "listing-packet":    ["settlement", "exchange-listing"],
    "customer-desk":     ["onboarding", "documentation"],
    "compliance":        ["policy", "risk"],
    "risk":              ["compliance", "policy"],
    "policy":            ["treasury", "genesis-treasury"],
    "treasury":          ["genesis-treasury", "x402-credit-pool"],
    "intelligence":      ["market-monitor", "exchange-listing"],
    "documentation":     ["listing-packet", "onboarding"],
    # Operators pay mesh agents for infrastructure
    "kevan-burns-chairman": ["treasury", "settlement"],
    "unykorn-operator":     ["x402-credit-pool", "wallet-ops"],
}

# ── Service URIs for each commerce route ──────────────────────────────────────
SERVICE_URIS: dict[str, str] = {
    "settlement":        "x402://settlement.unykorn.org/v1/settle",
    "exchange-listing":  "x402://exchange.unykorn.org/v1/list",
    "onboarding":        "x402://onboarding.unykorn.org/v1/register",
    "market-monitor":    "x402://monitor.unykorn.org/v1/price-feed",
    "wallet-ops":        "x402://wallet.unykorn.org/v1/provision",
    "reconciliation":    "x402://ledger.unykorn.org/v1/reconcile",
    "incident-response": "x402://guardian.unykorn.org/v1/triage",
    "listing-packet":    "x402://assets.unykorn.org/v1/package",
    "customer-desk":     "x402://desk.unykorn.org/v1/route",
    "compliance":        "x402://compliance.unykorn.org/v1/check",
    "risk":              "x402://risk.unykorn.org/v1/assess",
    "policy":            "x402://policy.unykorn.org/v1/enforce",
    "treasury":          "x402://treasury.unykorn.org/v1/sweep",
    "intelligence":      "x402://intel.unykorn.org/v1/aggregate",
    "documentation":     "x402://docs.unykorn.org/v1/fetch",
}

# ── Commerce amounts by tier (ATP float) ─────────────────────────────────────
TIER_AMOUNTS: dict[str, tuple[float, float]] = {
    "operator":     (50.0, 200.0),
    "control":      (5.0, 25.0),
    "execution":    (1.0, 10.0),
    "intelligence": (2.0, 15.0),
    "interface":    (0.5, 5.0),
}

# ── Sleep intervals between transactions (seconds) ───────────────────────────
TIER_SLEEP: dict[str, tuple[float, float]] = {
    "operator":     (120.0, 300.0),
    "control":      (30.0, 90.0),
    "execution":    (10.0, 40.0),
    "intelligence": (20.0, 60.0),
    "interface":    (15.0, 45.0),
}


class AgentWorker:
    def __init__(self, info: dict, all_agents: dict[str, dict], session: aiohttp.ClientSession):
        self.label = info["label"]
        self.agent_id = info["agent_id"]
        self.tier = info["tier"]
        self.private_key_hex = info["private_key_hex"]
        self.all_agents = all_agents          # label → info
        self.session = session
        self.tx_count = 0
        self.last_error: Optional[str] = None

    async def _get_nonce(self) -> int:
        url = f"{APOSTLE_URL}/v1/agent/{self.agent_id}/balance"
        async with self.session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            data = await resp.json()
            return data.get("nonce", 0)

    async def _submit_tx(self, tx: dict) -> dict:
        async with self.session.post(
            f"{APOSTLE_URL}/v1/tx",
            json=tx,
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            return await resp.json()

    def _pick_target(self) -> Optional[dict]:
        targets = COMMERCE_MAP.get(self.label, [])
        if not targets:
            # Fallback: pick random agent from another tier
            others = [a for l, a in self.all_agents.items() if l != self.label]
            return random.choice(others) if others else None
        random.shuffle(targets)
        for t in targets:
            if t in self.all_agents:
                return self.all_agents[t]
        return None

    def _pick_amount(self) -> str:
        lo, hi = TIER_AMOUNTS.get(self.tier, (1.0, 5.0))
        amt_float = round(random.uniform(lo, hi), 2)
        return atp(amt_float)

    async def run_once(self, ws_queue: asyncio.Queue):
        try:
            target = self._pick_target()
            if not target:
                return
            nonce = await self._get_nonce()
            amount = self._pick_amount()
            service_uri = SERVICE_URIS.get(self.label)
            tx = build_transfer_tx(
                from_uuid=self.agent_id,
                to_uuid=target["agent_id"],
                amount_base_units=amount,
                private_key_hex=self.private_key_hex,
                nonce=nonce,
                service_uri=service_uri,
            )
            result = await self._submit_tx(tx)
            self.tx_count += 1
            ok = result.get("ok", False)
            status = "OK" if ok else f"ERR:{result.get('error','?')}"
            print(f"  [{self.label}] → [{target['label']}] {int(amount)//10**18:.1f} ATP | nonce={nonce} | {status}")

            # Push to WS broadcast queue
            await ws_queue.put({
                "event": "x402_transaction",
                "from": self.label,
                "from_id": self.agent_id,
                "to": target["label"],
                "to_id": target["agent_id"],
                "amount": amount,
                "tier": self.tier,
                "tx_hash": tx["hash"],
                "ok": ok,
                "ts": tx["timestamp"],
            })
            self.last_error = None
        except Exception as e:
            self.last_error = str(e)
            print(f"  [{self.label}] ERROR: {e}")

    async def loop(self, ws_queue: asyncio.Queue):
        lo, hi = TIER_SLEEP.get(self.tier, (15.0, 45.0))
        # Stagger startup
        await asyncio.sleep(random.uniform(0.5, 8.0))
        while True:
            await self.run_once(ws_queue)
            await asyncio.sleep(random.uniform(lo, hi))


# ── Mesh-pulse WebSocket broadcaster ─────────────────────────────────────────

async def ws_broadcaster(ws_queue: asyncio.Queue):
    """Drains the queue and fans signals out to mesh-pulse WebSocket."""
    while True:
        try:
            async with websockets.connect(
                PULSE_WS_URL,
                ping_interval=20,
                ping_timeout=10,
                open_timeout=10,
            ) as ws:
                print(f"[ws-broadcaster] Connected to {PULSE_WS_URL}")
                while True:
                    try:
                        msg = await asyncio.wait_for(ws_queue.get(), timeout=30.0)
                        await ws.send(json.dumps(msg))
                        ws_queue.task_done()
                    except asyncio.TimeoutError:
                        # Keep alive
                        await ws.ping()
        except Exception as e:
            print(f"[ws-broadcaster] Disconnected ({e}), reconnecting in 5s…")
            await asyncio.sleep(5.0)


# ── Stats reporter ────────────────────────────────────────────────────────────

async def stats_reporter(workers: list[AgentWorker]):
    while True:
        await asyncio.sleep(30.0)
        total_txs = sum(w.tx_count for w in workers)
        active = sum(1 for w in workers if w.last_error is None)
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f"{APOSTLE_URL}/status", timeout=aiohttp.ClientTimeout(total=5)) as r:
                    chain = await r.json()
        except Exception:
            chain = {}
        print(
            f"\n[stats] height={chain.get('height','?')} | "
            f"agents={chain.get('agents','?')} | "
            f"total_txs={total_txs} | "
            f"active_workers={active}/{len(workers)}\n"
        )


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    if not KEYS_FILE.exists():
        print(f"[agent_runner] Keys not found at {KEYS_FILE}")
        print("[agent_runner] Run: python src/bootstrap.py  first")
        return

    data = json.loads(KEYS_FILE.read_text())
    agents_list = data["agents"]
    all_agents = {a["label"]: a for a in agents_list}

    print(f"[agent_runner] Loaded {len(agents_list)} agents")
    print(f"[agent_runner] Apostle URL: {APOSTLE_URL}")
    print(f"[agent_runner] Pulse WS:    {PULSE_WS_URL}")
    print("[agent_runner] Starting agent loops…\n")

    ws_queue: asyncio.Queue = asyncio.Queue(maxsize=500)

    async with aiohttp.ClientSession() as session:
        workers = [AgentWorker(a, all_agents, session) for a in agents_list]

        tasks = [
            asyncio.create_task(w.loop(ws_queue)) for w in workers
        ]
        tasks.append(asyncio.create_task(ws_broadcaster(ws_queue)))
        tasks.append(asyncio.create_task(stats_reporter(workers)))

        print(f"[agent_runner] {len(workers)} worker loops + WS broadcaster + stats reporter running")
        await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
