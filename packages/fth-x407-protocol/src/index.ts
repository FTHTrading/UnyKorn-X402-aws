/**
 * fth-x407-protocol
 *
 * x407 — Monetization & Trust Operating Layer for AI‑to‑AI Systems
 *
 * Public API surface:
 *
 *   X407Orchestrator    — unified entry point (authenticate → authorize → session → meter → settle)
 *   ChallengeEngine     — HTTP 407 challenge‑response authentication
 *   TrustRegistry       — agent trust profiling and scoring
 *   SessionManager      — metered session lifecycle
 *   RevenueRouter       — fee splitting and revenue distribution
 *   ComplianceGateway   — pre/post‑transaction compliance checks
 *   AuditTrail          — tamper‑evident hash‑chained audit log
 */

// ── Core Orchestrator ────────────────────────────────────────────────
export { X407Orchestrator } from "./orchestrator";
export type {
  AuthenticateResult,
  AuthorizeResult,
  OpenSessionResult,
  SettleResult,
} from "./orchestrator";

// ── Engines ──────────────────────────────────────────────────────────
export { ChallengeEngine } from "./challenge";
export { TrustRegistry } from "./trust";
export { SessionManager } from "./session";
export type { SessionCreateParams } from "./session";
export { RevenueRouter } from "./revenue";
export type { RevenueRouterConfig, RevenueSplit } from "./revenue";
export { ComplianceGateway } from "./compliance";
export { AuditTrail } from "./audit";

// ── Types ────────────────────────────────────────────────────────────
export {
  X407_PROTOCOL_VERSION,
  DEFAULT_CONFIG,
  DEFAULT_TRUST_TIER_THRESHOLDS,
} from "./types";
export type {
  // Challenge
  ChallengeType,
  ChallengeStatus,
  ChallengePayload,
  ChallengeResponse,
  X407Challenge,
  // Trust
  TrustTier,
  TrustProfile,
  TrustScoreFactors,
  Accreditation,
  // Session
  SessionStatus,
  MeteringAccumulator,
  X407Session,
  // Revenue
  RevenueCategory,
  RevenueDestination,
  RevenueEvent,
  FeeSchedule,
  RevenueSnapshot,
  // Compliance
  ComplianceVerdict,
  ComplianceCheck,
  ComplianceContext,
  ComplianceRule,
  // Audit
  AuditSeverity,
  X407AuditEntry,
  // Config
  X407Config,
} from "./types";
