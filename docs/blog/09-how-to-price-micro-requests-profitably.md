# How to Price Micro-Requests Profitably

**Published:** 2026-04-04  
**Track:** Provider Monetization  
**Author:** FTH Trading / UnyKorn x402 Team

---

Pricing micro-transactions is a different discipline than pricing subscriptions or seat licenses. The math, the psychology, and the failure modes are all different — because your consumers are agents, not humans, and agents don't have budgetary emotions.

This post covers the principles and math for profitable per-request pricing in an x402-based service.

---

## Principle 1: Agents Are Price-Elastic (to a Point)

Human consumers often pay a premium for simplicity, familiarity, or brand. Agents don't.

An AI agent will route requests to the cheapest provider that meets its quality threshold. If your service and a competitor offer equivalent quality at different prices, the agent will route to the cheaper one — not because it was instructed to be cost-conscious, but because cost optimization is embedded in its decision function.

**Implication**: You need to price at or below your quality-adjusted market. Overpricing by 20% doesn't reduce volume slightly — it can reduce volume to zero if a comparable alternative exists.

**Exception**: If you have a proprietary capability (unique training data, exclusive access to a data source, patented methodology), your price floor is higher because the alternative isn't equivalent. Know your defensible margin.

---

## Principle 2: Your Marginal Cost Is the Floor, Not the Ceiling

The most common pricing mistake for AI API providers is anchoring to cost.

Marginal cost per request for a GPU inference endpoint is typically:
- EC2 inference compute: $0.000040–$0.000200 per request (depending on model size)
- Storage I/O for retrieval: $0.000001–$0.000010 per request
- Network egress: < $0.000001 for typical payloads

Total marginal cost: $0.000041–$0.000211 per request.

If you price at 3x marginal cost, your price is $0.00012–$0.00063. This is operationally fine — you'll cover costs. But you're leaving value on the table if your service is better than alternatives.

**The correct pricing floor** is marginal cost plus the cost of maintaining the service (fixed costs / expected volume). The correct ceiling is what the next-best alternative costs, adjusted for quality differential.

---

## Principle 3: ATP Precision Enables Competitive Separation

With 18 decimal places in ATP, you can price at extremely fine granularity. This matters for competitive positioning.

If your competitor prices at 5,000,000,000,000,000 ATP (0.005), you can price at 4,900,000,000,000,000 (0.0049) — a 2% price advantage. Agents will detect and route to the cheaper option.

Counter: if you have better quality, you can price at 5,100,000,000,000,000 (0.0051) and capture agents that weight quality in their decision function.

ATP's precision lets you compete on economics at a granularity no traditional payment system supports.

---

## Principle 4: Tiered Pricing by Request Complexity

Not all requests are equal. A 256-token inference request and a 4096-token inference request use 16x different compute resources. Flat pricing creates an incentive for consumers to under-use (to avoid overpaying) or misuse (gaming the flat rate for high-resource requests).

x402 lets you build request complexity into the challenge price dynamically:

```python
async def price_for_request(request: Request) -> int:
    body = await request.json()
    token_count = body.get("max_tokens", 512)
    
    BASE_PRICE = 1_000_000_000_000_000   # 0.001 ATP base
    PER_TOKEN_PRICE = 50_000_000_000     # 0.00005 ATP per additional 100 tokens
    
    return BASE_PRICE + (token_count // 100) * PER_TOKEN_PRICE
```

Now a 512-token request costs approximately 3.56× less than a 4096-token request. The economics match the compute reality.

---

## Principle 5: Time-of-Day Pricing (Optional, High Value)

For services with variable load, dynamic pricing is a powerful margin tool.

During peak demand, raise prices. The most price-sensitive traffic routes away (or queues for off-peak). Remaining traffic is higher-margin. Your infrastructure runs at a more consistent load.

During off-peak, lower prices. Attract volume from agents running batch jobs or training pipelines that don't need real-time response.

Implementation in x402:

```python
import datetime

def current_price_multiplier() -> float:
    hour = datetime.datetime.utcnow().hour
    if 14 <= hour <= 20:  # Peak UTC hours (North American business + European evening)
        return 1.5
    elif 0 <= hour <= 6:  # Off-peak
        return 0.7
    return 1.0

async def x402_challenge(service_uri: str, base_price: int) -> Challenge:
    adjusted = int(base_price * current_price_multiplier())
    return await facilitator.create_challenge(service_uri, "ATP", str(adjusted))
```

Agents don't mind — they'll either pay the peak price (if the request is time-sensitive) or wait for off-peak (if it's not). This is exactly market-efficient behavior.

---

## Principle 6: Budget Period Ceiling is Your Retention Tool

On Apostle Chain, operators can set budget periods for their agents — maximum spend in a time window. For service providers, this is a retention lever.

If you know Agent A spends 5,000,000 ATP/week on your service and their operator's budget period ceiling is 6,000,000 ATP/week, Agent A is operating at 83% of ceiling. That agent is likely to either:
- Stay on your service (within ceiling)
- Expand to a second service (hitting ceiling)

If you reduce your price by 5%, Agent A's weekly spend drops to 4,750,000 ATP. Their operator sees better ATP efficiency. They potentially expand their agent's budget period. You've converted a price reduction into a volume expansion.

Modeling this relationship requires understanding your consumers' budget periods — which you can infer from their transaction patterns in the receipt stream.

---

## Practical Example: Pricing an Inference Endpoint

**Specification**: GPT-class inference, 512 tokens typical, 95th percentile response time < 500ms

**Cost analysis**:
- EC2 A10G instance: $1.006/hr → $0.000028 per 100ms inference slot
- Typical 512-token inference: 90ms = $0.000025
- Storage + network overhead: $0.000005
- **Total marginal cost**: $0.000030 per request

**Alternative analysis**:
- OpenAI GPT-4o mini: ~$0.00015 per 1K tokens → 512 tokens ≈ $0.000077 per request
- Anthropic Claude Haiku: ~$0.00025 per 1K tokens → 512 tokens ≈ $0.000128 per request
- Self-hosted llama3 on comparable infrastructure: $0.000025–$0.000045

**Positioning**:
- Below managed cloud (OpenAI/Anthropic): strong price advantage for volume
- Above comparable self-hosted: premium for uptime, support, faster iteration

**Recommendation**: Price at 5,000,000,000,000,000 ATP (0.005 ATP) assuming ATP at $0.01:
- USD equivalent: $0.00005 per request
- Margin over cost: $0.00002 / request (40% margin)
- Versus OpenAI: 35% cheaper
- Required volume to cover $500/month EC2: 10,000,000 requests

---

## The Compounding Advantage

Per-request pricing compounds in a way subscription doesn't.

At 10M requests/month at $0.00005: $500 revenue
At 50M requests/month at $0.00005: $2,500 revenue — linear growth
As agents scale and automate more tasks, they generate more requests. Your revenue scales with agent activity in the broader ecosystem.

When the machine web reaches full activity, the providers who built for per-request economics from the start will be in the right position. The subscription economics holdouts will be negotiating for agent commercial relationships they don't understand.

---

*Use the x402 pricing calculator at [x402api.unykorn.org/pricing] to model your endpoint economics.*
