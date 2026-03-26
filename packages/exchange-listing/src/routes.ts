/**
 * Exchange Listing API Routes
 *
 * Serves all exchange-integration and listing-readiness endpoints:
 *
 * ── CoinGecko Standard (for aggregator crawling) ────────────
 *   GET /listing/v1/pairs            → All trading pairs
 *   GET /listing/v1/tickers          → 24h pricing per pair
 *   GET /listing/v1/orderbook        → Depth (bid/ask) per pair
 *   GET /listing/v1/historical_trades → Recent trade history
 *
 * ── CoinMarketCap Standard ─────────────────────────────────
 *   GET /listing/v1/summary          → Market summary (all pairs)
 *   GET /listing/v1/assets           → Asset metadata
 *
 * ── Token & Exchange Metadata ──────────────────────────────
 *   GET /listing/v1/asset-info       → Full token information
 *   GET /listing/v1/contracts        → All contract deployments
 *
 * ── Proof of Reserves ──────────────────────────────────────
 *   GET /listing/v1/proof-of-reserves   → Full PoR attestation
 *   GET /listing/v1/proof-of-reserves/merkle/:index → Merkle proof for reserve entry
 *
 * ── Compliance & Readiness ─────────────────────────────────
 *   GET /listing/v1/readiness        → Full readiness report
 *   GET /listing/v1/readiness/:exchange → Per-exchange readiness
 *
 * ── Listing Applications ───────────────────────────────────
 *   GET /listing/v1/application/:exchange → Pre-filled application
 *   GET /listing/v1/applications     → All applications
 *
 * All endpoints are public — transparency is the strategy.
 */

import type { FastifyInstance } from "fastify";
import { getTokenInfo, hashTokenInfo } from "./token-info";
import { CoinGeckoAPI } from "./coingecko-api";
import { ProofOfReservesEngine } from "./proof-of-reserves";
import { ComplianceEngine } from "./compliance";
import { ListingApplicationGenerator } from "./applications";

// ── Singletons ─────────────────────────────────────────────

let geckoAPI: CoinGeckoAPI;
let porEngine: ProofOfReservesEngine;
let compliance: ComplianceEngine;
let appGenerator: ListingApplicationGenerator;

function ensureInit(): void {
  if (!geckoAPI) {
    geckoAPI = new CoinGeckoAPI();
    porEngine = new ProofOfReservesEngine();
    compliance = new ComplianceEngine();
    appGenerator = new ListingApplicationGenerator();
  }
}

// ── Route Registration ─────────────────────────────────────

export function createListingRoutes(app: FastifyInstance): void {
  ensureInit();

  // ── CoinGecko Standard ─────────────────────────────────────

  app.get("/listing/v1/pairs", async () => geckoAPI.getPairs());

  app.get("/listing/v1/tickers", async () => geckoAPI.getTickers());

  app.get("/listing/v1/orderbook", async (req) => {
    const { ticker_id, depth } = req.query as { ticker_id?: string; depth?: string };
    if (!ticker_id) return { error: "ticker_id query parameter required", example: "?ticker_id=UNY_USDT&depth=50" };
    const book = geckoAPI.getOrderBook(ticker_id, depth ? parseInt(depth) : 50);
    if (!book) return { error: `Unknown pair: ${ticker_id}`, available: geckoAPI.getPairs().map((p) => p.ticker_id) };
    return book;
  });

  app.get("/listing/v1/historical_trades", async (req) => {
    const { ticker_id, limit } = req.query as { ticker_id?: string; limit?: string };
    if (!ticker_id) return { error: "ticker_id query parameter required" };
    return geckoAPI.getHistoricalTrades(ticker_id, limit ? parseInt(limit) : 200);
  });

  // ── CoinMarketCap Standard ─────────────────────────────────

  app.get("/listing/v1/summary", async () => geckoAPI.getSummary());

  app.get("/listing/v1/assets", async () => geckoAPI.getAssets());

  // ── Token & Exchange Metadata ──────────────────────────────

  app.get("/listing/v1/asset-info", async () => {
    const info = getTokenInfo();
    return {
      ...info,
      _hash: hashTokenInfo(info),
      _apiVersion: "1.0.0",
      _generatedAt: new Date().toISOString(),
    };
  });

  app.get("/listing/v1/contracts", async () => {
    const info = getTokenInfo();
    return {
      symbol: info.symbol,
      name: info.name,
      contracts: info.contracts,
      totalChains: info.contracts.length,
      standard: info.standard,
    };
  });

  // ── Proof of Reserves ──────────────────────────────────────

  app.get("/listing/v1/proof-of-reserves", async () => porEngine.generateProof());

  app.get("/listing/v1/proof-of-reserves/merkle/:index", async (req) => {
    const { index } = req.params as { index: string };
    const idx = parseInt(index);
    const proof = porEngine.getMerkleProof(idx);
    if (!proof) return { error: `Invalid reserve index: ${index}`, maxIndex: porEngine.getReserves().length - 1 };
    return {
      reserve: porEngine.getReserves()[idx],
      merkleProof: proof,
    };
  });

  // ── Compliance & Readiness ─────────────────────────────────

  app.get("/listing/v1/readiness", async () => compliance.generateReport());

  app.get("/listing/v1/readiness/:exchange", async (req) => {
    const { exchange } = req.params as { exchange: string };
    const report = compliance.generateReport();
    const exReady = report.exchangeReadiness.find(
      (e) => e.exchange.toLowerCase() === exchange.toLowerCase()
    );
    if (!exReady) {
      return {
        error: `Unknown exchange: ${exchange}`,
        available: report.exchangeReadiness.map((e) => e.exchange),
      };
    }
    return {
      exchange: exReady,
      relevantChecks: compliance.getChecks().filter((c) =>
        c.requiredBy.some((r) =>
          r.toLowerCase().includes(exchange.toLowerCase()) || r === "all exchanges" || r === "all regulated"
        )
      ),
      overallScore: report.overallScore,
    };
  });

  // ── Listing Applications ───────────────────────────────────

  app.get("/listing/v1/application/:exchange", async (req) => {
    const { exchange } = req.params as { exchange: string };
    return appGenerator.generate(exchange);
  });

  app.get("/listing/v1/applications", async () => appGenerator.generateAll());

  // ── Overview / Index ───────────────────────────────────────

  app.get("/listing/v1/overview", async () => {
    const report = compliance.generateReport();
    const por = porEngine.generateProof();
    const info = getTokenInfo();

    return {
      system: "UNY Exchange Listing Readiness v1.0.0",
      token: {
        name: info.name,
        symbol: info.symbol,
        chains: info.contracts.length,
        standard: info.standard,
        maxSupply: info.maxSupply,
        isMintable: info.isMintable,
        isBurnable: info.isBurnable,
      },
      readiness: {
        overallScore: report.overallScore,
        status: report.overallStatus,
        checksPass: report.categories,
      },
      reserves: {
        ratio: por.reserveRatio,
        isSurplus: por.isSurplus,
        totalReservesUSD: por.totalReservesUSD,
        merkleRoot: por.merkleRoot,
      },
      market: {
        pairs: geckoAPI.getPairs().length,
        tickers: geckoAPI.getTickers().length,
      },
      exchangeReadiness: report.exchangeReadiness.map((e) => ({
        exchange: e.exchange,
        score: e.readinessScore,
        status: e.status,
      })),
      endpoints: {
        coingecko: ["/listing/v1/pairs", "/listing/v1/tickers", "/listing/v1/orderbook", "/listing/v1/historical_trades"],
        cmc: ["/listing/v1/summary", "/listing/v1/assets"],
        metadata: ["/listing/v1/asset-info", "/listing/v1/contracts"],
        reserves: ["/listing/v1/proof-of-reserves", "/listing/v1/proof-of-reserves/merkle/:index"],
        compliance: ["/listing/v1/readiness", "/listing/v1/readiness/:exchange"],
        applications: ["/listing/v1/application/:exchange", "/listing/v1/applications"],
      },
    };
  });
}
