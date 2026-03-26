/**
 * @unykorn/db — Seed Data
 *
 * Seeds the database with the initial 15 agent roles,
 * organization, policy rules, and MCP server registrations.
 */

import type {
  AgentRole,
  AgentTier,
} from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Organization
// ═══════════════════════════════════════════════════════════

export const SEED_ORG = {
  id: "org:fth-trading",
  name: "FTH Trading",
  legalEntity: "FTH Trading LLC",
  jurisdiction: "US",
};

// ═══════════════════════════════════════════════════════════
// Agent Seeds — 15 Always-On Roles
// ═══════════════════════════════════════════════════════════

interface AgentSeed {
  name: string;
  role: AgentRole;
  tier: AgentTier;
  description: string;
  spendLimitDaily: string;
  spendLimitPerTask: string;
  approvalThreshold: string;
  allowedTools: string[];
  allowedDataScopes: string[];
}

export const SEED_AGENTS: AgentSeed[] = [
  // ── Tier 1: Control ───────────────────────────────
  {
    name: "Treasury Agent",
    role: "treasury",
    tier: "control",
    description: "Manages treasury operations, deposits, withdrawals, refills, and spend oversight",
    spendLimitDaily: "10000000000000000000000", // 10,000 UNY
    spendLimitPerTask: "1000000000000000000000",  // 1,000 UNY
    approvalThreshold: "500000000000000000000",    // 500 UNY
    allowedTools: ["get_treasury_state", "get_agent_balance", "request_refill", "get_spend_history"],
    allowedDataScopes: ["treasury:read", "treasury:write", "ledger:read"],
  },
  {
    name: "Compliance Agent",
    role: "compliance",
    tier: "control",
    description: "Reviews compliance status, runs KYC checks, monitors regulatory requirements",
    spendLimitDaily: "1000000000000000000000", // 1,000 UNY
    spendLimitPerTask: "100000000000000000000",  // 100 UNY
    approvalThreshold: "500000000000000000000",
    allowedTools: ["check_compliance", "get_risk_flags", "run_kyc_check", "get_regulatory_status"],
    allowedDataScopes: ["compliance:read", "compliance:write", "customer:read"],
  },
  {
    name: "Policy Agent",
    role: "policy",
    tier: "control",
    description: "Evaluates policy rules, manages approval workflows, enforces access controls",
    spendLimitDaily: "0",
    spendLimitPerTask: "0",
    approvalThreshold: "0",
    allowedTools: ["evaluate_policy", "get_rules", "override_decision"],
    allowedDataScopes: ["policy:read", "policy:write", "agent:read"],
  },
  {
    name: "Risk Agent",
    role: "risk",
    tier: "control",
    description: "Monitors risk flags, anomaly detection, counterparty risk assessment",
    spendLimitDaily: "500000000000000000000", // 500 UNY
    spendLimitPerTask: "50000000000000000000",  // 50 UNY
    approvalThreshold: "100000000000000000000",
    allowedTools: ["get_risk_flags", "get_market_data", "get_sentiment", "get_competitor_analysis"],
    allowedDataScopes: ["risk:read", "market:read", "treasury:read", "compliance:read"],
  },

  // ── Tier 2: Execution ─────────────────────────────
  {
    name: "Exchange Listing Agent",
    role: "exchange-listing",
    tier: "execution",
    description: "Generates exchange listing packets, manages application workflows",
    spendLimitDaily: "2000000000000000000000", // 2,000 UNY
    spendLimitPerTask: "500000000000000000000",
    approvalThreshold: "1000000000000000000000",
    allowedTools: ["generate_packet", "get_readiness_score", "list_exchanges", "get_packet_status"],
    allowedDataScopes: ["exchange:read", "exchange:write", "tokenomics:read", "compliance:read"],
  },
  {
    name: "Listing Packet Agent",
    role: "listing-packet",
    tier: "execution",
    description: "Drafts documents for exchange applications — technical specs, legal disclosures",
    spendLimitDaily: "1000000000000000000000",
    spendLimitPerTask: "200000000000000000000",
    approvalThreshold: "500000000000000000000",
    allowedTools: ["get_document", "search_documents", "generate_disclosure", "generate_packet"],
    allowedDataScopes: ["docs:read", "docs:write", "exchange:read"],
  },
  {
    name: "Onboarding Agent",
    role: "onboarding",
    tier: "execution",
    description: "Manages partner and customer onboarding workflows",
    spendLimitDaily: "500000000000000000000",
    spendLimitPerTask: "100000000000000000000",
    approvalThreshold: "200000000000000000000",
    allowedTools: ["get_customer", "search_customers", "update_customer", "create_ticket"],
    allowedDataScopes: ["customer:read", "customer:write", "support:write"],
  },
  {
    name: "Wallet Operations Agent",
    role: "wallet-ops",
    tier: "execution",
    description: "Manages wallet operations, key management, transaction signing",
    spendLimitDaily: "5000000000000000000000", // 5,000 UNY
    spendLimitPerTask: "2000000000000000000000",
    approvalThreshold: "1000000000000000000000",
    allowedTools: ["get_agent_balance", "get_node_status", "get_validator_info"],
    allowedDataScopes: ["wallet:read", "wallet:write", "chain:read"],
  },
  {
    name: "Reconciliation Agent",
    role: "reconciliation",
    tier: "execution",
    description: "Reconciles balances between Genesis and UNY Core, flags discrepancies",
    spendLimitDaily: "0",
    spendLimitPerTask: "0",
    approvalThreshold: "0",
    allowedTools: ["get_treasury_state", "get_agent_balance", "get_spend_history"],
    allowedDataScopes: ["treasury:read", "ledger:read"],
  },
  {
    name: "Incident Response Agent",
    role: "incident-response",
    tier: "execution",
    description: "Handles incidents, triggers escalation chains, sends notifications",
    spendLimitDaily: "1000000000000000000000",
    spendLimitPerTask: "500000000000000000000",
    approvalThreshold: "200000000000000000000",
    allowedTools: ["create_ticket", "get_ticket", "escalate_ticket", "get_node_status"],
    allowedDataScopes: ["support:read", "support:write", "chain:read", "agent:read"],
  },
  {
    name: "Documentation Agent",
    role: "documentation",
    tier: "execution",
    description: "Maintains protocol documentation, generates changelogs, updates specs",
    spendLimitDaily: "200000000000000000000", // 200 UNY
    spendLimitPerTask: "50000000000000000000",
    approvalThreshold: "100000000000000000000",
    allowedTools: ["get_document", "search_documents", "generate_disclosure"],
    allowedDataScopes: ["docs:read", "docs:write"],
  },
  {
    name: "Settlement Agent",
    role: "settlement",
    tier: "execution",
    description: "Executes settlements, generates receipts, manages escrow release",
    spendLimitDaily: "50000000000000000000000", // 50,000 UNY
    spendLimitPerTask: "10000000000000000000000",
    approvalThreshold: "5000000000000000000000",
    allowedTools: ["get_treasury_state", "get_agent_balance", "process_payment", "create_invoice"],
    allowedDataScopes: ["treasury:read", "ledger:read", "ledger:write", "receipt:write"],
  },

  // ── Tier 3: Intelligence ──────────────────────────
  {
    name: "Market Monitor Agent",
    role: "market-monitor",
    tier: "intelligence",
    description: "Monitors market data, tracks prices, identifies trends",
    spendLimitDaily: "100000000000000000000", // 100 UNY
    spendLimitPerTask: "10000000000000000000",
    approvalThreshold: "50000000000000000000",
    allowedTools: ["get_market_data", "get_sentiment", "get_competitor_analysis"],
    allowedDataScopes: ["market:read"],
  },
  {
    name: "Intelligence Agent",
    role: "intelligence",
    tier: "intelligence",
    description: "Aggregates signals from all sources, generates intelligence reports",
    spendLimitDaily: "500000000000000000000",
    spendLimitPerTask: "100000000000000000000",
    approvalThreshold: "200000000000000000000",
    allowedTools: ["get_market_data", "get_sentiment", "get_competitor_analysis", "search_documents"],
    allowedDataScopes: ["market:read", "docs:read", "compliance:read"],
  },

  // ── Tier 4: Interface ─────────────────────────────
  {
    name: "Customer Desk Agent",
    role: "customer-desk",
    tier: "interface",
    description: "Handles customer support requests, routes to specialists",
    spendLimitDaily: "500000000000000000000",
    spendLimitPerTask: "50000000000000000000",
    approvalThreshold: "100000000000000000000",
    allowedTools: ["create_ticket", "get_ticket", "escalate_ticket", "get_customer", "search_customers"],
    allowedDataScopes: ["support:read", "support:write", "customer:read"],
  },
];

// ═══════════════════════════════════════════════════════════
// Policy Rule Seeds
// ═══════════════════════════════════════════════════════════

export const SEED_POLICY_RULES = [
  {
    name: "Global Spend Cap",
    description: "No single task may exceed 50,000 UNY without human approval",
    effect: "require_approval" as const,
    scope: "global" as const,
    priority: 1,
    conditions: [],
    actions: ["task.settle", "budget.spend"],
    targetRoles: [],
    maxSpend: "50000000000000000000000", // 50,000 UNY
    restrictedJurisdictions: [],
    active: true,
  },
  {
    name: "Control Tier Authorization",
    description: "Control-tier agents can authorize up to their spend limit without approval",
    effect: "allow" as const,
    scope: "role" as const,
    priority: 10,
    conditions: [{ field: "tier", operator: "eq" as const, value: "control" }],
    actions: ["task.create", "task.execute", "budget.reserve"],
    targetRoles: ["treasury", "compliance", "policy", "risk"],
    maxSpend: "10000000000000000000000",
    restrictedJurisdictions: [],
    active: true,
  },
  {
    name: "Execution Tier Default",
    description: "Execution-tier agents can perform work within their budget limits",
    effect: "allow" as const,
    scope: "role" as const,
    priority: 20,
    conditions: [{ field: "tier", operator: "eq" as const, value: "execution" }],
    actions: ["task.create", "task.execute", "task.deliver"],
    targetRoles: [],
    maxSpend: "5000000000000000000000",
    restrictedJurisdictions: [],
    active: true,
  },
  {
    name: "Intelligence Read-Only",
    description: "Intelligence-tier agents have read-only access by default",
    effect: "allow" as const,
    scope: "role" as const,
    priority: 30,
    conditions: [{ field: "tier", operator: "eq" as const, value: "intelligence" }],
    actions: ["mcp.invoke"],
    targetRoles: ["market-monitor", "intelligence"],
    maxSpend: "100000000000000000000",
    restrictedJurisdictions: [],
    active: true,
  },
  {
    name: "Restricted Jurisdictions Block",
    description: "Block all operations from restricted jurisdictions",
    effect: "deny" as const,
    scope: "global" as const,
    priority: 0,
    conditions: [{ field: "jurisdiction", operator: "in" as const, value: ["KP", "IR", "SY", "CU"] }],
    actions: [],
    targetRoles: [],
    maxSpend: null,
    restrictedJurisdictions: ["KP", "IR", "SY", "CU"],
    active: true,
  },
  {
    name: "Kill Switch Override",
    description: "Agents with kill switch engaged are blocked from all actions",
    effect: "deny" as const,
    scope: "agent" as const,
    priority: 0,
    conditions: [{ field: "killSwitch", operator: "eq" as const, value: true }],
    actions: [],
    targetRoles: [],
    maxSpend: null,
    restrictedJurisdictions: [],
    active: true,
  },
];

// ═══════════════════════════════════════════════════════════
// Genesis Balance Seeds
// ═══════════════════════════════════════════════════════════

export const SEED_GENESIS_DEPOSITS = {
  /** Initial treasury deposit from UNY Core into Genesis system */
  treasuryDeposit: "100000000000000000000000000", // 100,000,000 UNY (from AI Compute allocation)
  /** Per-agent initial operating budget (from treasury) */
  agentInitialBudget: "1000000000000000000000",    // 1,000 UNY per agent
};
