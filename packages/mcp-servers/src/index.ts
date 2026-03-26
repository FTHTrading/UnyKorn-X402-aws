/**
 * @unykorn/mcp-servers — MCP Server Definitions
 *
 * Defines all MCP servers that expose internal UnyKorn systems
 * as tools, resources, and prompts for the agent mesh.
 */

import type {
  McpServerDefinition,
  McpTool,
  McpResource,
  McpPrompt,
  McpServerName,
} from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Helper — build consistent timestamps
// ═══════════════════════════════════════════════════════════

const NOW = new Date().toISOString();

// ═══════════════════════════════════════════════════════════
// Registry of all MCP server definitions
// ═══════════════════════════════════════════════════════════

export const MCP_SERVER_CATALOG: Record<McpServerName, McpServerDefinition> = {
  // ─────────────────────────────────────────────────────────
  // 1. Treasury MCP
  // ─────────────────────────────────────────────────────────
  treasury: {
    serverId: "mcp:treasury",
    name: "Treasury MCP",
    description:
      "Access treasury state, balances, spend history, and refill controls",
    endpoint: "http://localhost:4001/mcp/treasury",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "get_treasury_state",
        description:
          "Get current treasury balances and reconciliation status",
        inputSchema: {},
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_agent_balance",
        description: "Get balance for a specific agent",
        inputSchema: {
          type: "object",
          properties: { agentId: { type: "string" } },
          required: ["agentId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "request_refill",
        description: "Request budget refill for an agent",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            amount: { type: "string" },
          },
          required: ["agentId", "amount"],
        },
        readOnly: false,
        requiredApproval: "policy",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_spend_history",
        description: "Get spend history for an agent or org",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            limit: { type: "number" },
          },
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "treasury://state/current",
        name: "Current Treasury State",
        description: "Real-time treasury balances",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "treasury:read",
      },
      {
        uri: "treasury://policy/spend-limits",
        name: "Spend Limits Policy",
        description: "Current spend limit configuration",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "treasury:admin",
      },
    ],
    prompts: [
      {
        name: "treasury_report",
        description: "Generate a treasury status report",
        parameters: [
          {
            name: "period",
            description: "Reporting period",
            required: false,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: ["treasury", "treasury-control", "compliance", "risk"],
    writeScope: "limited",
    healthEndpoint: "http://localhost:4001/mcp/treasury/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 2. Tokenomics MCP
  // ─────────────────────────────────────────────────────────
  tokenomics: {
    serverId: "mcp:tokenomics",
    name: "Tokenomics MCP",
    description:
      "Token supply, allocation schedules, and vesting status queries",
    endpoint: "http://localhost:4002/mcp/tokenomics",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "get_supply_info",
        description:
          "Get current and max supply, circulating, and locked amounts",
        inputSchema: {},
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_allocation",
        description: "Get token allocation breakdown by category",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "Allocation category: team, treasury, community, investors, ecosystem",
            },
          },
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_vesting_status",
        description:
          "Get vesting schedule and unlock status for a beneficiary",
        inputSchema: {
          type: "object",
          properties: {
            beneficiary: { type: "string" },
            scheduleId: { type: "string" },
          },
          required: ["beneficiary"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "tokenomics://supply/current",
        name: "Current Supply Metrics",
        description: "Real-time token supply data",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "tokenomics:read",
      },
      {
        uri: "tokenomics://vesting/schedules",
        name: "Vesting Schedules",
        description: "All active vesting schedules",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "tokenomics:admin",
      },
    ],
    prompts: [
      {
        name: "tokenomics_summary",
        description: "Generate a tokenomics overview report",
        parameters: [
          {
            name: "includeVesting",
            description: "Include vesting details",
            required: false,
            type: "boolean",
          },
        ],
      },
    ],
    allowedRoles: ["treasury", "compliance", "risk", "market-monitor"],
    writeScope: "none",
    healthEndpoint: "http://localhost:4002/mcp/tokenomics/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 3. Compliance MCP
  // ─────────────────────────────────────────────────────────
  compliance: {
    serverId: "mcp:compliance",
    name: "Compliance MCP",
    description:
      "Compliance checks, KYC verification, risk flags, and regulatory status",
    endpoint: "http://localhost:4003/mcp/compliance",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "check_compliance",
        description:
          "Run a compliance check against a transaction or entity",
        inputSchema: {
          type: "object",
          properties: {
            entityId: { type: "string" },
            checkType: {
              type: "string",
              description: "Type: aml, sanctions, pep, full",
            },
          },
          required: ["entityId", "checkType"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: "50000000000000000",
        auditRequired: true,
      },
      {
        name: "get_risk_flags",
        description:
          "Retrieve active risk flags for an entity or transaction",
        inputSchema: {
          type: "object",
          properties: {
            entityId: { type: "string" },
            severity: { type: "string", description: "low, medium, high, critical" },
          },
          required: ["entityId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "run_kyc_check",
        description: "Initiate a KYC verification for a customer",
        inputSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            tier: { type: "string", description: "basic, enhanced, institutional" },
            documentIds: {
              type: "array",
              items: { type: "string" },
              description: "Supporting document references",
            },
          },
          required: ["customerId", "tier"],
        },
        readOnly: false,
        requiredApproval: "human",
        costPerInvocation: "200000000000000000",
        auditRequired: true,
      },
      {
        name: "get_regulatory_status",
        description:
          "Get current regulatory status by jurisdiction",
        inputSchema: {
          type: "object",
          properties: {
            jurisdiction: { type: "string" },
          },
          required: ["jurisdiction"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "compliance://flags/active",
        name: "Active Risk Flags",
        description: "All currently active risk flags",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "compliance:read",
      },
      {
        uri: "compliance://kyc/queue",
        name: "KYC Verification Queue",
        description: "Pending KYC verifications awaiting review",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "compliance:admin",
      },
    ],
    prompts: [
      {
        name: "compliance_report",
        description: "Generate a compliance summary report",
        parameters: [
          {
            name: "jurisdiction",
            description: "Filter by jurisdiction",
            required: false,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: ["compliance", "risk", "policy", "treasury-control"],
    writeScope: "limited",
    healthEndpoint: "http://localhost:4003/mcp/compliance/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 4. Legal Docs MCP
  // ─────────────────────────────────────────────────────────
  "legal-docs": {
    serverId: "mcp:legal-docs",
    name: "Legal Docs MCP",
    description:
      "Legal document retrieval, search, and disclosure generation",
    endpoint: "http://localhost:4004/mcp/legal-docs",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "get_document",
        description:
          "Retrieve a specific legal document by ID or reference",
        inputSchema: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            version: { type: "string" },
          },
          required: ["documentId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "search_documents",
        description: "Full-text search across legal document corpus",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            category: {
              type: "string",
              description: "terms, privacy, compliance, offering, partnership",
            },
            limit: { type: "number" },
          },
          required: ["query"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "generate_disclosure",
        description:
          "Generate a disclosure document from template and parameters",
        inputSchema: {
          type: "object",
          properties: {
            templateId: { type: "string" },
            jurisdiction: { type: "string" },
            entityName: { type: "string" },
            parameters: { type: "object" },
          },
          required: ["templateId", "jurisdiction"],
        },
        readOnly: false,
        requiredApproval: "human",
        costPerInvocation: "100000000000000000",
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "legal://templates/index",
        name: "Document Templates Index",
        description: "List of all available legal templates",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "legal:read",
      },
      {
        uri: "legal://disclosures/recent",
        name: "Recent Disclosures",
        description: "Recently generated disclosure documents",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "legal:admin",
      },
    ],
    prompts: [
      {
        name: "legal_review",
        description: "Generate a legal review summary for a document",
        parameters: [
          {
            name: "documentId",
            description: "Document to review",
            required: true,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: ["compliance", "document-drafting", "listing-packet", "policy"],
    writeScope: "limited",
    healthEndpoint: "http://localhost:4004/mcp/legal-docs/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 5. Exchange Packets MCP
  // ─────────────────────────────────────────────────────────
  "exchange-packets": {
    serverId: "mcp:exchange-packets",
    name: "Exchange Packets MCP",
    description:
      "Generate, manage, and track exchange listing application packets",
    endpoint: "http://localhost:4005/mcp/exchange-packets",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "generate_packet",
        description:
          "Generate a full exchange listing packet for a target exchange",
        inputSchema: {
          type: "object",
          properties: {
            exchangeId: { type: "string" },
            tokenSymbol: { type: "string" },
            includeFinancials: { type: "boolean" },
            includeCompliance: { type: "boolean" },
          },
          required: ["exchangeId", "tokenSymbol"],
        },
        readOnly: false,
        requiredApproval: "policy",
        costPerInvocation: "500000000000000000",
        auditRequired: true,
      },
      {
        name: "get_readiness_score",
        description:
          "Calculate exchange-readiness score for a target exchange",
        inputSchema: {
          type: "object",
          properties: {
            exchangeId: { type: "string" },
          },
          required: ["exchangeId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "list_exchanges",
        description: "List supported exchanges and their requirements",
        inputSchema: {
          type: "object",
          properties: {
            tier: { type: "string", description: "tier-1, tier-2, tier-3" },
            region: { type: "string" },
          },
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
      {
        name: "get_packet_status",
        description:
          "Get the status of a previously generated listing packet",
        inputSchema: {
          type: "object",
          properties: {
            packetId: { type: "string" },
          },
          required: ["packetId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "exchange://packets/active",
        name: "Active Listing Packets",
        description: "All in-progress exchange listing applications",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "exchange:read",
      },
      {
        uri: "exchange://exchanges/registry",
        name: "Exchange Registry",
        description: "Registry of supported exchanges with metadata",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "exchange:read",
      },
    ],
    prompts: [
      {
        name: "exchange_readiness_brief",
        description: "Summarize exchange readiness for a target exchange",
        parameters: [
          {
            name: "exchangeId",
            description: "Target exchange identifier",
            required: true,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: [
      "exchange-listing",
      "listing-packet",
      "compliance",
      "document-drafting",
    ],
    writeScope: "limited",
    healthEndpoint: "http://localhost:4005/mcp/exchange-packets/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 6. Explorer MCP
  // ─────────────────────────────────────────────────────────
  explorer: {
    serverId: "mcp:explorer",
    name: "Explorer MCP",
    description:
      "Blockchain explorer — blocks, transactions, and chain status",
    endpoint: "http://localhost:4006/mcp/explorer",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "get_block",
        description: "Retrieve block data by number or hash",
        inputSchema: {
          type: "object",
          properties: {
            blockNumber: { type: "number" },
            blockHash: { type: "string" },
          },
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
      {
        name: "get_transaction",
        description: "Get transaction details by hash",
        inputSchema: {
          type: "object",
          properties: {
            txHash: { type: "string" },
          },
          required: ["txHash"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
      {
        name: "get_chain_status",
        description:
          "Get current chain status: head block, finalized block, TPS, etc.",
        inputSchema: {},
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
    ],
    resources: [
      {
        uri: "explorer://chain/status",
        name: "Chain Status",
        description: "Real-time chain health and throughput metrics",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "explorer:read",
      },
      {
        uri: "explorer://blocks/latest",
        name: "Latest Blocks",
        description: "Most recent blocks on chain",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "explorer:read",
      },
    ],
    prompts: [
      {
        name: "chain_overview",
        description: "Generate a chain status overview report",
        parameters: [
          {
            name: "timeRange",
            description: "Time range for metrics (e.g., 1h, 24h, 7d)",
            required: false,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: [
      "chain-ops",
      "market-monitor",
      "reconciliation",
      "settlement",
    ],
    writeScope: "none",
    healthEndpoint: "http://localhost:4006/mcp/explorer/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 7. Support Desk MCP
  // ─────────────────────────────────────────────────────────
  "support-desk": {
    serverId: "mcp:support-desk",
    name: "Support Desk MCP",
    description:
      "Customer support ticket management — create, query, and escalate tickets",
    endpoint: "http://localhost:4007/mcp/support-desk",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "create_ticket",
        description: "Create a new support ticket",
        inputSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            subject: { type: "string" },
            description: { type: "string" },
            priority: {
              type: "string",
              description: "low, medium, high, critical",
            },
            category: { type: "string" },
          },
          required: ["customerId", "subject", "description"],
        },
        readOnly: false,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_ticket",
        description: "Retrieve a support ticket by ID",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: { type: "string" },
          },
          required: ["ticketId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
      {
        name: "escalate_ticket",
        description:
          "Escalate a ticket to a higher-priority queue or human agent",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            reason: { type: "string" },
            targetTeam: { type: "string" },
          },
          required: ["ticketId", "reason"],
        },
        readOnly: false,
        requiredApproval: "agent",
        costPerInvocation: null,
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "support://tickets/open",
        name: "Open Tickets",
        description: "All currently open support tickets",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "support:read",
      },
      {
        uri: "support://metrics/sla",
        name: "SLA Metrics",
        description: "Current SLA compliance metrics",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "support:read",
      },
    ],
    prompts: [
      {
        name: "support_summary",
        description: "Generate a support desk status summary",
        parameters: [
          {
            name: "period",
            description: "Reporting period (e.g., today, 7d, 30d)",
            required: false,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: ["customer-desk", "concierge", "incident-response"],
    writeScope: "limited",
    healthEndpoint: "http://localhost:4007/mcp/support-desk/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 8. Market Intelligence MCP
  // ─────────────────────────────────────────────────────────
  "market-intelligence": {
    serverId: "mcp:market-intelligence",
    name: "Market Intelligence MCP",
    description:
      "Market data feeds, sentiment analysis, and competitor intelligence",
    endpoint: "http://localhost:4008/mcp/market-intelligence",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "get_market_data",
        description:
          "Get current market data: price, volume, market cap, 24h change",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            currency: { type: "string", description: "Quote currency (default: USD)" },
          },
          required: ["symbol"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
      {
        name: "get_sentiment",
        description:
          "Get aggregated sentiment score from social and news sources",
        inputSchema: {
          type: "object",
          properties: {
            topic: { type: "string" },
            timeRange: { type: "string", description: "1h, 4h, 24h, 7d" },
          },
          required: ["topic"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: "10000000000000000",
        auditRequired: false,
      },
      {
        name: "get_competitor_analysis",
        description:
          "Generate competitive analysis for a specific token or protocol",
        inputSchema: {
          type: "object",
          properties: {
            targetSymbol: { type: "string" },
            competitors: {
              type: "array",
              items: { type: "string" },
              description: "List of competitor symbols to compare",
            },
          },
          required: ["targetSymbol"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: "50000000000000000",
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "market://prices/live",
        name: "Live Prices",
        description: "Real-time token price feeds",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "market:read",
      },
      {
        uri: "market://sentiment/aggregate",
        name: "Aggregate Sentiment",
        description: "Aggregated sentiment scores across sources",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "market:read",
      },
    ],
    prompts: [
      {
        name: "market_brief",
        description: "Generate a market intelligence brief",
        parameters: [
          {
            name: "focus",
            description: "Focus area: macro, competitors, sentiment, volume",
            required: false,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: [
      "market-monitor",
      "intelligence",
      "news-signals",
      "risk",
      "exchange-listing",
    ],
    writeScope: "none",
    healthEndpoint: "http://localhost:4008/mcp/market-intelligence/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 9. Portfolio RWA MCP
  // ─────────────────────────────────────────────────────────
  "portfolio-rwa": {
    serverId: "mcp:portfolio-rwa",
    name: "Portfolio RWA MCP",
    description:
      "Real-world asset portfolio management, valuation, and status tracking",
    endpoint: "http://localhost:4009/mcp/portfolio-rwa",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "get_portfolio",
        description:
          "Get full portfolio breakdown with current valuations",
        inputSchema: {
          type: "object",
          properties: {
            orgId: { type: "string" },
            assetClass: {
              type: "string",
              description: "Filter: real-estate, commodities, bonds, equity",
            },
          },
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_rwa_status",
        description:
          "Get tokenization and custody status for a specific RWA",
        inputSchema: {
          type: "object",
          properties: {
            assetId: { type: "string" },
          },
          required: ["assetId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "assess_asset",
        description:
          "Run risk and valuation assessment on a prospective RWA",
        inputSchema: {
          type: "object",
          properties: {
            assetType: { type: "string" },
            estimatedValue: { type: "string" },
            jurisdiction: { type: "string" },
            custodian: { type: "string" },
          },
          required: ["assetType", "estimatedValue"],
        },
        readOnly: true,
        requiredApproval: "policy",
        costPerInvocation: "100000000000000000",
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "portfolio://assets/overview",
        name: "Portfolio Overview",
        description: "Summary of all RWA holdings and valuations",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "portfolio:read",
      },
      {
        uri: "portfolio://rwa/pending",
        name: "Pending RWA Tokenizations",
        description: "Assets pending tokenization or custody settlement",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "portfolio:admin",
      },
    ],
    prompts: [
      {
        name: "portfolio_report",
        description: "Generate a portfolio performance and risk report",
        parameters: [
          {
            name: "assetClass",
            description: "Filter by asset class",
            required: false,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: ["treasury", "risk", "rwa-structuring", "compliance"],
    writeScope: "limited",
    healthEndpoint: "http://localhost:4009/mcp/portfolio-rwa/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 10. Payments MCP
  // ─────────────────────────────────────────────────────────
  payments: {
    serverId: "mcp:payments",
    name: "Payments MCP",
    description:
      "Invoice generation, retrieval, and payment processing (x402 and fiat rails)",
    endpoint: "http://localhost:4010/mcp/payments",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "create_invoice",
        description: "Create a new invoice for services or goods",
        inputSchema: {
          type: "object",
          properties: {
            payerId: { type: "string" },
            payeeId: { type: "string" },
            amount: { type: "string", description: "Amount in UNY (bigint string)" },
            currency: { type: "string" },
            description: { type: "string" },
            dueDate: { type: "string", description: "ISO 8601 date" },
          },
          required: ["payerId", "payeeId", "amount"],
        },
        readOnly: false,
        requiredApproval: "policy",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_invoice",
        description: "Retrieve an invoice by ID",
        inputSchema: {
          type: "object",
          properties: {
            invoiceId: { type: "string" },
          },
          required: ["invoiceId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
      {
        name: "process_payment",
        description:
          "Process a payment against an existing invoice via x402 or fiat rail",
        inputSchema: {
          type: "object",
          properties: {
            invoiceId: { type: "string" },
            paymentMethod: {
              type: "string",
              description: "x402, wire, ach, card",
            },
            payerWallet: { type: "string" },
          },
          required: ["invoiceId", "paymentMethod"],
        },
        readOnly: false,
        requiredApproval: "human",
        costPerInvocation: null,
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "payments://invoices/pending",
        name: "Pending Invoices",
        description: "All invoices awaiting payment",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "payments:read",
      },
      {
        uri: "payments://history/recent",
        name: "Recent Payment History",
        description: "Recently processed payments",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "payments:read",
      },
    ],
    prompts: [
      {
        name: "payment_summary",
        description: "Generate a payment activity summary",
        parameters: [
          {
            name: "period",
            description: "Reporting period",
            required: false,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: ["treasury", "settlement", "reconciliation", "wallet-ops"],
    writeScope: "full",
    healthEndpoint: "http://localhost:4010/mcp/payments/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 11. Customer Records MCP
  // ─────────────────────────────────────────────────────────
  "customer-records": {
    serverId: "mcp:customer-records",
    name: "Customer Records MCP",
    description:
      "Customer data management — profiles, search, and record updates",
    endpoint: "http://localhost:4011/mcp/customer-records",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "get_customer",
        description: "Retrieve customer profile by ID",
        inputSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            includeKyc: { type: "boolean" },
          },
          required: ["customerId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "search_customers",
        description: "Search customer records by name, email, or wallet",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            field: {
              type: "string",
              description: "name, email, wallet, phone",
            },
            limit: { type: "number" },
          },
          required: ["query"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "update_customer",
        description: "Update customer record fields",
        inputSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            updates: {
              type: "object",
              description: "Key-value pairs of fields to update",
            },
            reason: { type: "string" },
          },
          required: ["customerId", "updates", "reason"],
        },
        readOnly: false,
        requiredApproval: "agent",
        costPerInvocation: null,
        auditRequired: true,
      },
    ],
    resources: [
      {
        uri: "customers://segments/active",
        name: "Active Customer Segments",
        description: "Customer segmentation data",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "customers:read",
      },
      {
        uri: "customers://metrics/overview",
        name: "Customer Metrics",
        description: "High-level customer growth and churn metrics",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "customers:read",
      },
    ],
    prompts: [
      {
        name: "customer_profile_summary",
        description: "Generate a customer profile summary for support context",
        parameters: [
          {
            name: "customerId",
            description: "Customer identifier",
            required: true,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: ["customer-desk", "concierge", "compliance", "onboarding"],
    writeScope: "limited",
    healthEndpoint: "http://localhost:4011/mcp/customer-records/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 12. Chain Ops MCP
  // ─────────────────────────────────────────────────────────
  "chain-ops": {
    serverId: "mcp:chain-ops",
    name: "Chain Ops MCP",
    description:
      "Node status, validator info, and network-level operational metrics",
    endpoint: "http://localhost:4012/mcp/chain-ops",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "get_node_status",
        description:
          "Get status of a specific node: version, sync state, peers",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: { type: "string" },
          },
          required: ["nodeId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_validator_info",
        description:
          "Get validator details: stake, uptime, slashing history",
        inputSchema: {
          type: "object",
          properties: {
            validatorAddress: { type: "string" },
          },
          required: ["validatorAddress"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_network_metrics",
        description:
          "Get network-level metrics: total stake, active validators, epoch info",
        inputSchema: {},
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
    ],
    resources: [
      {
        uri: "chainops://nodes/health",
        name: "Node Health Dashboard",
        description: "Real-time health status of all managed nodes",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "chainops:read",
      },
      {
        uri: "chainops://validators/set",
        name: "Validator Set",
        description: "Current active validator set with stakes",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "chainops:read",
      },
    ],
    prompts: [
      {
        name: "network_health_report",
        description: "Generate a network health and performance report",
        parameters: [
          {
            name: "includeValidators",
            description: "Include validator-level detail",
            required: false,
            type: "boolean",
          },
        ],
      },
    ],
    allowedRoles: [
      "chain-ops",
      "validator-health",
      "incident-response",
      "risk",
    ],
    writeScope: "none",
    healthEndpoint: "http://localhost:4012/mcp/chain-ops/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 13. Identity MCP
  // ─────────────────────────────────────────────────────────
  identity: {
    serverId: "mcp:identity",
    name: "Identity MCP",
    description:
      "Agent identity management — lookup, verification, and agent listing",
    endpoint: "http://localhost:4013/mcp/identity",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "get_agent_identity",
        description:
          "Retrieve full agent identity including keys, roles, and trust score",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
          },
          required: ["agentId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "verify_identity",
        description:
          "Verify an agent's identity by validating its signature and credentials",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            signature: { type: "string" },
            challenge: { type: "string" },
          },
          required: ["agentId", "signature", "challenge"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "list_agents",
        description:
          "List all registered agents, optionally filtered by role or tier",
        inputSchema: {
          type: "object",
          properties: {
            role: { type: "string" },
            tier: { type: "string" },
            status: { type: "string", description: "active, paused, revoked" },
          },
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
    ],
    resources: [
      {
        uri: "identity://agents/directory",
        name: "Agent Directory",
        description: "Full directory of registered agents",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "identity:read",
      },
      {
        uri: "identity://trust/scores",
        name: "Trust Scores",
        description: "Current trust scores for all agents",
        mimeType: "application/json",
        sensitive: true,
        requiredScope: "identity:admin",
      },
    ],
    prompts: [
      {
        name: "agent_directory_report",
        description: "Generate a report of all active agents and their roles",
        parameters: [
          {
            name: "tier",
            description: "Filter by agent tier",
            required: false,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: ["policy", "compliance", "risk", "treasury-control"],
    writeScope: "none",
    healthEndpoint: "http://localhost:4013/mcp/identity/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─────────────────────────────────────────────────────────
  // 14. Agent Registry MCP
  // ─────────────────────────────────────────────────────────
  "agent-registry": {
    serverId: "mcp:agent-registry",
    name: "Agent Registry MCP",
    description:
      "Agent lifecycle management — registration, discovery, and agent card retrieval",
    endpoint: "http://localhost:4014/mcp/agent-registry",
    protocolVersion: "1.0",
    status: "stopped",
    tools: [
      {
        name: "register_agent",
        description:
          "Register a new agent in the mesh with role, keys, and capabilities",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            tier: { type: "string" },
            publicKey: { type: "string" },
            capabilities: {
              type: "array",
              items: { type: "string" },
              description: "List of capability URIs",
            },
            endpoint: { type: "string", description: "Agent A2A endpoint URL" },
          },
          required: ["name", "role", "tier", "publicKey"],
        },
        readOnly: false,
        requiredApproval: "human",
        costPerInvocation: null,
        auditRequired: true,
      },
      {
        name: "get_agent_card",
        description:
          "Retrieve the A2A agent card (capabilities, endpoint, metadata) for a given agent",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
          },
          required: ["agentId"],
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
      {
        name: "discover_agents",
        description:
          "Discover agents by capability, role, or tag for task delegation",
        inputSchema: {
          type: "object",
          properties: {
            capability: { type: "string" },
            role: { type: "string" },
            tag: { type: "string" },
            minTrustScore: { type: "number" },
          },
        },
        readOnly: true,
        requiredApproval: "none",
        costPerInvocation: null,
        auditRequired: false,
      },
    ],
    resources: [
      {
        uri: "registry://agents/catalog",
        name: "Agent Catalog",
        description: "Full catalog of registered agents and their capabilities",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "registry:read",
      },
      {
        uri: "registry://capabilities/index",
        name: "Capability Index",
        description: "Index of all declared capabilities across the mesh",
        mimeType: "application/json",
        sensitive: false,
        requiredScope: "registry:read",
      },
    ],
    prompts: [
      {
        name: "agent_discovery_report",
        description:
          "Generate a report of available agents for a given capability need",
        parameters: [
          {
            name: "capability",
            description: "Required capability to search for",
            required: true,
            type: "string",
          },
        ],
      },
    ],
    allowedRoles: [
      "policy",
      "compliance",
      "risk",
      "treasury-control",
      "onboarding",
    ],
    writeScope: "limited",
    healthEndpoint: "http://localhost:4014/mcp/agent-registry/health",
    lastHealthCheck: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
};

// ═══════════════════════════════════════════════════════════
// Accessor Functions
// ═══════════════════════════════════════════════════════════

/**
 * Get a specific MCP server definition by name.
 */
export function getMcpServer(name: McpServerName): McpServerDefinition {
  const server = MCP_SERVER_CATALOG[name];
  if (!server) {
    throw new Error(`Unknown MCP server: ${name}`);
  }
  return server;
}

/**
 * Get all MCP server definitions.
 */
export function getAllMcpServers(): McpServerDefinition[] {
  return Object.values(MCP_SERVER_CATALOG);
}

/**
 * Get all MCP servers that a given role is allowed to access.
 */
export function getMcpServersByRole(role: string): McpServerDefinition[] {
  return Object.values(MCP_SERVER_CATALOG).filter((server) =>
    server.allowedRoles.includes(role),
  );
}
