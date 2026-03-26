/**
 * Exchange Readiness OS — Public API
 *
 * Exports all modules for the Exchange Readiness Operating System:
 *   1. Core Types (7-layer data model)
 *   2. Seed Data (canonical UnyKorn state)
 *   3. Packet Generator (per-exchange listing packets)
 *   4. Risk Engine (auto-detect flags + scoring)
 *   5. API Routes (Fastify route registration)
 */

// Types
export type {
  // Layer 1 — Issuer
  IssuerEntity,
  KeyPerson,
  LegalCounsel,
  TokenClassification,
  RegulatoryFiling,
  // Layer 2 — Token Truth
  TokenRegistry,
  SupplySnapshot,
  VestingSchedule,
  AdminPower,
  TreasuryWallet,
  // Layer 3 — Exchange Integration
  ExchangePacket,
  WalletIntegrationParams,
  // Layer 4 — Security
  SecurityPosture,
  AuditRecord,
  BugBountyProgram,
  PenTestRecord,
  IncidentRecord,
  // Layer 5 — Market
  MarketStructure,
  MarketMakerInfo,
  DexLiquidityInfo,
  // Layer 6 — Operations
  NetworkOpsSnapshot,
  SlaTarget,
  IncidentResponsePlan,
  SeverityLevel,
  EscalationContact,
  // Layer 7 — Risk
  RiskFlag,
  RiskSeverity,
  ReadinessScore,
  CategoryScore,
  ScoreItem,
  ExchangeScore,
  // Composite
  ExchangeReadinessState,
} from "./types.js";

// Seed Data
export {
  ISSUER,
  TOKEN_REGISTRY,
  SUPPLY_SNAPSHOT,
  VESTING_SCHEDULES,
  ADMIN_POWERS,
  TREASURY_WALLETS,
  SECURITY_POSTURE,
  MARKET_STRUCTURE,
  NETWORK_OPS,
  INCIDENT_RESPONSE,
  WALLET_INTEGRATION,
  getExchangeReadinessState,
} from "./seed-data.js";

// Packet Generator
export { ExchangePacketGenerator, SUPPORTED_EXCHANGES } from "./packet-generator.js";
export type { SupportedExchange } from "./packet-generator.js";

// Risk Engine
export { RiskScanner } from "./risk-engine.js";
export type { RiskSummary } from "./risk-engine.js";

// Routes
export { createReadinessRoutes } from "./routes.js";
