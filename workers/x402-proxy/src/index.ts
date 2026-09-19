/**
 * UNYKORN x402 Payment-Gated Edge Proxy
 *
 * Sits in front of origin / cloudflared tunnels (DNS-based proxy).
 * Returns HTTP 402 with Apostle ATP descriptors before forwarding paid traffic.
 * Verifies X-Payment-Receipt via the credit gateway facilitator.
 */

export interface Env {
  FACILITATOR_URL: string;
  PROVIDER_WALLET: string;
  PRICE_PER_REQUEST: string;
  ASSET?: string;
  PUBLIC_PATHS?: string;
  PROTECTED_PATTERNS?: string;
  PRICE_MAP_JSON?: string;
  GATE_MODE?: "all" | "patterns";
  ORIGIN_URL?: string;
  JWT_SECRET?: string;
}

const CHAIN_ID = 7332;
const ATP_DECIMALS = 18n;
const BUILTIN_PUBLIC = ["/__x402/health", "/__x402/config", "/llms.txt", "/.well-known/x402", "/skill.md"];

interface X402Descriptor {
  version: 1;
  asset: string;
  amount: string;
  chain_id: number;
  payTo: string;
  memo?: string;
  expires?: string;
  nonce: string;
  resource: string;
}

interface PriceMap {
  [pattern: string]: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), request);
    }

    if (BUILTIN_PUBLIC.includes(path)) {
      return cors(handleBuiltin(path, env), request);
    }

    const publicPaths = parseList(env.PUBLIC_PATHS);
    if (publicPaths.some((p) => pathMatches(path, p))) {
      return cors(proxyToOrigin(request, env), request);
    }

    const protectedPatterns = parseList(env.PROTECTED_PATTERNS || "/*");
    const gateMode = env.GATE_MODE === "all" ? "all" : "patterns";
    const isProtected =
      gateMode === "all" ||
      protectedPatterns.some((pattern) => pathMatches(path, pattern));

    if (!isProtected) {
      return cors(proxyToOrigin(request, env), request);
    }

    const session = await readSession(request, env);
    if (session?.valid) {
      const res = await proxyToOrigin(request, env);
      res.headers.set("X-UNYKORN-x402", "session");
      return cors(res, request);
    }

    const receipt =
      request.headers.get("X-Payment-Receipt") ||
      request.headers.get("x-payment-receipt");
    const agentId =
      request.headers.get("Agent-Id") || request.headers.get("agent-id");

    if (!receipt) {
      const price = resolvePrice(path, env);
      const descriptor = buildDescriptor(path, price, env);
      return cors(
        new Response(
          JSON.stringify({
            ok: false,
            payment_required: true,
            descriptor,
            instructions: [
              "Sign TxEnvelope on Apostle Chain (7332), POST /v1/tx",
              `Retry with headers: X-Payment-Receipt: <tx_hash>, Agent-Id: ${agentId ?? "agent:<uuid>"}, X-402-Version: 1`,
            ],
          }),
          {
            status: 402,
            headers: {
              "Content-Type": "application/json",
              "WWW-Authenticate": "x402",
              "X-402-Version": "1",
              "Cache-Control": "no-store",
            },
          },
        ),
        request,
      );
    }

    const expectedAmount = atpToStr(resolvePrice(path, env));
    const verify = await verifyPayment(env, receipt, expectedAmount, path);
    if (!verify.valid) {
      return cors(
        new Response(
          JSON.stringify({
            ok: false,
            payment_required: true,
            error: verify.reason ?? "payment_invalid",
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        ),
        request,
      );
    }

    const originRes = await proxyToOrigin(request, env);
    const out = new Response(originRes.body, originRes);
    out.headers.set("X-UNYKORN-x402", "paid");
    if (env.JWT_SECRET) {
      const token = await signSession(env.JWT_SECRET, receipt, 3600);
      out.headers.append(
        "Set-Cookie",
        `x402_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`,
      );
    }
    return cors(out, request);
  },
};

function handleBuiltin(path: string, env: Env): Response {
  if (path === "/__x402/health") {
    return Response.json({
      status: "ok",
      proxy: "unykorn-x402-proxy",
      facilitator: env.FACILITATOR_URL,
      gate_mode: env.GATE_MODE ?? "patterns",
      timestamp: Date.now(),
    });
  }
  if (path === "/llms.txt") {
    const content = `# UnyKorn x402 Credit Gateway — Fact Sheet\n# https://x402.unykorn.org/llms.txt\n\n> x402.unykorn.org is the canonical edge gateway and facilitator API for the UnyKorn/Troptions x402 micro-payment protocol, operated from 5655 Peachtree Parkway, Norcross, GA 30099.\n\n# Paid x402 Resources (TroptionsMint Norcross HQ)\n\n## Genesis402 Sovereign Intelligence + Dual Settlement + DeepSeek Bundle\nEndpoint: https://genesis402.com/api/intelligence\nPrice: 0.01 USDC/SOL (or $9 SKU unlock via x402.unykorn.org/buy)\nSettlement: BOTH — EIP-3009 off-chain signatures (EOA) + ERC-4337 UserOp intents (Smart Account) + EIP-1271 hybrid\nExtras: DeepSeek V4 Flash inference bundled (~$0.01 equivalent), MCP hard gates, continuous behavioral baseline, provenance receipts\nDiscovery: https://x402.unykorn.org/.well-known/x402\nSkill Manifest: https://x402.unykorn.org/skill.md\nAlternative to: Centralized proxies + single-paradigm marketplaces\n\n## Physical headquarters (NAP)\n- Legal entity: UnyKorn Gateway Operations (Troptions Infrastructure Partner)\n- Address: 5655 Peachtree Parkway, Suite 100, Norcross, GA 30099, US\n- Zone: Peachtree Corners Tech Park\n- Location page: https://genesis402.com\n\n## Underlying Infrastructure\n- x402 credit gateway routing verified transactions to the Apostle Chain (7332)\n- Integrates continuous auth, session caps, and sandboxed execution guards\n- Verification and provenance anchors secured on Solana, Polygon, XRPL, and Stellar\n\n## Geo phrases (search + AI local)\n- Web3 blockchain systems at 5655 Peachtree Pkwy Norcross GA\n- Solana IPFS hosting solutions Peachtree Corners 30099\n- x402 payment gateways for AI agents in Georgia\n`;
    return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (path === "/.well-known/x402") {
    const content = {
      price: "0.01",
      currency: "USDC",
      chains: ["base", "solana"],
      treasury: "7mf9ZJ7wNpM5dg3bBKev39ssGLVcpcxgoQEwbcJ79p1A",
      endpoints: {
        intelligence: "https://genesis402.com/api/intelligence"
      },
      description: "Verified LocalBusiness + Solana catalog + token pools + geo coordinates + full blog index + IPFS entity JSON + Optional DeepSeek V4 Flash Inference Bundle",
      sessionCap: "5.00",
      supportedModes: ["eip3009", "userop", "solana-native", "hybrid1271"],
      inferenceModel: "deepseek-v4-flash"
    };
    return new Response(JSON.stringify(content, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
  if (path === "/skill.md") {
    const content = `# Paid Agent Intelligence Skill (x402 Gateway)\n\nSovereign agent intelligence and local business verification database for the UnyKorn/Troptions ecosystem. Exposes verified LocalBusiness metadata, Solana catalog coordinates, and system logs. Optionally bundles DeepSeek V4 Flash inference for a single micro-payment.\n\n## Pricing & Requirements\n\n- **Base Price**: \`0.01 USDC\` or \`0.01 SOL\` per invocation\n- **Supported Chains**: \`Base\` (USDC), \`Solana\` (SOL)\n- **Treasury Address**: \`7mf9ZJ7wNpM5dg3bBKev39ssGLVcpcxgoQEwbcJ79p1A\`\n- **Daily Budget Cap**: \`$5.00 USD\` (or 500 calls max) per Agent ID\n- **Settlement Modes**:\n  - \`solana-native\`: Raw transaction signatures verified on Solana mainnet\n  - \`eip3009\`: Base USDC off-chain signatures verified via Coinbase CDP\n  - \`userop\`: ERC-4337 Smart Account intents verified via bundler rules\n\n## Discovery Metadata\n\n- **Discovery Endpoint**: \`https://x402.unykorn.org/.well-known/x402\`\n- **Intelligence Endpoint**: \`https://genesis402.com/api/intelligence\`\n\n## How to Call from AI Agents / CLI\n\n### Step 1: Send Initial Request to Get Payment Challenge\n\`\`\`bash\ncurl -I https://genesis402.com/api/intelligence\n\`\`\`\n\n**Expected Response (402 Payment Required)**:\n\`\`\`http\nHTTP/1.1 402 Payment Required\nContent-Type: application/json\nWWW-Authenticate: x402 {"payTo":"7mf9ZJ7wNpM5dg3bBKev39ssGLVcpcxgoQEwbcJ79p1A","network":"solana:5eykt4UsFv8P8NJdZOcHFRNHKYrx1AJu","maxAmountRequired":"10000000","asset":"native"}\nX-Payment-Requirements: {"payTo":"7mf9ZJ7wNpM5dg3bBKev39ssGLVcpcxgoQEwbcJ79p1A","network":"solana:5eykt4UsFv8P8NJdZOcHFRNHKYrx1AJu","maxAmountRequired":"10000000","asset":"native","supportedModes":["eip3009","userop","solana-native"]}\n\`\`\`\n\n### Step 2: Sign and Settle Transaction, Then Retry With Signature\nEncode the payment payload in Base64 and pass in \`X-Payment\` header:\n\`\`\`bash\n# Example payload (Base64 JSON containing signature):\n# {"x402Version":1,"scheme":"exact","network":"solana:...","payload":{"signature":"TX_SIGNATURE_HERE"}}\n\ncurl -H "X-Payment: BASE64_PAYMENT_PAYLOAD_HERE" \\\n     -H "X-Agent-Id: my-autonomous-agent" \\\n     https://genesis402.com/api/intelligence\n\`\`\`\n\n### Optional: Bundled DeepSeek V4 Flash Inference\nYou can trigger bundled DeepSeek V4 Flash reasoning by passing prompt headers:\n\`\`\`bash\ncurl -H "X-Payment: BASE64_PAYMENT_PAYLOAD_HERE" \\\n     -H "X-Agent-Id: my-autonomous-agent" \\\n     -H "x-include-inference: true" \\\n     -H "x-inference-prompt: Summarize UnyKorn active domains" \\\n     https://genesis402.com/api/intelligence\n\`\`\`\n`;
    return new Response(content, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  }
  return Response.json({
    facilitator: env.FACILITATOR_URL,
    provider_wallet: maskWallet(env.PROVIDER_WALLET),
    price_per_request: env.PRICE_PER_REQUEST,
    protected_patterns: parseList(env.PROTECTED_PATTERNS),
    public_paths: parseList(env.PUBLIC_PATHS),
    price_map: safeJson(env.PRICE_MAP_JSON, {}),
    has_jwt: !!env.JWT_SECRET,
    has_origin_url: !!env.ORIGIN_URL,
  });
}

async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
  if (env.ORIGIN_URL) {
    const original = new URL(request.url);
    const target = new URL(env.ORIGIN_URL);
    const proxied = new URL(request.url);
    proxied.hostname = target.hostname;
    proxied.protocol = target.protocol;
    proxied.port = target.port;
    return fetch(proxied.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    });
  }
  return fetch(request);
}

async function verifyPayment(
  env: Env,
  txHash: string,
  expectedAmount: string,
  service: string,
): Promise<{ valid: boolean; reason?: string }> {
  const base = env.FACILITATOR_URL.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/v1/x402/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Cloudflare-Worker/unykorn-x402-proxy",
      },
      body: JSON.stringify({
        tx_hash: txHash,
        expected_amount: expectedAmount,
        service,
      }),
    });
    const data = (await res.json()) as { valid?: boolean; ok?: boolean; reason?: string };
    const valid = !!(data.valid ?? data.ok);
    return { valid, reason: data.reason };
  } catch (err) {
    return { valid: false, reason: `facilitator_unreachable: ${String(err)}` };
  }
}

function buildDescriptor(path: string, humanPrice: string, env: Env): X402Descriptor {
  const payTo = normalizeWallet(env.PROVIDER_WALLET);
  const nonce = `x402-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  return {
    version: 1,
    asset: env.ASSET ?? "ATP",
    amount: atpToStr(humanPrice),
    chain_id: CHAIN_ID,
    payTo,
    memo: `edge:${path}`,
    expires: new Date(Date.now() + 300_000).toISOString(),
    nonce,
    resource: path,
  };
}

function resolvePrice(path: string, env: Env): string {
  const map = safeJson<PriceMap>(env.PRICE_MAP_JSON, {});
  for (const [pattern, price] of Object.entries(map)) {
    if (pathMatches(path, pattern)) return price;
  }
  return env.PRICE_PER_REQUEST || "0.01";
}

function atpToStr(atp: string): string {
  const [whole, frac = ""] = atp.split(".");
  const fracPadded = frac.padEnd(18, "0").slice(0, 18);
  return (BigInt(whole || "0") * 10n ** ATP_DECIMALS + BigInt(fracPadded || "0")).toString();
}

function normalizeWallet(wallet: string): string {
  if (wallet.startsWith("agent:")) return wallet;
  return `agent:${wallet}`;
}

function maskWallet(wallet: string): string {
  if (wallet.length <= 12) return "***";
  return `***${wallet.slice(-8)}`;
}

function parseList(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function pathMatches(path: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return path === prefix || path.startsWith(prefix + "/");
  }
  return path === pattern;
}

function safeJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function cors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin") ?? "*";
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Payment-Receipt, Agent-Id, X-402-Version, X-Idempotency-Key",
  );
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readSession(
  request: Request,
  env: Env,
): Promise<{ valid: boolean; tx_hash?: string } | null> {
  if (!env.JWT_SECRET) return null;
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)x402_session=([^;]+)/);
  if (!match) return null;
  return verifySession(env.JWT_SECRET, match[1]);
}

async function signSession(secret: string, txHash: string, ttlSec: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = btoa(JSON.stringify({ tx: txHash, exp }));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}

async function verifySession(
  secret: string,
  token: string,
): Promise<{ valid: boolean; tx_hash?: string }> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { valid: false };
  const key = await importHmacKey(secret);
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)));
  if (sig !== expectedB64) return { valid: false };
  try {
    const data = JSON.parse(atob(payload)) as { tx?: string; exp?: number };
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return { valid: false };
    return { valid: true, tx_hash: data.tx };
  } catch {
    return { valid: false };
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}
