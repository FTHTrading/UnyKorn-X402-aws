/**
 * UNY Economics API Routes
 *
 * Public endpoints that expose the full economics engine:
 *
 *   GET /economics/overview       — Full system overview (AMM + Flywheel + Credibility)
 *   GET /economics/amm            — AMM pool state, price, reserves, volume
 *   GET /economics/amm/quote      — Get a swap quote without executing
 *   GET /economics/flywheel       — Revenue flywheel state, burn/LP history
 *   GET /economics/genesis        — Genesis provenance chain (full audit trail)
 *   GET /economics/credibility    — Credibility score with breakdown
 *   GET /economics/fundamentals   — Token fundamentals (supply, burn, velocity)
 *   GET /economics/reserves       — Reserve attestation
 *   GET /economics/infrastructure — All infrastructure components
 *
 * These endpoints are public and unauthenticated — transparency by design.
 */

import type { FastifyInstance } from "fastify";
import { UnyAMM } from "./amm";
import { GenesisProvenance } from "./genesis";
import { RevenueFlywheel } from "./flywheel";
import { CredibilityLayer } from "./credibility";

// ── Singleton Instances ────────────────────────────────────

let amm: UnyAMM;
let provenance: GenesisProvenance;
let flywheel: RevenueFlywheel;
let credibility: CredibilityLayer;

function ensureInitialized(): void {
  if (!amm) {
    amm = new UnyAMM();
    provenance = new GenesisProvenance();
    flywheel = new RevenueFlywheel(amm);
    credibility = new CredibilityLayer();

    // Initialize AMM with seed liquidity
    // 10M UNY + 100K USDF = $0.01 initial price
    const seedUNY = 10_000_000n * 10n ** 18n;
    const seedUSDf = 100_000n * 10n ** 6n;
    amm.initializePool(seedUNY, seedUSDf, "protocol-treasury");

    // Register all infrastructure
    provenance.registerAllComponents();

    // Wire credibility layer
    credibility.setAMMState(amm.getState());
    credibility.setFlywheelState(flywheel.getState());
    credibility.setProvenance(provenance.generateProvenanceChain());
  }
}

// ── Helper: bigint-safe JSON serialization ─────────────────

function serializeState(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

// ── Route Registration ─────────────────────────────────────

export function createEconomicsRoutes(app: FastifyInstance): void {
  ensureInitialized();

  // ── Full Overview ──────────────────────────────────────────

  app.get("/economics/overview", async () => {
    credibility.setAMMState(amm.getState());
    credibility.setFlywheelState(flywheel.getState());

    return serializeState({
      system: "UNY Economics Engine v1.0.0",
      description: "Complete tokenomics infrastructure for UnyKorn x402 payment protocol",
      amm: amm.getState(),
      flywheel: flywheel.getState(),
      fundamentals: credibility.computeFundamentals(),
      credibility: credibility.computeCredibilityScore(),
      reserves: credibility.computeReserveAttestation(),
      links: {
        gateway: "https://fth-x402-gateway-staging.kevanbtc.workers.dev",
        explorer: "https://main.unykorn-explorer.pages.dev",
        facilitator: "http://localhost:3100",
        uny_token_avalanche: "https://snowtrace.io/token/0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
        genesis_world: "https://github.com/FTHTrading/genesis-world",
        usdf_platform: "https://github.com/FTHTrading/USDF",
      },
    });
  });

  // ── AMM State ──────────────────────────────────────────────

  app.get("/economics/amm", async () => {
    const state = amm.getState();
    const protocolFees = amm.getProtocolFees();
    const treasuryPos = amm.getPosition("protocol-treasury");

    return serializeState({
      pool: {
        pair: "UNY/USDF",
        feeRate: "0.30%",
        feeSplit: "50% LPs / 50% protocol (buy-and-burn)",
        ...state,
      },
      protocolFees: protocolFees.toString(),
      treasuryPosition: treasuryPos,
      externalLP: {
        platform: "TraderJoe Liquidity Book V2.1",
        chain: "Avalanche C-Chain",
        contract: "UnyKornLPManager.sol",
        pools: ["UNY/USDC", "UNY/WAVAX"],
        description: "Production liquidity managed via UnyKornLPManager contract",
      },
    });
  });

  // ── AMM Quote ──────────────────────────────────────────────

  app.get("/economics/amm/quote", async (req) => {
    const query = req.query as { amount?: string; direction?: string };
    const amount = BigInt(query.amount ?? "1000000000000000000"); // Default 1 UNY
    const direction = (query.direction ?? "USDF_TO_UNY") as
      | "UNY_TO_USDF"
      | "USDF_TO_UNY";

    const quote = amm.quote(amount, direction);

    return serializeState({
      input: {
        amount: amount.toString(),
        token: direction === "UNY_TO_USDF" ? "UNY" : "USDF",
      },
      output: {
        amount: quote.amountOut.toString(),
        token: direction === "UNY_TO_USDF" ? "USDF" : "UNY",
      },
      fee: quote.fee.toString(),
      priceImpact: `${quote.priceImpact.toFixed(4)}%`,
      effectivePrice: quote.effectivePrice,
      currentPoolPrice: amm.getState().priceUNY,
    });
  });

  // ── Flywheel State ─────────────────────────────────────────

  app.get("/economics/flywheel", async () => {
    return serializeState({
      description:
        "Revenue flywheel: x402 fees → 40% burn + 30% LP + 20% treasury + 10% staking",
      state: flywheel.getState(),
      burnHistory: flywheel.getBurnHistory(),
      lpHistory: flywheel.getLPHistory(),
      config: flywheel.getConfig(),
      howItWorks: {
        step1: "x402 gateway collects UNY payments for API access",
        step2: "Facilitator confirms payment and records receipt",
        step3: "Revenue flows to the flywheel's pending pool",
        step4: "At threshold (100 UNY), flywheel executes a cycle",
        step5_burn: "40% of cycle revenue is permanently burned (deflationary)",
        step6_lp: "30% is added to UNY/USDF AMM pool (deepens liquidity)",
        step7_treasury: "20% goes to treasury reserve (protocol sustainability)",
        step8_staking: "10% distributed as staking rewards (validator incentives)",
      },
    });
  });

  // ── Genesis Provenance ─────────────────────────────────────

  app.get("/economics/genesis", async () => {
    const chain = provenance.generateProvenanceChain();
    const isValid = GenesisProvenance.verify(chain);

    return serializeState({
      description:
        "Cryptographic proof that UNY was purpose-built for the x402 payment infrastructure",
      provenance: chain,
      verification: {
        chainHashValid: isValid,
        seedHash: chain.genesis.seedHash,
        purposeHash: chain.genesis.purposeHash,
        componentCount: chain.infrastructure.length,
        crossChainLinks: chain.genesis.verificationLinks.length,
      },
      whyThisMatters: [
        "This provenance chain proves UNY was not an afterthought",
        "The token exists specifically for the x402 payment infrastructure",
        "Every infrastructure component is cryptographically linked to the genesis proof",
        "Cross-chain verification links to real Polygon, Avalanche, XRPL & Stellar contracts",
        "Constitutional invariants (15% max inflation, 20% min reserves) are coded into the protocol",
        "Anyone can verify this chain by checking the hashes against the deployed contracts",
      ],
    });
  });

  // ── Credibility Score ──────────────────────────────────────

  app.get("/economics/credibility", async () => {
    credibility.setAMMState(amm.getState());
    credibility.setFlywheelState(flywheel.getState());
    credibility.setProvenance(provenance.generateProvenanceChain());

    return serializeState({
      score: credibility.computeCredibilityScore(),
      fundamentals: credibility.computeFundamentals(),
      reserves: credibility.computeReserveAttestation(),
    });
  });

  // ── Token Fundamentals ─────────────────────────────────────

  app.get("/economics/fundamentals", async () => {
    credibility.setAMMState(amm.getState());
    credibility.setFlywheelState(flywheel.getState());

    return serializeState({
      fundamentals: credibility.computeFundamentals(),
      tokenContract: {
        symbol: "UNY",
        name: "UnyKorn Token",
        decimals: 18,
        standard: "ERC-20",
        chain: "Avalanche C-Chain (43114)",
        address: "0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
        features: ["Burnable", "Ownable", "1B fixed genesis supply"],
      },
      chains: {
        primary: {
          name: "UnyKorn L1",
          chainId: 7331,
          rpc: "https://rpc.l1.unykorn.org",
          consensus: "Trinity (Tendermint + BABE/GRANDPA + Snowman++)",
        },
        avalanche: {
          name: "Avalanche C-Chain",
          chainId: 43114,
          contract: "0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
          lp: "TraderJoe LB V2.1 (UNY/USDC, UNY/WAVAX)",
        },
      },
    });
  });

  // ── Reserve Attestation ────────────────────────────────────

  app.get("/economics/reserves", async () => {
    credibility.setAMMState(amm.getState());
    credibility.setFlywheelState(flywheel.getState());

    return serializeState({
      attestation: credibility.computeReserveAttestation(),
      constitutional: {
        minimumReserveRatio: "20%",
        maxInflationRate: "15% annual",
        enforced: true,
        source: "Genesis Sentience Protocol — Constitutional Invariants",
      },
    });
  });

  // ── Infrastructure Components ──────────────────────────────

  app.get("/economics/infrastructure", async () => {
    return serializeState({
      components: provenance.getInfrastructure(),
      count: provenance.getInfrastructure().length,
      categories: {
        services: provenance.getInfrastructure().filter((i) => i.type === "service").length,
        contracts: provenance.getInfrastructure().filter((i) => i.type === "contract").length,
        gateways: provenance.getInfrastructure().filter((i) => i.type === "gateway").length,
        amms: provenance.getInfrastructure().filter((i) => i.type === "amm").length,
        databases: provenance.getInfrastructure().filter((i) => i.type === "database").length,
        explorers: provenance.getInfrastructure().filter((i) => i.type === "explorer").length,
      },
    });
  });
}
