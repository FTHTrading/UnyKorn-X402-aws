/**
 * Exchange Readiness OS — API Routes
 *
 * REST API for the Exchange Readiness OS.
 * All endpoints are public — transparency is the strategy.
 *
 * ── Token Truth ────────────────────────────────────────────
 *   GET /readiness/v1/state              → Full exchange readiness state
 *   GET /readiness/v1/token              → Token registry
 *   GET /readiness/v1/supply             → Current supply snapshot
 *   GET /readiness/v1/vesting            → All vesting schedules
 *   GET /readiness/v1/treasury           → Treasury wallets
 *   GET /readiness/v1/admin-powers       → Admin powers disclosure
 *
 * ── Issuer ─────────────────────────────────────────────────
 *   GET /readiness/v1/issuer             → Issuer entity info
 *
 * ── Security ───────────────────────────────────────────────
 *   GET /readiness/v1/security           → Security posture
 *
 * ── Market ─────────────────────────────────────────────────
 *   GET /readiness/v1/market             → Market structure
 *
 * ── Operations ─────────────────────────────────────────────
 *   GET /readiness/v1/network            → Network ops snapshot
 *   GET /readiness/v1/incident-response  → Incident response plan
 *
 * ── Risk & Readiness ───────────────────────────────────────
 *   GET /readiness/v1/risk-flags         → All auto-detected risk flags
 *   GET /readiness/v1/risk-summary       → Risk summary w/ recommendations
 *   GET /readiness/v1/score              → Readiness scores
 *
 * ── Exchange Packets ───────────────────────────────────────
 *   GET /readiness/v1/packets            → All exchange packets
 *   GET /readiness/v1/packets/:exchange  → Specific exchange packet
 *
 * ── Wallet Integration ─────────────────────────────────────
 *   GET /readiness/v1/wallet-params      → Wallet integration parameters
 */

import type { FastifyInstance } from "fastify";
import { getExchangeReadinessState } from "./seed-data.js";
import { ExchangePacketGenerator, SUPPORTED_EXCHANGES } from "./packet-generator.js";
import { RiskScanner } from "./risk-engine.js";

let packetGen: ExchangePacketGenerator;
let riskScanner: RiskScanner;

function ensureInit(): void {
  if (!packetGen) {
    packetGen = new ExchangePacketGenerator();
    riskScanner = new RiskScanner();
  }
}

export function createReadinessRoutes(app: FastifyInstance): void {
  ensureInit();

  // ── Full State ─────────────────────────────────────────────

  app.get("/readiness/v1/state", async () => {
    return getExchangeReadinessState();
  });

  // ── Token Truth ────────────────────────────────────────────

  app.get("/readiness/v1/token", async () => {
    const state = getExchangeReadinessState();
    return state.token;
  });

  app.get("/readiness/v1/supply", async () => {
    const state = getExchangeReadinessState();
    return state.supply;
  });

  app.get("/readiness/v1/vesting", async () => {
    const state = getExchangeReadinessState();
    return {
      schedules: state.vesting,
      totalVesting: state.vesting.reduce(
        (s, v) => s + BigInt(v.totalAmount),
        0n
      ).toString(),
      totalReleased: state.vesting.reduce(
        (s, v) => s + BigInt(v.releasedAmount),
        0n
      ).toString(),
      totalRemaining: state.vesting.reduce(
        (s, v) => s + BigInt(v.remainingAmount),
        0n
      ).toString(),
    };
  });

  app.get("/readiness/v1/treasury", async () => {
    const state = getExchangeReadinessState();
    return {
      wallets: state.treasuryWallets,
      totalUNY: state.treasuryWallets.reduce(
        (s, w) => s + BigInt(w.balanceUNY),
        0n
      ).toString(),
      totalUSD: state.treasuryWallets.reduce(
        (s, w) => s + parseFloat(w.balanceUSD),
        0
      ).toFixed(2),
      multiSigCount: state.treasuryWallets.filter(w => w.isMultiSig).length,
      singleKeyCount: state.treasuryWallets.filter(w => !w.isMultiSig).length,
    };
  });

  app.get("/readiness/v1/admin-powers", async () => {
    const state = getExchangeReadinessState();
    return {
      powers: state.adminPowers,
      existingPowers: state.adminPowers.filter(p => p.exists).length,
      rugRiskPowers: state.adminPowers.filter(p => p.canRugUsers).length,
      mitigatedPowers: state.adminPowers.filter(
        p => p.exists && p.mitigationStatus === "implemented"
      ).length,
    };
  });

  // ── Issuer ─────────────────────────────────────────────────

  app.get("/readiness/v1/issuer", async () => {
    const state = getExchangeReadinessState();
    return state.issuer;
  });

  // ── Security ───────────────────────────────────────────────

  app.get("/readiness/v1/security", async () => {
    const state = getExchangeReadinessState();
    return state.security;
  });

  // ── Market ─────────────────────────────────────────────────

  app.get("/readiness/v1/market", async () => {
    const state = getExchangeReadinessState();
    return state.marketStructure;
  });

  // ── Operations ─────────────────────────────────────────────

  app.get("/readiness/v1/network", async () => {
    const state = getExchangeReadinessState();
    return state.networkOps;
  });

  app.get("/readiness/v1/incident-response", async () => {
    const state = getExchangeReadinessState();
    return state.incidentResponse;
  });

  // ── Risk & Readiness ───────────────────────────────────────

  app.get("/readiness/v1/risk-flags", async () => {
    const state = getExchangeReadinessState();
    return {
      flags: state.riskFlags,
      total: state.riskFlags.length,
      bySeverity: {
        critical: state.riskFlags.filter(f => f.severity === "critical").length,
        high: state.riskFlags.filter(f => f.severity === "high").length,
        medium: state.riskFlags.filter(f => f.severity === "medium").length,
        low: state.riskFlags.filter(f => f.severity === "low").length,
        info: state.riskFlags.filter(f => f.severity === "info").length,
      },
    };
  });

  app.get("/readiness/v1/risk-summary", async () => {
    const state = getExchangeReadinessState();
    const scanner = new RiskScanner();
    const flags = scanner.scan(state);
    return scanner.getSummary(flags);
  });

  app.get("/readiness/v1/score", async () => {
    const state = getExchangeReadinessState();
    return state.readiness;
  });

  // ── Exchange Packets ───────────────────────────────────────

  app.get("/readiness/v1/packets", async () => {
    const packets = packetGen.generateAll();
    return {
      exchangeCount: packets.length,
      packets,
      supportedExchanges: SUPPORTED_EXCHANGES,
    };
  });

  app.get("/readiness/v1/packets/:exchange", async (req) => {
    const { exchange } = req.params as { exchange: string };
    try {
      return packetGen.generate(exchange);
    } catch {
      return {
        error: `Unknown exchange: ${exchange}`,
        supported: SUPPORTED_EXCHANGES,
      };
    }
  });

  // ── Wallet Integration ─────────────────────────────────────

  app.get("/readiness/v1/wallet-params", async () => {
    const state = getExchangeReadinessState();
    return state.walletIntegration;
  });

  // ── Health / Meta ──────────────────────────────────────────

  app.get("/readiness/v1/health", async () => {
    return {
      status: "ok",
      service: "exchange-readiness-os",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    };
  });
}
