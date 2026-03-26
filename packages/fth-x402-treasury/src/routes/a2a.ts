/**
 * FTH x402 Treasury — A2A Discovery Routes
 *
 * Serves the treasury agent card for A2A discovery.
 * Agents use this to find treasury auto-refill, fund management,
 * and exposure monitoring capabilities.
 */

import type { FastifyInstance } from "fastify";

const TREASURY_AGENT_CARD = {
  name: "FTH x402 Treasury",
  description:
    "Autonomous treasury management and agent funding service. Manages per-agent " +
    "wallet balances, auto-refill policies, exposure monitoring, and spending limits. " +
    "Integrates with the FTH x402 Facilitator and Guardian daemon army.",
  url: "https://treasury.l1.unykorn.org",
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
        scheme: "bearer",
        description: "Service-to-service HMAC auth or admin bearer token.",
      },
    ],
  },
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  skills: [
    {
      id: "agent-register",
      name: "Register Agent Wallet",
      description:
        "Register a new agent wallet for treasury management with auto-refill policies.",
      tags: ["onboarding", "wallet", "treasury"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "agent-fund",
      name: "Fund Agent",
      description:
        "Manually fund an agent wallet with UNY credits, on-chain UNY, or mixed.",
      tags: ["funding", "credits", "wallet"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "agent-refill",
      name: "Auto-Refill",
      description:
        "Trigger policy-evaluated automatic refill for an agent wallet when balance " +
        "falls below the configured minimum.",
      tags: ["auto-refill", "policy", "treasury"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "exposure-monitor",
      name: "Exposure Monitoring",
      description:
        "Monitor total treasury exposure across all agents — outstanding balances, " +
        "daily refill totals, and risk metrics.",
      tags: ["risk", "monitoring", "exposure", "compliance"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "treasury-status",
      name: "Treasury Status",
      description:
        "Get current treasury health — total agents, total funded, frozen count, " +
        "and system-wide halt status.",
      tags: ["status", "health", "dashboard"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
};

export default async function treasuryA2aRoutes(app: FastifyInstance): Promise<void> {
  app.get("/.well-known/agent.json", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json")
      .header("Cache-Control", "public, max-age=3600")
      .header("Access-Control-Allow-Origin", "*")
      .send(TREASURY_AGENT_CARD);
  });

  app.get("/.well-known/", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json")
      .header("Access-Control-Allow-Origin", "*")
      .send({
        service: "fth-x402-treasury",
        discovery: {
          "agent.json": "/.well-known/agent.json — A2A Agent Card",
        },
        a2a: {
          protocol: "https://google.github.io/A2A/",
          card: "/.well-known/agent.json",
        },
      });
  });
}
