/**
 * @unykorn/agent-roles — Agent Role Catalog
 *
 * Defines the 15 always-on role agents for the UnyKorn mesh.
 * Each role has tool permissions, data-scope access, spend limits,
 * escalation chains, and heartbeat configuration.
 */

import type { AgentRole, AgentTier } from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Role Definition Interface
// ═══════════════════════════════════════════════════════════

export interface RoleDefinition {
  /** Agent role identifier */
  role: AgentRole;
  /** Human-readable name */
  name: string;
  /** Tier classification */
  tier: AgentTier;
  /** Description of the role's responsibilities */
  description: string;
  /** MCP tools this role is allowed to invoke */
  allowedTools: string[];
  /** Data scopes this role may read */
  allowedDataScopes: string[];
  /** Maximum daily spend in UNY (bigint string) */
  defaultSpendLimitDaily: string;
  /** Maximum per-task spend in UNY (bigint string) */
  defaultSpendLimitPerTask: string;
  /** Approval threshold — tasks above this require human sign-off */
  defaultApprovalThreshold: string;
  /** Escalation chain — ordered list of roles to escalate to */
  escalationChain: AgentRole[];
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
  /** Whether this role should always be running */
  alwaysOn: boolean;
}

// ═══════════════════════════════════════════════════════════
// Role Catalog — 15 always-on agents
// ═══════════════════════════════════════════════════════════

export const ROLE_CATALOG: Record<string, RoleDefinition> = {
  // ─────────────────────────────────────────────────────────
  // 1. Treasury — Control Tier
  // ─────────────────────────────────────────────────────────
  treasury: {
    role: "treasury",
    name: "Treasury Agent",
    tier: "control",
    description:
      "Manages treasury operations including balance monitoring, budget allocation, refill approvals, and spend-limit enforcement across the agent mesh.",
    allowedTools: [
      "get_treasury_state",
      "get_agent_balance",
      "request_refill",
      "get_spend_history",
      "create_invoice",
      "get_invoice",
      "process_payment",
      "get_portfolio",
      "get_rwa_status",
    ],
    allowedDataScopes: [
      "treasury:read",
      "treasury:admin",
      "payments:read",
      "portfolio:read",
    ],
    defaultSpendLimitDaily: "10000000000000000000000",
    defaultSpendLimitPerTask: "1000000000000000000000",
    defaultApprovalThreshold: "5000000000000000000000",
    escalationChain: ["policy", "compliance"],
    heartbeatIntervalMs: 5_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 2. Compliance — Control Tier
  // ─────────────────────────────────────────────────────────
  compliance: {
    role: "compliance",
    name: "Compliance Agent",
    tier: "control",
    description:
      "Performs compliance reviews, KYC/AML checks, risk-flag evaluation, and regulatory status monitoring across all jurisdictions.",
    allowedTools: [
      "check_compliance",
      "get_risk_flags",
      "run_kyc_check",
      "get_regulatory_status",
      "get_customer",
      "search_customers",
      "get_document",
      "search_documents",
    ],
    allowedDataScopes: [
      "compliance:read",
      "compliance:admin",
      "customers:read",
      "legal:read",
    ],
    defaultSpendLimitDaily: "5000000000000000000000",
    defaultSpendLimitPerTask: "500000000000000000000",
    defaultApprovalThreshold: "2000000000000000000000",
    escalationChain: ["policy", "risk"],
    heartbeatIntervalMs: 5_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 3. Policy — Control Tier
  // ─────────────────────────────────────────────────────────
  policy: {
    role: "policy",
    name: "Policy Agent",
    tier: "control",
    description:
      "Evaluates policy rules, enforces governance constraints, manages approval workflows, and maintains the policy rule engine.",
    allowedTools: [
      "check_compliance",
      "get_risk_flags",
      "get_agent_identity",
      "verify_identity",
      "list_agents",
      "get_agent_card",
      "discover_agents",
    ],
    allowedDataScopes: [
      "compliance:read",
      "identity:read",
      "identity:admin",
      "registry:read",
    ],
    defaultSpendLimitDaily: "2000000000000000000000",
    defaultSpendLimitPerTask: "200000000000000000000",
    defaultApprovalThreshold: "1000000000000000000000",
    escalationChain: ["treasury", "compliance"],
    heartbeatIntervalMs: 5_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 4. Risk — Control Tier
  // ─────────────────────────────────────────────────────────
  risk: {
    role: "risk",
    name: "Risk Agent",
    tier: "control",
    description:
      "Conducts real-time risk surveillance, anomaly detection, counterparty risk analysis and alerts on threshold breaches.",
    allowedTools: [
      "get_risk_flags",
      "get_treasury_state",
      "get_market_data",
      "get_sentiment",
      "get_network_metrics",
      "get_node_status",
      "assess_asset",
      "get_portfolio",
    ],
    allowedDataScopes: [
      "compliance:read",
      "treasury:read",
      "market:read",
      "chainops:read",
      "portfolio:read",
    ],
    defaultSpendLimitDaily: "3000000000000000000000",
    defaultSpendLimitPerTask: "300000000000000000000",
    defaultApprovalThreshold: "1500000000000000000000",
    escalationChain: ["policy", "compliance", "treasury"],
    heartbeatIntervalMs: 3_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 5. Exchange Listing — Execution Tier
  // ─────────────────────────────────────────────────────────
  "exchange-listing": {
    role: "exchange-listing",
    name: "Exchange Listing Agent",
    tier: "execution",
    description:
      "Manages the exchange listing pipeline: generates listing packets, tracks readiness scores, and monitors application status across target exchanges.",
    allowedTools: [
      "generate_packet",
      "get_readiness_score",
      "list_exchanges",
      "get_packet_status",
      "get_document",
      "search_documents",
      "get_market_data",
    ],
    allowedDataScopes: [
      "exchange:read",
      "legal:read",
      "market:read",
    ],
    defaultSpendLimitDaily: "2000000000000000000000",
    defaultSpendLimitPerTask: "500000000000000000000",
    defaultApprovalThreshold: "1000000000000000000000",
    escalationChain: ["compliance", "policy"],
    heartbeatIntervalMs: 15_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 6. Listing Packet — Execution Tier
  // ─────────────────────────────────────────────────────────
  "listing-packet": {
    role: "listing-packet",
    name: "Listing Packet Agent",
    tier: "execution",
    description:
      "Drafts and assembles exchange listing application documents, gathers required data from tokenomics, compliance, and legal sources.",
    allowedTools: [
      "generate_packet",
      "get_readiness_score",
      "get_packet_status",
      "get_document",
      "search_documents",
      "generate_disclosure",
      "get_supply_info",
      "get_allocation",
    ],
    allowedDataScopes: [
      "exchange:read",
      "legal:read",
      "legal:admin",
      "tokenomics:read",
    ],
    defaultSpendLimitDaily: "1500000000000000000000",
    defaultSpendLimitPerTask: "300000000000000000000",
    defaultApprovalThreshold: "700000000000000000000",
    escalationChain: ["exchange-listing", "compliance"],
    heartbeatIntervalMs: 15_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 7. Onboarding — Execution Tier
  // ─────────────────────────────────────────────────────────
  onboarding: {
    role: "onboarding",
    name: "Onboarding Agent",
    tier: "execution",
    description:
      "Manages partner and customer onboarding workflows: identity verification, KYC initiation, account provisioning, and welcome sequences.",
    allowedTools: [
      "get_customer",
      "search_customers",
      "update_customer",
      "run_kyc_check",
      "check_compliance",
      "register_agent",
      "get_agent_card",
    ],
    allowedDataScopes: [
      "customers:read",
      "compliance:read",
      "registry:read",
    ],
    defaultSpendLimitDaily: "1000000000000000000000",
    defaultSpendLimitPerTask: "200000000000000000000",
    defaultApprovalThreshold: "500000000000000000000",
    escalationChain: ["compliance", "customer-desk"],
    heartbeatIntervalMs: 10_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 8. Wallet Ops — Execution Tier
  // ─────────────────────────────────────────────────────────
  "wallet-ops": {
    role: "wallet-ops",
    name: "Wallet Operations Agent",
    tier: "execution",
    description:
      "Handles wallet operations including transaction submission, fee estimation, nonce management, and multi-sig coordination.",
    allowedTools: [
      "get_agent_balance",
      "get_treasury_state",
      "get_transaction",
      "get_block",
      "get_chain_status",
      "process_payment",
      "get_invoice",
    ],
    allowedDataScopes: [
      "treasury:read",
      "explorer:read",
      "payments:read",
    ],
    defaultSpendLimitDaily: "5000000000000000000000",
    defaultSpendLimitPerTask: "1000000000000000000000",
    defaultApprovalThreshold: "2000000000000000000000",
    escalationChain: ["treasury", "risk"],
    heartbeatIntervalMs: 5_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 9. Reconciliation — Execution Tier
  // ─────────────────────────────────────────────────────────
  reconciliation: {
    role: "reconciliation",
    name: "Reconciliation Agent",
    tier: "execution",
    description:
      "Performs continuous balance reconciliation between on-chain state, the treasury ledger, and payment records to detect discrepancies.",
    allowedTools: [
      "get_treasury_state",
      "get_agent_balance",
      "get_spend_history",
      "get_transaction",
      "get_block",
      "get_chain_status",
      "get_invoice",
    ],
    allowedDataScopes: [
      "treasury:read",
      "explorer:read",
      "payments:read",
    ],
    defaultSpendLimitDaily: "500000000000000000000",
    defaultSpendLimitPerTask: "100000000000000000000",
    defaultApprovalThreshold: "250000000000000000000",
    escalationChain: ["treasury", "risk", "compliance"],
    heartbeatIntervalMs: 10_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 10. Market Monitor — Intelligence Tier
  // ─────────────────────────────────────────────────────────
  "market-monitor": {
    role: "market-monitor",
    name: "Market Monitor Agent",
    tier: "intelligence",
    description:
      "Continuously monitors market data, price movements, volume anomalies, and liquidity conditions. Emits alerts on significant events.",
    allowedTools: [
      "get_market_data",
      "get_sentiment",
      "get_competitor_analysis",
      "get_supply_info",
      "get_chain_status",
    ],
    allowedDataScopes: [
      "market:read",
      "tokenomics:read",
      "explorer:read",
    ],
    defaultSpendLimitDaily: "500000000000000000000",
    defaultSpendLimitPerTask: "50000000000000000000",
    defaultApprovalThreshold: "200000000000000000000",
    escalationChain: ["risk", "intelligence"],
    heartbeatIntervalMs: 3_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 11. Intelligence — Intelligence Tier
  // ─────────────────────────────────────────────────────────
  intelligence: {
    role: "intelligence",
    name: "Intelligence Agent",
    tier: "intelligence",
    description:
      "Aggregates news, on-chain signals, social sentiment, and competitor intelligence into actionable insights for the mesh.",
    allowedTools: [
      "get_market_data",
      "get_sentiment",
      "get_competitor_analysis",
      "get_chain_status",
      "get_network_metrics",
      "get_supply_info",
      "get_allocation",
    ],
    allowedDataScopes: [
      "market:read",
      "chainops:read",
      "tokenomics:read",
    ],
    defaultSpendLimitDaily: "800000000000000000000",
    defaultSpendLimitPerTask: "100000000000000000000",
    defaultApprovalThreshold: "400000000000000000000",
    escalationChain: ["risk", "market-monitor"],
    heartbeatIntervalMs: 5_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 12. Incident Response — Execution Tier
  // ─────────────────────────────────────────────────────────
  "incident-response": {
    role: "incident-response",
    name: "Incident Response Agent",
    tier: "execution",
    description:
      "Handles incidents: detection, triage, notification, escalation, and post-incident reporting. Coordinates cross-role responses to outages or security events.",
    allowedTools: [
      "create_ticket",
      "get_ticket",
      "escalate_ticket",
      "get_node_status",
      "get_network_metrics",
      "get_risk_flags",
      "get_agent_identity",
      "list_agents",
    ],
    allowedDataScopes: [
      "support:read",
      "chainops:read",
      "compliance:read",
      "identity:read",
    ],
    defaultSpendLimitDaily: "1000000000000000000000",
    defaultSpendLimitPerTask: "200000000000000000000",
    defaultApprovalThreshold: "500000000000000000000",
    escalationChain: ["risk", "policy", "treasury"],
    heartbeatIntervalMs: 3_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 13. Customer Desk — Interface Tier
  // ─────────────────────────────────────────────────────────
  "customer-desk": {
    role: "customer-desk",
    name: "Customer Desk Agent",
    tier: "interface",
    description:
      "Front-line customer support: answers queries, manages tickets, looks up customer records, and escalates complex issues to specialized agents.",
    allowedTools: [
      "create_ticket",
      "get_ticket",
      "escalate_ticket",
      "get_customer",
      "search_customers",
      "update_customer",
      "get_invoice",
    ],
    allowedDataScopes: [
      "support:read",
      "customers:read",
      "payments:read",
    ],
    defaultSpendLimitDaily: "200000000000000000000",
    defaultSpendLimitPerTask: "50000000000000000000",
    defaultApprovalThreshold: "100000000000000000000",
    escalationChain: ["compliance", "incident-response"],
    heartbeatIntervalMs: 5_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 14. Documentation — Execution Tier
  // ─────────────────────────────────────────────────────────
  documentation: {
    role: "documentation",
    name: "Documentation Agent",
    tier: "execution",
    description:
      "Maintains technical and legal documentation: generates, updates, and indexes documents, disclosure templates, and knowledge-base articles.",
    allowedTools: [
      "get_document",
      "search_documents",
      "generate_disclosure",
      "get_supply_info",
      "get_allocation",
      "get_vesting_status",
    ],
    allowedDataScopes: [
      "legal:read",
      "legal:admin",
      "tokenomics:read",
    ],
    defaultSpendLimitDaily: "500000000000000000000",
    defaultSpendLimitPerTask: "100000000000000000000",
    defaultApprovalThreshold: "250000000000000000000",
    escalationChain: ["compliance", "listing-packet"],
    heartbeatIntervalMs: 30_000,
    alwaysOn: true,
  },

  // ─────────────────────────────────────────────────────────
  // 15. Settlement — Execution Tier
  // ─────────────────────────────────────────────────────────
  settlement: {
    role: "settlement",
    name: "Settlement Agent",
    tier: "execution",
    description:
      "Executes settlement workflows: finalizes payment transfers, confirms on-chain settlement, and reconciles settlement records with the treasury.",
    allowedTools: [
      "process_payment",
      "get_invoice",
      "create_invoice",
      "get_transaction",
      "get_block",
      "get_chain_status",
      "get_treasury_state",
      "get_agent_balance",
    ],
    allowedDataScopes: [
      "payments:read",
      "explorer:read",
      "treasury:read",
    ],
    defaultSpendLimitDaily: "8000000000000000000000",
    defaultSpendLimitPerTask: "2000000000000000000000",
    defaultApprovalThreshold: "4000000000000000000000",
    escalationChain: ["treasury", "risk", "compliance"],
    heartbeatIntervalMs: 5_000,
    alwaysOn: true,
  },
};

// ═══════════════════════════════════════════════════════════
// Accessor Functions
// ═══════════════════════════════════════════════════════════

/**
 * Get the role definition for a specific agent role.
 */
export function getRoleDefinition(role: AgentRole): RoleDefinition | undefined {
  return ROLE_CATALOG[role];
}

/**
 * Get all roles belonging to a specific tier.
 */
export function getRolesByTier(tier: AgentTier): RoleDefinition[] {
  return Object.values(ROLE_CATALOG).filter((r) => r.tier === tier);
}

/**
 * Get all roles that are flagged as always-on.
 */
export function getAlwaysOnRoles(): RoleDefinition[] {
  return Object.values(ROLE_CATALOG).filter((r) => r.alwaysOn);
}
