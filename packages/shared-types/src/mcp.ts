/**
 * @unykorn/shared-types — MCP Server Models
 *
 * Model Context Protocol server definitions for exposing
 * internal systems as tool, document, and workflow providers.
 */

// ═══════════════════════════════════════════════════════════
// MCP Server Definition
// ═══════════════════════════════════════════════════════════

export type McpServerStatus = "running" | "stopped" | "degraded" | "starting" | "error";

export interface McpServerDefinition {
  /** Unique server ID */
  serverId: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Server endpoint URL */
  endpoint: string;
  /** Protocol version */
  protocolVersion: string;
  /** Current status */
  status: McpServerStatus;
  /** Tools exposed by this server */
  tools: McpTool[];
  /** Resources (documents, data) exposed */
  resources: McpResource[];
  /** Prompts (workflow templates) exposed */
  prompts: McpPrompt[];
  /** Access policy — which agent roles can access */
  allowedRoles: string[];
  /** Write scope — which tools can mutate state */
  writeScope: "none" | "limited" | "full";
  /** Health check endpoint */
  healthEndpoint: string;
  /** Last health check */
  lastHealthCheck: string | null;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════
// MCP Tool
// ═══════════════════════════════════════════════════════════

export interface McpTool {
  /** Tool name (unique within server) */
  name: string;
  /** Description */
  description: string;
  /** Input schema (JSON Schema format) */
  inputSchema: Record<string, unknown>;
  /** Output schema */
  outputSchema?: Record<string, unknown>;
  /** Is this a read-only tool? */
  readOnly: boolean;
  /** Required approval level to invoke */
  requiredApproval: "none" | "agent" | "human" | "policy";
  /** Cost per invocation in UNY (bigint string, null if free) */
  costPerInvocation: string | null;
  /** Rate limit per agent */
  rateLimitPerAgent?: { requestsPerMinute: number };
  /** Audit every invocation */
  auditRequired: boolean;
}

// ═══════════════════════════════════════════════════════════
// MCP Resource
// ═══════════════════════════════════════════════════════════

export interface McpResource {
  /** Resource URI */
  uri: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** MIME type */
  mimeType: string;
  /** Is this sensitive data? */
  sensitive: boolean;
  /** Required data scope to access */
  requiredScope: string;
}

// ═══════════════════════════════════════════════════════════
// MCP Prompt
// ═══════════════════════════════════════════════════════════

export interface McpPrompt {
  /** Prompt name */
  name: string;
  /** Description */
  description: string;
  /** Template parameters */
  parameters: McpPromptParameter[];
}

export interface McpPromptParameter {
  name: string;
  description: string;
  required: boolean;
  type: "string" | "number" | "boolean" | "array" | "object";
}

// ═══════════════════════════════════════════════════════════
// MCP Server Catalog
// ═══════════════════════════════════════════════════════════

/** All MCP servers that should exist in the system */
export type McpServerName =
  | "treasury"
  | "tokenomics"
  | "compliance"
  | "legal-docs"
  | "exchange-packets"
  | "explorer"
  | "support-desk"
  | "market-intelligence"
  | "portfolio-rwa"
  | "payments"
  | "customer-records"
  | "chain-ops"
  | "identity"
  | "agent-registry";

export interface McpHub {
  /** All registered servers */
  servers: Map<McpServerName, McpServerDefinition>;
  /** Global health status */
  overallStatus: McpServerStatus;
  /** Last full health check */
  lastFullCheck: string;
}
