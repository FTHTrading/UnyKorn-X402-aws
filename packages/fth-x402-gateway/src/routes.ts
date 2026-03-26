/**
 * FTH x402 Gateway — Route Configuration
 *
 * Defines paid routes and route matching logic. Each route specifies the
 * payment, policy, and origin/R2 configuration. The Worker matches incoming
 * requests against these routes to decide whether to gate with 402.
 */

import type { RouteConfig, RoutePolicy } from "./types";

// ---------------------------------------------------------------------------
// Default policies
// ---------------------------------------------------------------------------

const DEFAULT_POLICY: RoutePolicy = {
  kyc_required: false,
  min_pass_level: "basic",
  rate_limit: "100/hour",
};

// ---------------------------------------------------------------------------
// Route catalog — first live route
// ---------------------------------------------------------------------------

export const PAID_ROUTES: RouteConfig[] = [
  // ── Original agent/trade/genesis routes ──
  {
    path: "/api/v1/agent/pay-api/:provider",
    namespace: "fth.x402.route.agent-pay-api",
    payment: {
      asset: "UNY",
      amount: "0.0001",
      receiver: "$UNYKORN_TREASURY_ADDRESS",
      memo_prefix: "fth:agent-pay-api",
      rail: "unykorn-l1",
    },
    policy: DEFAULT_POLICY,
  },
  {
    path: "/api/v1/genesis/repro-pack/:suite",
    namespace: "fth.x402.route.genesis-repro",
    payment: {
      asset: "UNY",
      amount: "0.0005",
      receiver: "$UNYKORN_TREASURY_ADDRESS",
      memo_prefix: "fth:genesis",
      rail: "unykorn-l1",
    },
    policy: DEFAULT_POLICY,
    r2_key_pattern: "genesis/{suite}",
  },
  {
    path: "/api/v1/trade/verify/:trade_id",
    namespace: "fth.x402.route.trade-verify",
    payment: {
      asset: "UNY",
      amount: "0.00025",
      receiver: "$UNYKORN_TREASURY_ADDRESS",
      memo_prefix: "fth:trade",
      rail: "unykorn-l1",
    },
    policy: DEFAULT_POLICY,
    origin: "https://api.fth.trading/internal/trade/verify/{trade_id}",
  },
  {
    path: "/api/v1/invoices/export/:format",
    namespace: "fth.x402.route.invoice-export",
    payment: {
      asset: "UNY",
      amount: "0.001",
      receiver: "$UNYKORN_TREASURY_ADDRESS",
      memo_prefix: "fth:invoice-export",
      rail: "unykorn-l1",
    },
    policy: {
      ...DEFAULT_POLICY,
      min_pass_level: "pro",
    },
    origin: "https://api.fth.trading/internal/invoices/export/{format}",
  },

  // ── Explorer Premium Routes (MONEY MAKERS) ──
  {
    path: "/api/v1/explorer/analytics/:period",
    namespace: "fth.x402.route.explorer-analytics",
    payment: {
      asset: "UNY",
      amount: "0.0002",
      receiver: "$UNYKORN_TREASURY_ADDRESS",
      memo_prefix: "fth:explorer:analytics",
      rail: "unykorn-l1",
    },
    policy: DEFAULT_POLICY,
  },
  {
    path: "/api/v1/explorer/receipt/:receipt_id",
    namespace: "fth.x402.route.explorer-receipt-detail",
    payment: {
      asset: "UNY",
      amount: "0.00015",
      receiver: "$UNYKORN_TREASURY_ADDRESS",
      memo_prefix: "fth:explorer:receipt",
      rail: "unykorn-l1",
    },
    policy: DEFAULT_POLICY,
  },
  {
    path: "/api/v1/explorer/namespace/:fqn",
    namespace: "fth.x402.route.explorer-namespace-detail",
    payment: {
      asset: "UNY",
      amount: "0.0001",
      receiver: "$UNYKORN_TREASURY_ADDRESS",
      memo_prefix: "fth:explorer:namespace",
      rail: "unykorn-l1",
    },
    policy: DEFAULT_POLICY,
  },
  {
    path: "/api/v1/explorer/agent/:agent_id",
    namespace: "fth.x402.route.explorer-agent-exec",
    payment: {
      asset: "UNY",
      amount: "0.0003",
      receiver: "$UNYKORN_TREASURY_ADDRESS",
      memo_prefix: "fth:explorer:agent",
      rail: "unykorn-l1",
    },
    policy: DEFAULT_POLICY,
  },
  {
    path: "/api/v1/explorer/export/:format",
    namespace: "fth.x402.route.explorer-export",
    payment: {
      asset: "UNY",
      amount: "0.002",
      receiver: "$UNYKORN_TREASURY_ADDRESS",
      memo_prefix: "fth:explorer:export",
      rail: "unykorn-l1",
    },
    policy: {
      ...DEFAULT_POLICY,
      min_pass_level: "pro",
    },
  },
];

// ---------------------------------------------------------------------------
// Route matcher
// ---------------------------------------------------------------------------

interface MatchResult {
  route: RouteConfig;
  params: Record<string, string>;
}

/**
 * Convert a pattern like "/api/v1/:resource/:id" to a regex.
 * Named params become capture groups.
 */
function compilePattern(pattern: string): {
  regex: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

/**
 * Match a URL pathname against registered paid routes.
 * Returns the first match (order matters).
 */
export function matchRoute(pathname: string): MatchResult | null {
  for (const route of PAID_ROUTES) {
    const { regex, paramNames } = compilePattern(route.path);
    const match = pathname.match(regex);
    if (match) {
      const params: Record<string, string> = {};
      paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { route, params };
    }
  }
  return null;
}
