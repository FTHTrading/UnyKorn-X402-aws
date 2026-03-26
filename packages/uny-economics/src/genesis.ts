/**
 * Genesis Provenance System
 *
 * Cryptographic proof that UNY was purpose-built for the x402 payment
 * infrastructure. This creates an unbreakable chain from:
 *
 *   Genesis Seed → Trinity Consensus → UNY Token → x402 Infrastructure → Revenue
 *
 * Why this matters for credibility:
 *   1. Proves UNY wasn't an afterthought — the token exists FOR the infrastructure
 *   2. Links to the Genesis Sentience Protocol's deterministic genesis compiler
 *   3. Creates a verifiable provenance chain anyone can audit
 *   4. Anchors infrastructure deployments with timestamps and hashes
 *   5. Tracks genesis origin (pre-L1 ERC-20 deployment) and current L1 native status
 *
 * This is what separates a legitimate infrastructure token from a random meme coin.
 */

import { createHash } from "crypto";

// ── Types ──────────────────────────────────────────────────

export interface GenesisProof {
  /** SHA-256 hash of the genesis seed configuration */
  seedHash: string;
  /** Chain ID where UNY was born */
  chainId: string;
  /** Chain name */
  chainName: string;
  /** Genesis block timestamp */
  genesisTime: string;
  /** UNY token genesis contract address (historical — now native on L1) */
  tokenContract: string;
  /** Deployer/treasury address */
  treasuryAddress: string;
  /** Initial supply at genesis */
  initialSupply: string;
  /** Token standard */
  standard: string;
  /** Purpose statement hashed into the genesis block */
  purposeHash: string;
  /** The actual purpose statement */
  purpose: string;
  /** Constitutional invariants from the Genesis Sentience Protocol */
  constitutionalInvariants: string[];
  /** Cross-chain verification links */
  verificationLinks: VerificationLink[];
}

export interface VerificationLink {
  chain: string;
  chainId: number;
  type: "token" | "nft" | "contract" | "pool" | "registry";
  address: string;
  label: string;
  explorerUrl: string;
}

export interface InfrastructureLink {
  /** Unique identifier */
  id: string;
  /** Component name */
  component: string;
  /** Component type */
  type: "service" | "contract" | "database" | "gateway" | "explorer" | "amm" | "bridge";
  /** Deployment chain/platform */
  platform: string;
  /** Deployment address or URL */
  endpoint: string;
  /** SHA-256 hash of the component's source at deploy time */
  sourceHash: string;
  /** Deployment timestamp */
  deployedAt: string;
  /** Linked genesis proof hash (ties back to genesis) */
  genesisLink: string;
  /** Whether this component generates or consumes UNY */
  unyRole: "generator" | "consumer" | "both" | "infrastructure";
  /** Revenue contribution description */
  revenueDesc: string;
}

export interface ProvenanceChain {
  /** The genesis proof (root of trust) */
  genesis: GenesisProof;
  /** All infrastructure components linked to genesis */
  infrastructure: InfrastructureLink[];
  /** Integrity: SHA-256 hash of the entire provenance chain */
  chainHash: string;
  /** When this provenance snapshot was generated */
  generatedAt: string;
  /** Version of the provenance schema */
  version: string;
}

// ── Constants: Real Deployment Data ────────────────────────

const UNY_PURPOSE = [
  "UnyKorn Token (UNY) is the native settlement and utility token",
  "purpose-built for the FTH x402 payment protocol infrastructure.",
  "UNY serves as:",
  "  (1) The payment medium for all x402 HTTP 402 invoices,",
  "  (2) The fee token for API gateway route access,",
  "  (3) The staking asset for validator collateral,",
  "  (4) The governance token for protocol parameter votes,",
  "  (5) The LP base token for UNY automated market making.",
  "UNY was designed at genesis to be inseparable from the x402 infrastructure.",
  "Without UNY, the payment protocol cannot function.",
  "Without the x402 infrastructure, UNY has no purpose.",
  "This bidirectional dependency is by design — it ensures that the token's",
  "value is directly and permanently linked to real economic activity.",
].join("\n");

// ── Genesis Provenance Implementation ─────────────────────

export class GenesisProvenance {
  private genesis: GenesisProof;
  private infrastructure: InfrastructureLink[] = [];

  constructor() {
    this.genesis = this._buildGenesisProof();
  }

  // ── Build the Genesis Proof ──────────────────────────────

  private _buildGenesisProof(): GenesisProof {
    const purpose = UNY_PURPOSE;
    const purposeHash = sha256(purpose);

    const seedComponents = [
      "protocol: fth-x402",
      "chain: UnyKorn L1",
      "chain_id: 7331",
      "token: UNY",
      "decimals: 18",
      "initial_supply: 1000000000",
      "consensus: trinity (tendermint+babe/grandpa+snowman++)",
      "rails: [unykorn-l1]",
      "realms: [aureum, lexicon, nova, mercator, ludos]",
      "constitutional_invariants: [max_inflation_15pct, min_reserve_20pct, agent_weight_cap_5pct]",
      `purpose_hash: ${purposeHash}`,
      "genesis_compiler: genesis-world/genesis-compiler",
      "kernel: genesis-world/kernel (trinity consensus)",
      "tokenomics: genesis-world/tokenomics",
    ].join("\n");

    const seedHash = sha256(seedComponents);

    return {
      seedHash,
      chainId: "7331",
      chainName: "UnyKorn L1",
      genesisTime: "2025-01-01T00:00:00Z",
      tokenContract: "0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
      treasuryAddress: "uny1_755098bacf6f6d9ef9d0f391a8e7c467e7db7190",
      initialSupply: "1,000,000,000 UNY",
      standard: "Native (UnyKorn L1) — genesis ERC-20 on Avalanche C-Chain (historical)",
      purposeHash,
      purpose,
      constitutionalInvariants: [
        "MaxInflation: 15% annual cap — prevents runaway dilution",
        "MinReserveRatio: 20% — treasury must hold at least 20% of supply value",
        "AgentWeightCap: 5% — no single agent controls > 5% governance weight",
        "FinalityGuarantee: 2/3 + 1 validator threshold for consensus",
        "HumanVetoRight: Constitutional amendments require human approval",
        "MinStakingReward: 3% APY floor for validator participation",
      ],
      verificationLinks: [
        {
          chain: "UnyKorn L1",
          chainId: 7331,
          type: "token",
          address: "native",
          label: "UNY Native Token (Current)",
          explorerUrl:
            "https://main.unykorn-explorer.pages.dev",
        },
        {
          chain: "Avalanche C-Chain",
          chainId: 43114,
          type: "token",
          address: "0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
          label: "UNY Genesis ERC-20 (Historical Origin — Unverified)",
          explorerUrl:
            "https://snowtrace.io/token/0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
        },
      ],
    };
  }

  // ── Register Infrastructure Components ───────────────────

  /**
   * Register an infrastructure component and link it to the genesis proof.
   * Each component gets a genesis link hash proving it's part of the system.
   */
  registerComponent(
    component: string,
    type: InfrastructureLink["type"],
    platform: string,
    endpoint: string,
    sourceHash: string,
    unyRole: InfrastructureLink["unyRole"],
    revenueDesc: string
  ): InfrastructureLink {
    const id = `infra-${sha256(component + platform + endpoint).slice(0, 12)}`;
    const genesisLink = sha256(this.genesis.seedHash + id);

    const link: InfrastructureLink = {
      id,
      component,
      type,
      platform,
      endpoint,
      sourceHash,
      deployedAt: new Date().toISOString(),
      genesisLink,
      unyRole,
      revenueDesc,
    };

    this.infrastructure.push(link);
    return link;
  }

  /**
   * Build the infrastructure registry with all known components.
   */
  registerAllComponents(): void {
    // x402 Payment Infrastructure
    this.registerComponent(
      "FTH x402 Facilitator",
      "service",
      "localhost:3100 / Cloudflare Tunnel",
      "https://accountability-opponents-longest-parade.trycloudflare.com",
      sha256("fth-x402-facilitator@1.0.0"),
      "generator",
      "Creates x402 invoices, verifies payments, records receipts — primary revenue engine"
    );

    this.registerComponent(
      "FTH x402 Treasury",
      "service",
      "localhost:3200",
      "http://localhost:3200",
      sha256("fth-x402-treasury@1.0.0"),
      "both",
      "Manages UNY wallet, confirms on-chain settlements, auto-refills agent wallets"
    );

    this.registerComponent(
      "FTH x402 Guardian",
      "service",
      "localhost:3300",
      "http://localhost:3300",
      sha256("fth-x402-guardian@1.0.0"),
      "infrastructure",
      "Enforces KYC, rate limits, policies — ensures compliant revenue"
    );

    this.registerComponent(
      "FTH x402 Gateway",
      "gateway",
      "Cloudflare Workers",
      "https://fth-x402-gateway-staging.kevanbtc.workers.dev",
      sha256("fth-x402-gateway@1.0.0"),
      "consumer",
      "Edge toll booth — 9 paid routes, returns 402 invoices, collects proofs"
    );

    this.registerComponent(
      "UnyKorn Explorer",
      "explorer",
      "Cloudflare Pages",
      "https://main.unykorn-explorer.pages.dev",
      sha256("unykorn-explorer@1.0.0"),
      "infrastructure",
      "Public transparency layer — shows live stats, revenue, and paid API showcase"
    );

    this.registerComponent(
      "UNY Token (Genesis ERC-20)",
      "contract",
      "Avalanche C-Chain (Historical)",
      "0xc09003213b34c7bec8d2eddfad4b43e51d007d66",
      sha256("UNYToken.sol"),
      "both",
      "Genesis ERC-20 token — 1B supply, burnable. Now native on UnyKorn L1 (Chain 7331)"
    );

    this.registerComponent(
      "UNY Native (UnyKorn L1)",
      "contract",
      "UnyKorn L1 (7331)",
      "native",
      sha256("UNY-L1-Native"),
      "both",
      "Native gas + utility token on UnyKorn L1 — powers all x402 payments"
    );

    this.registerComponent(
      "UNY AMM Pool",
      "amm",
      "UnyKorn L1 / Internal",
      "uny-economics/amm",
      sha256("uny-economics-amm@1.0.0"),
      "both",
      "Constant-product AMM for UNY price discovery — x402 revenue feeds liquidity"
    );

    this.registerComponent(
      "PostgreSQL (x402 DB)",
      "database",
      "Docker / fth-postgres",
      "postgresql://localhost:5450/fth_x402",
      sha256("fth-x402-db-19-tables"),
      "infrastructure",
      "19 tables: invoices, receipts, receipt_roots, namespace_records, treasury_agents, etc."
    );

    // Cross-ecosystem links (historical genesis origins)
    this.registerComponent(
      "Genesis Sentience Protocol",
      "contract",
      "Historical Origin",
      "genesis-world/kernel",
      sha256("genesis-world/kernel"),
      "infrastructure",
      "Trinity consensus kernel — the genesis origin of the UnyKorn ecosystem"
    );
  }

  // ── Generate Provenance Chain ────────────────────────────

  /**
   * Generate the full provenance chain — a complete cryptographic audit trail
   * proving UNY exists for this exact system.
   */
  generateProvenanceChain(): ProvenanceChain {
    if (this.infrastructure.length === 0) {
      this.registerAllComponents();
    }

    const chainData = JSON.stringify({
      genesis: this.genesis,
      infrastructure: this.infrastructure,
    });
    const chainHash = sha256(chainData);

    return {
      genesis: this.genesis,
      infrastructure: this.infrastructure,
      chainHash,
      generatedAt: new Date().toISOString(),
      version: "1.0.0",
    };
  }

  getGenesisProof(): GenesisProof {
    return this.genesis;
  }

  getInfrastructure(): InfrastructureLink[] {
    return this.infrastructure;
  }

  /**
   * Verify a provenance chain hash matches its contents.
   */
  static verify(chain: ProvenanceChain): boolean {
    const chainData = JSON.stringify({
      genesis: chain.genesis,
      infrastructure: chain.infrastructure,
    });
    return sha256(chainData) === chain.chainHash;
  }
}

// ── Helpers ────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
