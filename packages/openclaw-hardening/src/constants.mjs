// ---------------------------------------------------------------------------
// OpenClaw Hardening — Constants & Single Source of Truth
// ---------------------------------------------------------------------------
// Every validation module imports from here. No magic strings elsewhere.
// ---------------------------------------------------------------------------

/** Valid delivery modes for cron jobs and delivery config. */
export const VALID_DELIVERY_MODES = Object.freeze(["announce", "webhook", "none", "deliver"]);

/** Delivery mode that suppresses all outbound delivery. */
export const NO_DELIVERY_MODE = "none";

/** Known-invalid delivery modes that users may mistakenly use. */
export const KNOWN_INVALID_MODES = Object.freeze(["silent", "quiet", "off", "disabled", "false", "null", "mute"]);

/** Providers that require external API keys and cannot run in isolated cron contexts. */
export const NON_CRON_SAFE_PROVIDERS = Object.freeze([
  "github-copilot",
  "copilot",
  "vscode-copilot",
]);

/** Providers that can run locally without external API keys. */
export const CRON_SAFE_PROVIDERS = Object.freeze([
  "ollama",
  "llamafile",
  "lmstudio",
  "localai",
]);

/** Required fields for a valid Ollama model config entry. */
export const REQUIRED_MODEL_FIELDS = Object.freeze(["id", "name"]);

/** Default OpenClaw paths. */
export const OPENCLAW_PATHS = Object.freeze({
  home:          homeDir => `${homeDir}/.openclaw`,
  config:        homeDir => `${homeDir}/.openclaw/openclaw.json`,
  cronJobs:      homeDir => `${homeDir}/.openclaw/cron/jobs.json`,
  deliveryQueue: homeDir => `${homeDir}/.openclaw/delivery-queue`,
  failedQueue:   homeDir => `${homeDir}/.openclaw/delivery-queue/failed`,
  memoryDb:      homeDir => `${homeDir}/.openclaw/memory/main.sqlite`,
  memoryDir:     homeDir => `${homeDir}/.openclaw/workspace/memory`,
  gatewayLock:   homeDir => `${homeDir}/.openclaw/gateway.lock`,
  backupRoot:    homeDir => `${homeDir}/.openclaw/backups`,
});

/** Gateway defaults. */
export const GATEWAY_DEFAULTS = Object.freeze({
  port: 18789,
  healthEndpoint: "/health",
  healthTimeout: 5000,
});

/** Ollama defaults. */
export const OLLAMA_DEFAULTS = Object.freeze({
  baseUrl: "http://localhost:11434",
  embeddingEndpoint: "/api/embeddings",
  embeddingModel: "nomic-embed-text",
  timeout: 10000,
});
