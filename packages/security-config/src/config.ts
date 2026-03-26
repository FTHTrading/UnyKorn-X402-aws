/**
 * @unykorn/security-config — Environment & Service Configuration
 *
 * Per-environment configuration for security services.
 */

import type { SecretProvider } from "./secrets.js";

/** Known deployment environments. */
export type Environment = "development" | "staging" | "production";

/** Port assignments for security-critical services. */
export interface ServicePorts {
  signerPort: number;
  agentGatewayPort: number;
  unyLedgerPort: number;
  capitalEnginePort: number;
}

/** Default port allocations. */
export const DEFAULT_PORTS: ServicePorts = {
  signerPort: 4050,
  agentGatewayPort: 4010,
  unyLedgerPort: 4030,
  capitalEnginePort: 4000,
};

/**
 * Security configuration for a deployment.
 */
export interface SecurityConfig {
  environment: Environment;
  ports: ServicePorts;
  signerBaseUrl: string;
  databaseUrl: string;
  signerDbUrl: string;

  /** Key namespace prevents cross-environment key collision. */
  keyNamespace: string;

  /** Whether to enforce HTTPS for signer calls (always true in prod). */
  requireTls: boolean;

  /** Maximum seconds a signing request can be in flight. */
  signerTimeoutMs: number;

  /** Audit retention in days. */
  auditRetentionDays: number;
}

/**
 * Build security config from environment variables and a secret provider.
 */
export async function buildSecurityConfig(
  secrets: SecretProvider,
  env?: Environment
): Promise<SecurityConfig> {
  const environment: Environment =
    env ??
    ((process.env["NODE_ENV"] === "production"
      ? "production"
      : process.env["NODE_ENV"] === "staging"
        ? "staging"
        : "development") as Environment);

  const signerPort = parseInt(
    process.env["SIGNER_PORT"] ?? String(DEFAULT_PORTS.signerPort),
    10
  );

  const signerHost = process.env["SIGNER_HOST"] ?? "127.0.0.1";
  const protocol = environment === "production" ? "https" : "http";

  const databaseUrl =
    (await secrets.get("DATABASE_URL")) ??
    process.env["DATABASE_URL"] ??
    "";

  const signerDbUrl =
    (await secrets.get("SIGNER_DB_URL")) ??
    process.env["SIGNER_DB_URL"] ??
    "sqlite:signer.db?mode=rwc";

  return {
    environment,
    ports: {
      ...DEFAULT_PORTS,
      signerPort,
    },
    signerBaseUrl: `${protocol}://${signerHost}:${signerPort}`,
    databaseUrl,
    signerDbUrl,
    keyNamespace: `unykorn-${environment}`,
    requireTls: environment === "production",
    signerTimeoutMs: environment === "production" ? 5_000 : 30_000,
    auditRetentionDays: environment === "production" ? 365 : 30,
  };
}

/**
 * Validate that a security config is safe for the target environment.
 */
export function validateSecurityConfig(
  config: SecurityConfig
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (config.environment === "production") {
    if (!config.requireTls) errors.push("TLS required in production");
    if (config.signerBaseUrl.startsWith("http://"))
      errors.push("signer must use HTTPS in production");
    if (!config.databaseUrl) errors.push("DATABASE_URL required in production");
    if (config.signerTimeoutMs > 10_000)
      errors.push("signer timeout too high for production");
  }

  if (config.ports.signerPort < 1 || config.ports.signerPort > 65535)
    errors.push("invalid signer port");

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
