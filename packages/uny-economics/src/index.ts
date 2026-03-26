/**
 * UNY Economics Engine — Public API
 *
 * This module ties together:
 *  1. AMM (Automated Market Maker) — constant-product UNY/USDF pool
 *  2. LP (Liquidity Pool) — deposit/withdraw, fee accrual, reserves
 *  3. Genesis Provenance — cryptographic proof UNY was purpose-built
 *  4. Revenue Flywheel — x402 fees → buy-and-burn + LP provision
 *  5. Credibility Layer — reserve ratios, burn stats, provenance chain
 */

export { UnyAMM, type AMMState, type SwapResult, type LPPosition } from "./amm";
export {
  GenesisProvenance,
  type GenesisProof,
  type ProvenanceChain,
  type InfrastructureLink,
} from "./genesis";
export {
  RevenueFlywheel,
  type FlywheelConfig,
  type FlywheelState,
  type BurnRecord,
  type LPProvisionRecord,
} from "./flywheel";
export {
  CredibilityLayer,
  type CredibilityScore,
  type ReserveAttestation,
  type TokenFundamentals,
} from "./credibility";
export { createEconomicsRoutes } from "./routes";
