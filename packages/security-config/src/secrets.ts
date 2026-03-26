/**
 * @unykorn/security-config — Secret Provider Abstraction
 *
 * Pluggable secret access layer. Local dev uses env/file,
 * production uses vault-backed providers.
 */

/** A secret provider retrieves named secrets at runtime. */
export interface SecretProvider {
  /** Retrieve a secret by name. Returns undefined if not found. */
  get(name: string): Promise<string | undefined>;

  /** Check if a secret exists without retrieving it. */
  has(name: string): Promise<boolean>;

  /** Provider label for logging (never log actual secrets). */
  readonly providerName: string;
}

/**
 * Environment-variable-backed secret provider.
 * Reads secrets from process.env with an optional prefix.
 *
 * Example: prefix="UNY_" → get("DB_PASSWORD") reads UNY_DB_PASSWORD
 */
export class EnvSecretProvider implements SecretProvider {
  readonly providerName = "env";

  constructor(private readonly prefix: string = "") {}

  async get(name: string): Promise<string | undefined> {
    return process.env[`${this.prefix}${name}`];
  }

  async has(name: string): Promise<boolean> {
    return `${this.prefix}${name}` in process.env;
  }
}

/**
 * Static map provider — for testing only.
 * NEVER use in production.
 */
export class StaticSecretProvider implements SecretProvider {
  readonly providerName = "static";

  constructor(private readonly secrets: Record<string, string>) {}

  async get(name: string): Promise<string | undefined> {
    return this.secrets[name];
  }

  async has(name: string): Promise<boolean> {
    return name in this.secrets;
  }
}

/**
 * Chaining provider — tries providers in order until one returns a value.
 */
export class ChainSecretProvider implements SecretProvider {
  readonly providerName: string;

  constructor(private readonly providers: SecretProvider[]) {
    this.providerName = `chain(${providers.map((p) => p.providerName).join(",")})`;
  }

  async get(name: string): Promise<string | undefined> {
    for (const p of this.providers) {
      const val = await p.get(name);
      if (val !== undefined) return val;
    }
    return undefined;
  }

  async has(name: string): Promise<boolean> {
    for (const p of this.providers) {
      if (await p.has(name)) return true;
    }
    return false;
  }
}
