"""
digital_twin_server.py — Serves the x402 Digital Twin UI + data feeds.

Endpoints:
  GET  /              → digital_twin.html
  GET  /api/agents    → live agent list with ATP balances from Apostle Chain
  GET  /api/chain     → Apostle Chain /status
  WS   /ws            → live event stream (proxied from mesh-pulse + chain polling)

Run: python src/digital_twin_server.py
Port: 8402
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Optional, Set

import aiohttp
from aiohttp import web
import websockets

APOSTLE_URL = os.environ.get("APOSTLE_URL", "http://localhost:7332")
PULSE_WS_URL = os.environ.get("PULSE_WS_URL", "ws://localhost:3280/pulse/stream")
KEYS_FILE = Path(__file__).parent.parent / "keys" / "agents.json"
STATIC_DIR = Path(__file__).parent.parent / "static"
PORT = int(os.environ.get("TWIN_PORT", 8402))

# ── Live subscribers + event queue (initialised inside event loop) ────────────
_subscribers: Set[web.WebSocketResponse] = set()
_event_queue: Optional[asyncio.Queue] = None


def _load_agent_labels() -> dict[str, str]:
    """Returns {uuid: label} from keys file."""
    if not KEYS_FILE.exists():
        return {}
    data = json.loads(KEYS_FILE.read_text())
    return {a["agent_id"]: a["label"] for a in data["agents"]}


# ── HTTP handlers ─────────────────────────────────────────────────────────────

async def handle_index(request: web.Request):
    html_path = STATIC_DIR / "digital_twin.html"
    if not html_path.exists():
        return web.Response(status=404, text="digital_twin.html not found")
    return web.FileResponse(html_path)


async def handle_agents(request: web.Request):
    labels = _load_agent_labels()
    results = []
    async with aiohttp.ClientSession() as session:
        tasks = []
        uuids = list(labels.keys())
        for uid in uuids:
            url = f"{APOSTLE_URL}/v1/agent/{uid}/balance"
            tasks.append(session.get(url, timeout=aiohttp.ClientTimeout(total=5)))
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        for uid, resp in zip(uuids, responses):
            if isinstance(resp, Exception):
                results.append({"agent_id": uid, "label": labels[uid], "balance": "0", "nonce": 0})
                continue
            async with resp as r:
                body = await r.json()
            balance = body.get("balances", {}).get("ATP", "0")
            results.append({
                "agent_id": uid,
                "label": labels[uid],
                "balance": balance,
                "nonce": body.get("nonce", 0),
            })
    return web.json_response({"ok": True, "agents": results})


async def handle_chain(request: web.Request):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{APOSTLE_URL}/status",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                data = await resp.json()
        return web.json_response(data)
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=502)


async def handle_receipts(request: web.Request):
    """Proxy the last N receipts from Apostle Chain."""
    limit = min(int(request.rel_url.query.get("limit", "50")), 200)
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{APOSTLE_URL}/v1/receipts",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                data = await resp.json()
        receipts = data.get("receipts", [])[-limit:]
        return web.json_response({"ok": True, "receipts": receipts, "count": len(receipts)})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=502)


async def handle_stats(request: web.Request):
    """Aggregate stats: chain status + per-agent balances + subscriber count."""
    labels = _load_agent_labels()
    try:
        async with aiohttp.ClientSession() as session:
            # Chain status
            chain_data = {}
            try:
                async with session.get(f"{APOSTLE_URL}/status", timeout=aiohttp.ClientTimeout(total=5)) as r:
                    chain_data = await r.json()
            except Exception:
                pass

            # All agent balances in parallel
            uuids = list(labels.keys())
            tasks = [session.get(f"{APOSTLE_URL}/v1/agent/{uid}/balance", timeout=aiohttp.ClientTimeout(total=5)) for uid in uuids]
            responses = await asyncio.gather(*tasks, return_exceptions=True)

            agents = []
            total_atp = 0
            for uid, resp in zip(uuids, responses):
                if isinstance(resp, Exception):
                    agents.append({"agent_id": uid, "label": labels[uid], "balance": "0", "nonce": 0})
                    continue
                async with resp as r:
                    body = await r.json()
                bal = body.get("balances", {}).get("ATP", "0")
                try:
                    total_atp += int(bal)
                except Exception:
                    pass
                agents.append({"agent_id": uid, "label": labels[uid], "balance": bal, "nonce": body.get("nonce", 0)})

        return web.json_response({
            "ok": True,
            "chain": chain_data,
            "agents": agents,
            "total_atp_base_units": str(total_atp),
            "subscribers": len(_subscribers),
        })
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=502)


async def handle_ws(request: web.Request):
    ws = web.WebSocketResponse(heartbeat=30.0)
    await ws.prepare(request)
    _subscribers.add(ws)
    try:
        async for msg in ws:
            pass  # client messages ignored
    finally:
        _subscribers.discard(ws)
    return ws


# ── Background: fan out events to all WS subscribers ─────────────────────────

async def fanout_loop():
    while True:
        event = await _event_queue.get()
        payload = json.dumps(event)
        dead = set()
        for ws in list(_subscribers):
            try:
                await ws.send_str(payload)
            except Exception:
                dead.add(ws)
        _subscribers.difference_update(dead)


async def heartbeat_loop():
    """Pings all WS subscribers every 25s to keep connections alive."""
    while True:
        await asyncio.sleep(25.0)
        for ws in list(_subscribers):
            try:
                await ws.ping()
            except Exception:
                _subscribers.discard(ws)


# ── Background: proxy from mesh-pulse WebSocket ───────────────────────────────

async def pulse_proxy():
    while True:
        try:
            async with websockets.connect(
                PULSE_WS_URL,
                ping_interval=20,
                ping_timeout=10,
                open_timeout=10,
            ) as ws:
                print(f"[pulse-proxy] Connected to {PULSE_WS_URL}")
                async for raw in ws:
                    try:
                        event = json.loads(raw)
                        await _event_queue.put(event)
                    except Exception:
                        pass
        except Exception as e:
            print(f"[pulse-proxy] Disconnected ({e}), retry in 5s…")
            await asyncio.sleep(5.0)


# ── Background: Apostle Chain polling (chain height, receipt stream) ──────────

async def chain_poller():
    """Polls /status and /v1/receipts every 5s, pushes synthetic events."""
    last_height = 0
    seen_hashes: set[str] = set()
    async with aiohttp.ClientSession() as session:
        while True:
            await asyncio.sleep(5.0)
            try:
                async with session.get(
                    f"{APOSTLE_URL}/status",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as r:
                    status = await r.json()
                height = status.get("height", 0)
                if height != last_height:
                    last_height = height
                    await _event_queue.put({"event": "block", "height": height})
            except Exception:
                pass

            try:
                async with session.get(
                    f"{APOSTLE_URL}/v1/receipts",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as r:
                    receipts = await r.json()
                for rec in receipts.get("receipts", []):
                    h = rec.get("tx_hash") or rec.get("hash") or str(rec)
                    if h not in seen_hashes:
                        seen_hashes.add(h)
                        await _event_queue.put({"event": "receipt", **rec})
                # Bound the seen set to avoid unbounded memory growth
                if len(seen_hashes) > 10_000:
                    seen_hashes.clear()
            except Exception:
                pass


# ── App factory ───────────────────────────────────────────────────────────────

async def create_app():
    app = web.Application()
    app.router.add_get("/", handle_index)
    app.router.add_get("/api/agents", handle_agents)
    app.router.add_get("/api/chain", handle_chain)
    app.router.add_get("/api/receipts", handle_receipts)
    app.router.add_get("/api/stats", handle_stats)
    app.router.add_get("/ws", handle_ws)
    app.router.add_static("/static", STATIC_DIR, show_index=False)
    return app


async def main():
    global _event_queue
    _event_queue = asyncio.Queue(maxsize=2000)

    app = await create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)

    tasks = [
        asyncio.create_task(fanout_loop()),
        asyncio.create_task(heartbeat_loop()),
        asyncio.create_task(pulse_proxy()),
        asyncio.create_task(chain_poller()),
    ]

    await site.start()
    print(f"[digital-twin] Serving at http://0.0.0.0:{PORT}")
    print(f"[digital-twin] Apostle URL: {APOSTLE_URL}")
    print(f"[digital-twin] Pulse WS:    {PULSE_WS_URL}")
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
