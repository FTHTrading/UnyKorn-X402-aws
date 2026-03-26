/**
 * FTH x402 Facilitator — A2A (Agent-to-Agent) Discovery Routes
 *
 * Implements Google's Agent-to-Agent (A2A) protocol for agent discovery.
 * Serves agent cards at /.well-known/agent.json so that other agents,
 * orchestrators, and AI systems can discover available paid APIs and
 * capabilities automatically.
 *
 * Also serves:
 *   /.well-known/x402-pay       — x402 payment protocol descriptor
 *   /.well-known/ai-plugin.json — OpenAI plugin manifest
 *   /.well-known/openapi.json   — OpenAPI 3.1 spec for paid routes
 */

import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// A2A Agent Card (Google Agent-to-Agent Protocol)
// ---------------------------------------------------------------------------

const AGENT_CARD = {
  name: "FTH x402 Payment Facilitator",
  description:
    "Enterprise-grade agent-native payment infrastructure. Provides x402 HTTP " +
    "payment challenges, prepaid credit ledger, multi-rail settlement " +
    "(UnyKorn L1, Stellar, XRPL), receipt anchoring, and treasury management. " +
    "Agents pay micro-amounts in UNY to access premium APIs, data packs, " +
    "trade verification, and financial services.",
  url: "https://facilitator.l1.unykorn.org",
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
    stateTransitionHistory: true,
  },
  authentication: {
    schemes: [
      {
        scheme: "x402",
        description:
          "HTTP 402 Payment Required — sign a payment proof with your wallet " +
          "and attach to the retry request. Supports Ed25519 (UnyKorn L1), " +
          "Stellar signed_auth, and XRPL tx_hash.",
      },
      {
        scheme: "bearer",
        description: "Admin API token for operator endpoints.",
      },
      {
        scheme: "apiKey",
        in: "header",
        name: "X-Admin-Token",
        description: "Legacy admin auth header for operator routes.",
      },
    ],
  },
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  skills: [
    // --- Revenue-generating paid routes (through gateway) ---
    {
      id: "agent-pay-api",
      name: "Agent Pay API",
      description:
        "Pay-per-call proxy to premium AI and data provider APIs. " +
        "Agents pay 0.0001 UNY per call and get authenticated access to " +
        "OpenAI, ElevenLabs, and other provider APIs through the FTH gateway.",
      tags: ["payment", "api-proxy", "ai", "monetization"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
      examples: [
        {
          name: "Call via gateway",
          description: "Hit the paid route — if no proof, receive 402 with invoice.",
          input: { method: "GET", path: "/api/v1/agent/pay-api/demo" },
          output: { status: 402, headers: { "X-Payment-Required": "<base64-invoice>" } },
        },
      ],
    },
    {
      id: "genesis-repro-pack",
      name: "Genesis Reproduction Pack",
      description:
        "Access premium genesis reproduction data packs for AI training " +
        "and simulation. 0.0005 UNY per suite download.",
      tags: ["data", "genesis", "ai-training", "premium-content"],
      inputModes: ["application/json"],
      outputModes: ["application/json", "application/octet-stream"],
    },
    {
      id: "trade-verify",
      name: "Trade Verification",
      description:
        "Verify trade-finance transactions on the UnyKorn L1 ledger. " +
        "Returns cryptographic proof of trade settlement. 0.00025 UNY per verification.",
      tags: ["trade-finance", "verification", "settlement", "compliance"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "invoice-export",
      name: "Invoice Export",
      description:
        "Export invoices in PDF or JSON format. Requires Pro PASS level. " +
        "0.001 UNY per export.",
      tags: ["invoices", "export", "compliance", "reporting"],
      inputModes: ["application/json"],
      outputModes: ["application/json", "application/pdf"],
    },
    // --- Free facilitator capabilities ---
    {
      id: "credit-deposit",
      name: "Prepaid Credit Deposit",
      description:
        "Deposit UNY credits to a prepaid account for frictionless API access. " +
        "No per-call wallet signing needed after deposit.",
      tags: ["credits", "deposit", "prepaid", "wallet"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "wallet-register",
      name: "Wallet Registration",
      description:
        "Register an Ed25519 wallet public key for x402 payment proof signing.",
      tags: ["wallet", "registration", "onboarding"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "namespace-resolve",
      name: "Namespace Resolution",
      description:
        "Resolve fully-qualified names (FQNs) to their backing services, " +
        "wallets, or resources in the FTH namespace registry.",
      tags: ["namespace", "dns", "resolution", "discovery"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "receipt-verify",
      name: "Receipt Verification",
      description:
        "Verify payment receipts anchored on the UnyKorn L1 blockchain. " +
        "Provides cryptographic proof that a payment was made and settled.",
      tags: ["receipts", "verification", "audit", "compliance"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
};

// ---------------------------------------------------------------------------
// x402 Payment Protocol Descriptor
// ---------------------------------------------------------------------------

const X402_PAY_DESCRIPTOR = {
  version: "2.0",
  protocol: "x402",
  description:
    "x402 HTTP Payment Required protocol implementation. " +
    "Send a request to a paid route — receive a 402 with a payment invoice " +
    "in the X-Payment-Required header. Sign a proof with your wallet, " +
    "resubmit, and receive the resource along with a receipt.",
  facilitator: "https://facilitator.l1.unykorn.org",
  gateway: "https://api.fth.trading",
  treasury: "https://treasury.l1.unykorn.org",
  supported_rails: [
    {
      rail: "unykorn-l1",
      asset: "UNY",
      description: "Native UnyKorn L1 settlement — instant finality, lowest fees.",
      chain_id: 43114,
    },
    {
      rail: "stellar",
      asset: "sUSDF",
      description: "Stellar bridge — sign a Stellar transaction as payment proof.",
      network: "testnet",
    },
    {
      rail: "xrpl",
      asset: "xUSDF",
      description: "XRPL mirror — submit an XRPL payment hash as proof.",
    },
  ],
  payment_flow: [
    "1. GET /api/v1/<paid-route> → 402 + X-Payment-Required header (base64 invoice)",
    "2. Decode invoice JSON: { invoice_id, amount, asset, receiver, expires_at }",
    "3. Sign proof: Ed25519 signature over <invoice_id>|<nonce>|<payer>",
    "4. POST /api/v1/<paid-route> with X-PAYMENT-SIGNATURE header",
    "5. Receive 200 + resource + X-PAYMENT-RESPONSE (receipt)",
  ],
  sdk: {
    npm: "fth-x402-sdk",
    repository: "https://github.com/FTHTrading/UnyKorn-X402-aws/tree/main/packages/fth-x402-sdk",
    description: "TypeScript SDK with automatic 402 interception, retry, and wallet signing.",
  },
  pricing: {
    routes: [
      { path: "/api/v1/agent/pay-api/:provider", amount: "0.0001", asset: "UNY" },
      { path: "/api/v1/genesis/repro-pack/:suite", amount: "0.0005", asset: "UNY" },
      { path: "/api/v1/trade/verify/:trade_id", amount: "0.00025", asset: "UNY" },
      { path: "/api/v1/invoices/export/:format", amount: "0.001", asset: "UNY" },
    ],
  },
  onboarding: {
    steps: [
      "1. Register wallet: POST /credits/register { wallet_address, pubkey }",
      "2. Deposit credits: POST /credits/deposit { wallet, amount }",
      "3. Start calling paid routes — proof is auto-deducted from credits",
    ],
  },
};

// ---------------------------------------------------------------------------
// OpenAI-compatible Plugin Manifest
// ---------------------------------------------------------------------------

const AI_PLUGIN_MANIFEST = {
  schema_version: "v1",
  name_for_human: "FTH x402 Payment Gateway",
  name_for_model: "fth_x402_payments",
  description_for_human:
    "Access premium APIs, data packs, and trade verification via micro-payments.",
  description_for_model:
    "Provides pay-per-call access to premium APIs through the x402 HTTP payment " +
    "protocol. Users pay tiny amounts of UNY cryptocurrency to access AI APIs, " +
    "genesis data packs, trade verification, and invoice exports. " +
    "The system handles payment automatically: first call returns a 402 with an invoice, " +
    "sign a proof with your wallet, resend, and get the resource.",
  auth: {
    type: "none",
    instructions:
      "Authentication is handled via x402 payment proofs in HTTP headers. " +
      "No API key needed — just a wallet with UNY credits.",
  },
  api: {
    type: "openapi",
    url: "https://facilitator.l1.unykorn.org/.well-known/openapi.json",
    is_user_authenticated: false,
  },
  logo_url: "https://fthtrading.com/assets/x402-logo.png",
  contact_email: "ops@fthtrading.com",
  legal_info_url: "https://fthtrading.com/legal",
};

// ---------------------------------------------------------------------------
// OpenAPI 3.1 Specification
// ---------------------------------------------------------------------------

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "FTH x402 Payment Gateway API",
    version: "2.0.0",
    description:
      "Agent-native payment infrastructure built on the x402 HTTP protocol. " +
      "All paid routes return 402 Payment Required with an invoice. " +
      "Sign a payment proof and resend to access the resource.",
    contact: { email: "ops@fthtrading.com", url: "https://fthtrading.com" },
    license: { name: "Proprietary", url: "https://fthtrading.com/license" },
  },
  servers: [
    { url: "https://api.fth.trading", description: "Production gateway (edge)" },
    { url: "https://facilitator.l1.unykorn.org", description: "Facilitator (settlement)" },
    { url: "http://localhost:3100", description: "Local development" },
  ],
  paths: {
    "/api/v1/agent/pay-api/{provider}": {
      get: {
        operationId: "agentPayApi",
        summary: "Pay-per-call AI & data API proxy",
        description: "Proxies requests to premium AI providers after micro-payment. 0.0001 UNY per call.",
        tags: ["Paid Routes"],
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" }, description: "Provider name (e.g. 'demo', 'openai', 'elevenlabs')" },
        ],
        responses: {
          "200": { description: "Resource delivered after successful payment" },
          "402": {
            description: "Payment Required — invoice in X-Payment-Required header",
            headers: {
              "X-Payment-Required": {
                description: "Base64-encoded JSON invoice",
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/api/v1/genesis/repro-pack/{suite}": {
      get: {
        operationId: "genesisReproPack",
        summary: "Download genesis reproduction data pack",
        description: "Access premium genesis reproduction data. 0.0005 UNY per suite.",
        tags: ["Paid Routes"],
        parameters: [
          { name: "suite", in: "path", required: true, schema: { type: "string" }, description: "Suite name (e.g. 'alpha', 'beta')" },
        ],
        responses: {
          "200": { description: "Data pack delivered" },
          "402": { description: "Payment Required" },
        },
      },
    },
    "/api/v1/trade/verify/{trade_id}": {
      get: {
        operationId: "tradeVerify",
        summary: "Verify trade settlement on L1",
        description: "Returns cryptographic proof of trade settlement. 0.00025 UNY per query.",
        tags: ["Paid Routes"],
        parameters: [
          { name: "trade_id", in: "path", required: true, schema: { type: "string" }, description: "Trade ID (e.g. 'TRD-001')" },
        ],
        responses: {
          "200": { description: "Trade verification result" },
          "402": { description: "Payment Required" },
        },
      },
    },
    "/api/v1/invoices/export/{format}": {
      get: {
        operationId: "invoiceExport",
        summary: "Export invoices (Pro PASS required)",
        description: "Export invoices in PDF or JSON. 0.001 UNY. Requires Pro PASS level.",
        tags: ["Paid Routes"],
        parameters: [
          { name: "format", in: "path", required: true, schema: { type: "string", enum: ["pdf", "json"] } },
        ],
        responses: {
          "200": { description: "Invoice export delivered" },
          "402": { description: "Payment Required" },
        },
      },
    },
    "/credits/register": {
      post: {
        operationId: "registerWallet",
        summary: "Register wallet for x402 payments",
        tags: ["Onboarding"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["wallet_address", "pubkey"],
                properties: {
                  wallet_address: { type: "string", description: "Hex wallet address" },
                  pubkey: { type: "string", description: "Ed25519 public key (base64)" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Wallet registered" },
          "400": { description: "Invalid input" },
        },
      },
    },
    "/credits/deposit": {
      post: {
        operationId: "depositCredits",
        summary: "Deposit prepaid credits",
        tags: ["Onboarding"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["wallet", "amount"],
                properties: {
                  wallet: { type: "string" },
                  amount: { type: "string", description: "Amount in UNY (e.g. '10.0')" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Credits deposited" },
        },
      },
    },
    "/credits/{wallet}": {
      get: {
        operationId: "getBalance",
        summary: "Get wallet credit balance",
        tags: ["Credits"],
        parameters: [
          { name: "wallet", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Balance returned" },
        },
      },
    },
    "/health": {
      get: {
        operationId: "healthCheck",
        summary: "Service health check",
        tags: ["System"],
        responses: {
          "200": { description: "Service is healthy" },
        },
      },
    },
    "/namespaces/{fqn}": {
      get: {
        operationId: "resolveNamespace",
        summary: "Resolve a namespace FQN",
        tags: ["Namespace"],
        parameters: [
          { name: "fqn", in: "path", required: true, schema: { type: "string" }, description: "Fully-qualified name (e.g. 'fth.x402.route.agent-pay-api')" },
        ],
        responses: {
          "200": { description: "Namespace record" },
          "404": { description: "Not found" },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export default async function a2aRoutes(app: FastifyInstance): Promise<void> {
  // A2A Agent Card — the primary discovery endpoint
  app.get("/.well-known/agent.json", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json")
      .header("Cache-Control", "public, max-age=3600")
      .header("Access-Control-Allow-Origin", "*")
      .send(AGENT_CARD);
  });

  // x402 Payment Protocol descriptor
  app.get("/.well-known/x402-pay", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json")
      .header("Cache-Control", "public, max-age=3600")
      .header("Access-Control-Allow-Origin", "*")
      .send(X402_PAY_DESCRIPTOR);
  });

  // OpenAI Plugin manifest
  app.get("/.well-known/ai-plugin.json", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json")
      .header("Cache-Control", "public, max-age=3600")
      .header("Access-Control-Allow-Origin", "*")
      .send(AI_PLUGIN_MANIFEST);
  });

  // OpenAPI 3.1 spec
  app.get("/.well-known/openapi.json", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json")
      .header("Cache-Control", "public, max-age=3600")
      .header("Access-Control-Allow-Origin", "*")
      .send(OPENAPI_SPEC);
  });

  // Service discovery index — lists all .well-known endpoints
  app.get("/.well-known/", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json")
      .header("Access-Control-Allow-Origin", "*")
      .send({
        service: "fth-x402-facilitator",
        discovery: {
          "agent.json": "/.well-known/agent.json — A2A Agent Card (Google Agent-to-Agent protocol)",
          "x402-pay": "/.well-known/x402-pay — x402 payment protocol descriptor",
          "ai-plugin.json": "/.well-known/ai-plugin.json — OpenAI plugin manifest",
          "openapi.json": "/.well-known/openapi.json — OpenAPI 3.1 specification",
          "stellar.toml": "/.well-known/stellar.toml — Stellar SEP-0001 anchor descriptor",
        },
        a2a: {
          protocol: "https://google.github.io/A2A/",
          card: "/.well-known/agent.json",
        },
      });
  });
}
