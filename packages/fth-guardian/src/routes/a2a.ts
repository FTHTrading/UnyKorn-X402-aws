/**
 * FTH Guardian — A2A Discovery Routes
 *
 * Exposes the Guardian daemon army's capabilities for A2A agent discovery.
 */

import type { FastifyInstance } from "fastify";

const GUARDIAN_AGENT_CARD = {
  name: "FTH Guardian Daemon Army",
  description:
    "Autonomous infrastructure monitoring and operations system. " +
    "Runs 8 specialized daemons: Sentinel (health), Enforcer (security), " +
    "Healer (recovery), Reaper (revenue collection), Upgrader (deployments), " +
    "Treasurer (fund management), Anchor (L1 settlement), Watcher (external monitoring).",
  url: "https://guardian.l1.unykorn.org",
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
    pushNotifications: true,
    stateTransitionHistory: true,
  },
  authentication: {
    schemes: [
      {
        scheme: "bearer",
        description: "Service-to-service HMAC auth.",
      },
    ],
  },
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  skills: [
    {
      id: "sentinel-health",
      name: "Infrastructure Health Monitoring",
      description: "Monitors all nodes, services, and infrastructure health across the UnyKorn network.",
      tags: ["monitoring", "health", "infrastructure"],
    },
    {
      id: "enforcer-security",
      name: "Security Enforcement",
      description: "Rate limiting, anomaly detection, threat response, and IP blocking.",
      tags: ["security", "rate-limiting", "threat-detection"],
    },
    {
      id: "reaper-revenue",
      name: "Revenue Collection",
      description: "Collects transaction fees, harvests staking rewards, sweeps facilitator fees, compounds earnings.",
      tags: ["revenue", "fees", "staking", "monetization"],
    },
    {
      id: "treasurer-funds",
      name: "Treasury Fund Management",
      description: "Auto-funds agents, monitors balances, enforces spending limits, manages hot/cold wallet split.",
      tags: ["treasury", "funding", "policy"],
    },
    {
      id: "anchor-settlement",
      name: "L1 Receipt Anchoring",
      description: "Batches receipts and anchors Merkle roots to the UnyKorn L1 blockchain for finality.",
      tags: ["settlement", "anchoring", "blockchain", "finality"],
    },
    {
      id: "watcher-external",
      name: "External Monitoring",
      description: "Monitors DNS, SSL certificates, domain expiry, and third-party API health.",
      tags: ["dns", "ssl", "external", "monitoring"],
    },
  ],
};

export default async function guardianA2aRoutes(app: FastifyInstance): Promise<void> {
  app.get("/.well-known/agent.json", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json")
      .header("Cache-Control", "public, max-age=3600")
      .header("Access-Control-Allow-Origin", "*")
      .send(GUARDIAN_AGENT_CARD);
  });

  app.get("/.well-known/", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json")
      .header("Access-Control-Allow-Origin", "*")
      .send({
        service: "fth-guardian",
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
