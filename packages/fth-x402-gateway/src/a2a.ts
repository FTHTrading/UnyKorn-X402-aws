/**
 * FTH x402 Gateway — A2A Agent Card (Edge)
 *
 * Returns the gateway-level A2A agent card for the Cloudflare Worker edge.
 * This is the first thing any agent hits when discovering the FTH payment gateway.
 *
 * Served at:
 *   /.well-known/agent.json
 *   /.well-known/x402-pay
 *   /.well-known/ai-plugin.json
 *   /.well-known/openapi.json
 */

const GATEWAY_AGENT_CARD = {
  name: "FTH x402 Payment Gateway",
  description:
    "Edge payment gateway implementing the x402 HTTP Payment Required protocol. " +
    "Routes all paid API requests, enforces payment challenges, verifies proofs " +
    "via the UnyKorn Facilitator, and delivers premium resources. " +
    "Deployed at Cloudflare's edge for global low-latency access.",
  url: "https://api.fth.trading",
  version: "2.0.0",
  protocol: "a2a",
  protocolVersion: "0.2",
  provider: {
    organization: "FTH Trading Limited",
    url: "https://fthtrading.com",
    contact: "ops@fthtrading.com",
  },
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  authentication: {
    schemes: [
      {
        scheme: "x402",
        description:
          "HTTP 402 Payment Required. Hit any paid route without proof to receive " +
          "a 402 response with invoice. Sign proof with wallet, resend to pay and access.",
      },
    ],
  },
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  skills: [
    {
      id: "agent-pay-api",
      name: "Agent Pay API Proxy",
      description:
        "Pay-per-call proxy to premium AI and data provider APIs. " +
        "0.0001 UNY per call. Supports OpenAI, ElevenLabs, and custom providers.",
      tags: ["payment", "api-proxy", "ai", "monetization"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "genesis-repro-pack",
      name: "Genesis Reproduction Pack",
      description:
        "Premium genesis data packs for AI training and simulation. " +
        "0.0005 UNY per suite download.",
      tags: ["data", "genesis", "ai-training", "premium-content"],
      inputModes: ["application/json"],
      outputModes: ["application/json", "application/octet-stream"],
    },
    {
      id: "trade-verify",
      name: "Trade Verification",
      description:
        "Verify trade-finance transactions on UnyKorn L1. " +
        "0.00025 UNY per verification.",
      tags: ["trade-finance", "verification", "settlement"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "invoice-export",
      name: "Invoice Export",
      description:
        "Export invoices in PDF or JSON. Pro PASS required. 0.001 UNY per export.",
      tags: ["invoices", "export", "reporting"],
      inputModes: ["application/json"],
      outputModes: ["application/json", "application/pdf"],
    },
  ],
};

const X402_PAY_DESCRIPTOR = {
  version: "2.0",
  protocol: "x402",
  description:
    "x402 HTTP Payment Required — the internet-native payment protocol. " +
    "Send a request to any paid route, receive a 402 with an invoice, " +
    "sign a proof, resend, and get the resource.",
  gateway: "https://api.fth.trading",
  facilitator: "https://facilitator.l1.unykorn.org",
  supported_rails: ["unykorn-l1", "stellar", "xrpl"],
  supported_assets: ["UNY", "sUSDF", "xUSDF"],
  pricing: [
    { route: "/api/v1/agent/pay-api/:provider", amount: "0.0001", asset: "UNY" },
    { route: "/api/v1/genesis/repro-pack/:suite", amount: "0.0005", asset: "UNY" },
    { route: "/api/v1/trade/verify/:trade_id", amount: "0.00025", asset: "UNY" },
    { route: "/api/v1/invoices/export/:format", amount: "0.001", asset: "UNY" },
  ],
  onboarding_url: "https://facilitator.l1.unykorn.org/credits/register",
  sdk_url: "https://github.com/FTHTrading/UnyKorn-X402-aws/tree/main/packages/fth-x402-sdk",
};

const AI_PLUGIN = {
  schema_version: "v1",
  name_for_human: "FTH x402 Payment Gateway",
  name_for_model: "fth_x402_payments",
  description_for_human:
    "Access premium APIs and data via micro-payments on the x402 protocol.",
  description_for_model:
    "Pay-per-call access to premium APIs through x402 HTTP payment protocol. " +
    "Agents pay micro UNY amounts. First call returns 402 with invoice; sign proof; resend for resource.",
  auth: { type: "none" },
  api: {
    type: "openapi",
    url: "https://facilitator.l1.unykorn.org/.well-known/openapi.json",
  },
  logo_url: "https://fthtrading.com/assets/x402-logo.png",
  contact_email: "ops@fthtrading.com",
  legal_info_url: "https://fthtrading.com/legal",
};

/**
 * Handle /.well-known/* requests at the edge.
 * Returns null if the path is not a .well-known route.
 */
export function handleWellKnown(pathname: string): Response | null {
  switch (pathname) {
    case "/.well-known/agent.json":
      return jsonResponse(GATEWAY_AGENT_CARD);
    case "/.well-known/x402-pay":
      return jsonResponse(X402_PAY_DESCRIPTOR);
    case "/.well-known/ai-plugin.json":
      return jsonResponse(AI_PLUGIN);
    case "/.well-known/":
      return jsonResponse({
        gateway: "fth-x402",
        discovery: {
          "agent.json": "A2A Agent Card (Google Agent-to-Agent protocol)",
          "x402-pay": "x402 payment protocol descriptor",
          "ai-plugin.json": "OpenAI-compatible plugin manifest",
          "openapi.json": "Available at facilitator: https://facilitator.l1.unykorn.org/.well-known/openapi.json",
        },
        a2a: {
          protocol: "https://google.github.io/A2A/",
          card: "/.well-known/agent.json",
        },
      });
    default:
      return null;
  }
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
