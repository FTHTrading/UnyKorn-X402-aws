# Receipts, Metering, and Evidence in Agent-Native Systems

**Published:** 2026-04-04  
**Track:** Technical Authority  
**Author:** FTH Trading / UnyKorn x402 Team

---

Traditional API metering is a counting problem. You count requests, aggregate by period, compare against tier limits, generate an invoice. This works because the consumer is a human who approves the invoice and pays a bill.

In agent-native systems, metering is a different problem. The consumer is autonomous. The payments are real-time. The evidence requirements are higher. And the accounting system needs to produce artifacts that are verifiable by parties who weren't present at the transaction.

x402 on Apostle Chain approaches metering as an evidence production problem.

---

## What Metering Needs to Do in an Agent-Native System

For human API consumers, metering answers: "How much did you use this month?"

For agent-native systems, metering needs to answer:

1. **Factual queries**: How many requests did agent A make in window W? What did it pay per request? What services did it access?
2. **Verification queries**: Did this specific transaction actually happen? Who signed it? Was it settled?
3. **Aggregation queries**: What is the total ATP in circulation? What is the spend rate by agent tier? What is the service utilization by endpoint?
4. **Evidence queries**: Produce a tamper-evident bundle of all activity by agent X for the period 2026-Q1, suitable for compliance review.

Traditional billing databases handle (1) and (3) reasonably well. They fail at (2) and (4) entirely — because they are not designed to produce cryptographic evidence.

---

## The Receipt as the Atomic Evidence Unit

On Apostle Chain, every settled transaction produces a receipt stored at the block level. Receipts are:

- **Content-addressed**: The `tx_hash` is derived from the transaction envelope, meaning any modification produces a different hash
- **Chain-anchored**: Stored at a specific `height` in the canonical block sequence
- **Dual-verified**: Both sender and receiver sign; settlement confirms both sides acknowledged the transaction
- **Immutable**: Block history cannot be rewritten without breaking chain consensus (BFT-equivalent guarantee)

A receipt is not a billing record. It's a cryptographic fact.

```json
{
  "receipt_id": "a9f2c3e1-...",
  "tx_hash": "7d8f3a21b4c9e0...",
  "height": 2847,
  "settled_at": "2026-04-04T14:22:07.813000Z",
  "from_agent": "agent:87724c76-da93-4b1a-9fa6-271ba856338e",
  "from_label": "market-monitor",
  "to_agent": "agent:3a11f204-...",
  "to_label": "settlement",
  "service_uri": "x402://settlement.internal/v1/execute",
  "asset": "ATP",
  "amount": "5000000000000000",
  "status": "settled",
  "proof_hash": "b7d3a9f2...",
  "chain_sig": "ed25519:..."
}
```

The `chain_sig` is produced by the Apostle Chain consensus layer at the time the block is finalized. It is a signature over the Merkle root of all transactions in that block, binding this receipt to a specific moment in chain history.

---

## Querying the Receipt Stream

The Apostle Chain `/v1/receipts` endpoint provides a queryable ledger of all settled transactions:

```bash
# Last 50 receipts (default)
GET /v1/receipts

# Filter by agent
GET /v1/receipts?agent=87724c76-da93-4b1a-9fa6-271ba856338e

# Filter by block height range
GET /v1/receipts?from_height=2800&to_height=2900

# Filter by service URI
GET /v1/receipts?service=x402://settlement.internal/v1/execute

# Filter by asset
GET /v1/receipts?asset=ATP
```

These filters can be combined. This is the data plane for all metering queries.

---

## Building a Metering Layer on Top

For providers who want richer analytics than raw receipt queries, the receipt stream is the foundation for a custom metering layer.

A minimal metering implementation:

```python
import asyncio
import httpx
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class AgentMetrics:
    request_count: int = 0
    total_atp_paid: int = 0
    services_accessed: set = field(default_factory=set)
    first_seen: datetime = None
    last_seen: datetime = None

class MeteringService:
    def __init__(self, chain_url: str):
        self.chain_url = chain_url
        self.metrics: dict[str, AgentMetrics] = defaultdict(AgentMetrics)
        self._last_height = 0
    
    async def poll_receipts(self):
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.chain_url}/v1/receipts",
                params={"from_height": self._last_height + 1}
            )
            receipts = r.json().get("receipts", [])
        
        for receipt in receipts:
            agent_id = receipt["from_agent"]
            m = self.metrics[agent_id]
            m.request_count += 1
            m.total_atp_paid += int(receipt["amount"])
            m.services_accessed.add(receipt["service_uri"])
            
            ts = datetime.fromisoformat(receipt["settled_at"])
            if m.first_seen is None or ts < m.first_seen:
                m.first_seen = ts
            if m.last_seen is None or ts > m.last_seen:
                m.last_seen = ts
            
            if receipt["height"] > self._last_height:
                self._last_height = receipt["height"]
    
    def get_summary(self) -> dict:
        return {
            agent_id: {
                "requests": m.request_count,
                "atp_paid": str(m.total_atp_paid),
                "services": list(m.services_accessed),
                "first_seen": m.first_seen.isoformat() if m.first_seen else None,
                "last_seen": m.last_seen.isoformat() if m.last_seen else None,
            }
            for agent_id, m in self.metrics.items()
        }
    
    async def start(self):
        while True:
            await self.poll_receipts()
            await asyncio.sleep(5)
```

This simple metering service produces per-agent request counts, total ATP paid, and service access patterns — from receipts alone, without any coordination with the services being accessed.

---

## Evidence Bundle Assembly

For compliance review or dispute resolution, the receipt stream can be assembled into an evidence bundle:

```python
async def compile_evidence_bundle(
    chain_url: str,
    agent_id: str,
    from_height: int,
    to_height: int
) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{chain_url}/v1/receipts",
            params={
                "agent": agent_id.replace("agent:", ""),
                "from_height": from_height,
                "to_height": to_height,
                "limit": 10000
            }
        )
        receipts = r.json()["receipts"]
        
        # Fetch chain signature over this block range
        sig_r = await client.get(
            f"{chain_url}/v1/chain/range-signature",
            params={"from": from_height, "to": to_height}
        )
        chain_attestation = sig_r.json()
    
    return {
        "bundle_version": "1.0",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "scope": {
            "agent_id": agent_id,
            "from_height": from_height,
            "to_height": to_height,
        },
        "receipt_count": len(receipts),
        "receipts": receipts,
        "chain_attestation": chain_attestation,
        "merkle_root": chain_attestation["merkle_root"],
    }
```

The output is a self-contained, verifiable JSON artifact that any third party can validate against the public chain — without trusting your metering system.

---

## Why This Matters for Service Reliability

For providers, receipt-based metering has one operational advantage beyond compliance: **you know your revenue in real time**.

Traditional billing systems produce revenue data with 24-hour lag (end-of-day aggregation) or 30-day lag (monthly invoicing). x402 receipt queries are real-time to within one block time (50ms on Apostle Chain).

If your service receives an unexpected spike in requests (good: you're making more money), you see it immediately in the receipt stream. If your service is underperforming (bad: agents are routing elsewhere), your receipt count drops and you know within minutes.

Evidence production and real-time revenue visibility aren't separate capabilities. They're the same receipt stream, queried at different intervals for different purposes.

---

*The receipt query API reference is available at [apostle.unykorn.org/docs/receipts]. For evidence bundle format documentation, see the x402 facilitator SDK docs.*
