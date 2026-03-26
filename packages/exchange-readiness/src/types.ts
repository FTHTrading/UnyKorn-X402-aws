/**
 * Exchange Readiness OS — Core Type System
 *
 * Seven-layer data model covering everything a top-tier exchange
 * (Coinbase, Kraken, Binance, OKX) evaluates during listing review:
 *
 *   Layer 1 — Issuer Entity : Who is behind this token?
 *   Layer 2 — Token Truth   : Supply, vesting, admin powers, contract facts
 *   Layer 3 — Exchange Integration : Packets, wallet params, deposit/withdraw
 *   Layer 4 — Security Assurance : Audits, bug bounty, incident history
 *   Layer 5 — Market Structure : Liquidity, market makers, float
 *   Layer 6 — Operations : Status, uptime, incident response, support
 *   Layer 7 — Application Automation : Per-exchange packet generation
 */

// ════════════════════════════════════════════════════════════
// LAYER 1 — ISSUER ENTITY
// ════════════════════════════════════════════════════════════

export interface IssuerEntity {
  /** Legal entity name */
  legalName: string;
  /** Doing-business-as name */
  dba: string;
  /** Entity type: LLC, Ltd, Foundation, DAO, etc. */
  entityType: string;
  /** Jurisdiction of incorporation/registration */
  jurisdiction: string;
  /** Registration / company number */
  registrationNumber: string | null;
  /** Registered agent or address */
  registeredAddress: string | null;
  /** Date of entity formation */
  formationDate: string;
  /** Key persons (legally required for exchange compliance) */
  keyPersons: KeyPerson[];
  /** Legal counsel on record */
  legalCounsel: LegalCounsel | null;
  /** Token classification analysis */
  tokenClassification: TokenClassification | null;
  /** Jurisdictional restrictions */
  restrictedJurisdictions: string[];
  /** Regulatory filings or exemptions */
  regulatoryFilings: RegulatoryFiling[];
  /** Last updated */
  updatedAt: string;
}

export interface KeyPerson {
  name: string;
  role: string;
  publicProfile: string | null;
  kycVerified: boolean;
}

export interface LegalCounsel {
  firmName: string;
  jurisdiction: string;
  engagementScope: string;
  contactEmail: string | null;
}

export interface TokenClassification {
  classification: "utility" | "consumptive" | "access" | "security" | "unclassified";
  basis: string;
  jurisdiction: string;
  analysisDate: string | null;
  counselOpinion: boolean;
  /** Link to legal memo if available */
  memoUrl: string | null;
}

export interface RegulatoryFiling {
  jurisdiction: string;
  filingType: string;
  status: "filed" | "approved" | "pending" | "not-required" | "planned";
  date: string | null;
  reference: string | null;
}

// ════════════════════════════════════════════════════════════
// LAYER 2 — TOKEN TRUTH (Supply, Vesting, Admin Powers, Contract)
// ════════════════════════════════════════════════════════════

export interface TokenRegistry {
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Decimal places */
  decimals: number;
  /** Standard (Native L1, ERC-20, etc.) */
  standard: string;
  /** Chain ID */
  chainId: number;
  /** Chain name */
  chainName: string;
  /** Contract address (or "native" for native gas token) */
  contractAddress: string;
  /** Genesis / creation date */
  genesisDate: string;
  /** Logo URI */
  logoUri: string;
  /** Is the contract upgradeable? */
  isUpgradeable: boolean;
  /** Does a proxy pattern exist? */
  hasProxy: boolean;
  /** Contract verification status */
  contractVerified: boolean;
  /** OpenZeppelin base version (if applicable) */
  openzeppelinVersion: string | null;
  /** Deployment transaction hash */
  deploymentTxHash: string | null;
}

export interface SupplySnapshot {
  /** Timestamp of this snapshot */
  timestamp: string;
  /** Total supply (all minted tokens) */
  totalSupply: string;
  /** Max supply (cap) */
  maxSupply: string;
  /** Circulating supply (total - locked - vesting - treasury) */
  circulatingSupply: string;
  /** Locked supply (not circulating, not vesting) */
  lockedSupply: string;
  /** Treasury-held supply */
  treasurySupply: string;
  /** Burned supply */
  burnedSupply: string;
  /** Staked supply */
  stakedSupply: string;
  /** LP pool supply */
  lpSupply: string;
  /** Supply verification method */
  verificationMethod: "on-chain" | "self-attested" | "audited";
  /** Block height at snapshot (if on-chain) */
  blockHeight: number | null;
}

export interface VestingSchedule {
  /** Vesting schedule ID */
  id: string;
  /** Beneficiary label (e.g., "Team", "Ecosystem Fund") */
  beneficiary: string;
  /** Total tokens in this vesting schedule */
  totalAmount: string;
  /** Already released tokens */
  releasedAmount: string;
  /** Remaining locked tokens */
  remainingAmount: string;
  /** Cliff date */
  cliffDate: string;
  /** Vesting start date */
  vestingStart: string;
  /** Vesting end date */
  vestingEnd: string;
  /** Vesting type */
  vestingType: "linear" | "cliff-then-linear" | "milestone" | "manual";
  /** Release frequency */
  releaseFrequency: "monthly" | "quarterly" | "annual" | "one-time" | "continuous";
  /** Is this enforced by a smart contract? */
  contractEnforced: boolean;
  /** Contract address (if enforced) */
  contractAddress: string | null;
  /** Current status */
  status: "not-started" | "in-cliff" | "vesting" | "fully-vested";
}

export interface AdminPower {
  /** Power identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description */
  description: string;
  /** Does this power exist in the contract/system? */
  exists: boolean;
  /** Who holds this power */
  holder: string;
  /** How is this power exercised? */
  controlMethod: string;
  /** Risk level */
  riskLevel: "critical" | "high" | "medium" | "low" | "none";
  /** Planned mitigation */
  plannedMitigation: string | null;
  /** Mitigation status */
  mitigationStatus: "implemented" | "in-progress" | "planned" | "not-planned";
  /** Relevant for exchange: can this rug users? */
  canRugUsers: boolean;
}

export interface TreasuryWallet {
  /** Wallet label */
  label: string;
  /** Chain */
  chain: string;
  /** Address */
  address: string;
  /** Balance (UNY) */
  balanceUNY: string;
  /** Balance (USD estimate) */
  balanceUSD: string;
  /** Purpose */
  purpose: string;
  /** Governance: who controls this */
  controller: string;
  /** Multi-sig? */
  isMultiSig: boolean;
  /** Signers count (if multi-sig) */
  signerCount: number | null;
  /** Threshold (if multi-sig) */
  threshold: number | null;
  /** Last verified */
  lastVerified: string;
}

// ════════════════════════════════════════════════════════════
// LAYER 3 — EXCHANGE INTEGRATION
// ════════════════════════════════════════════════════════════

export interface ExchangePacket {
  /** Target exchange */
  exchange: string;
  /** Packet version */
  version: string;
  /** Generated at */
  generatedAt: string;
  /** Issuer entity snapshot */
  issuer: IssuerEntity;
  /** Token registry */
  token: TokenRegistry;
  /** Current supply snapshot */
  supply: SupplySnapshot;
  /** All vesting schedules */
  vesting: VestingSchedule[];
  /** Treasury wallets */
  treasuryWallets: TreasuryWallet[];
  /** Admin powers disclosure */
  adminPowers: AdminPower[];
  /** Security posture */
  security: SecurityPosture;
  /** Network ops snapshot */
  networkOps: NetworkOpsSnapshot;
  /** Market structure info */
  marketStructure: MarketStructure;
  /** Wallet integration parameters */
  walletIntegration: WalletIntegrationParams;
  /** Exchange-specific fields */
  exchangeSpecific: Record<string, unknown>;
  /** Risk flags (auto-generated) */
  riskFlags: RiskFlag[];
  /** Completeness score (0-100) */
  completenessScore: number;
}

export interface WalletIntegrationParams {
  /** Chain name */
  chainName: string;
  /** Chain ID */
  chainId: number;
  /** Native currency symbol */
  nativeCurrency: string;
  /** Decimals */
  decimals: number;
  /** RPC URL (for exchange node) */
  rpcUrl: string | null;
  /** WebSocket URL */
  wsUrl: string | null;
  /** Block time (seconds) */
  blockTime: number;
  /** Recommended confirmations for deposit */
  confirmationsDeposit: number;
  /** Recommended confirmations for withdrawal */
  confirmationsWithdraw: number;
  /** Address format / regex */
  addressFormat: string;
  /** Memo/tag required? */
  memoRequired: boolean;
  /** Contract ABI (if applicable) */
  contractAbi: string | null;
  /** Explorer base URL */
  explorerBaseUrl: string;
  /** Explorer TX URL template */
  explorerTxUrl: string;
  /** Explorer address URL template */
  explorerAddressUrl: string;
  /** Testnet available? */
  testnetAvailable: boolean;
  /** Testnet RPC URL */
  testnetRpcUrl: string | null;
  /** Integration documentation URL */
  integrationDocsUrl: string | null;
}

// ════════════════════════════════════════════════════════════
// LAYER 4 — SECURITY ASSURANCE
// ════════════════════════════════════════════════════════════

export interface SecurityPosture {
  /** Smart contract audits */
  audits: AuditRecord[];
  /** Bug bounty program */
  bugBounty: BugBountyProgram | null;
  /** Penetration tests */
  penTests: PenTestRecord[];
  /** Incident history */
  incidents: IncidentRecord[];
  /** Security contact */
  securityContact: string;
  /** Responsible disclosure policy URL */
  disclosurePolicyUrl: string | null;
  /** Overall security score (0-100, self-assessed) */
  selfAssessedScore: number;
}

export interface AuditRecord {
  /** Auditor firm name */
  auditor: string;
  /** Scope of audit */
  scope: string;
  /** Date completed */
  dateCompleted: string | null;
  /** Status */
  status: "completed" | "in-progress" | "planned" | "not-started";
  /** Report URL (public) */
  reportUrl: string | null;
  /** Findings summary */
  findingsSummary: string | null;
  /** Critical findings count */
  criticalFindings: number;
  /** High findings count */
  highFindings: number;
  /** Medium findings count */
  mediumFindings: number;
  /** All findings resolved? */
  allResolved: boolean;
}

export interface BugBountyProgram {
  /** Platform (Immunefi, HackerOne, etc.) */
  platform: string;
  /** Program URL */
  programUrl: string | null;
  /** Max bounty USD */
  maxBountyUsd: number;
  /** Status */
  status: "active" | "planned" | "inactive";
  /** Scope */
  scope: string;
  /** Launch date */
  launchDate: string | null;
}

export interface PenTestRecord {
  /** Testing firm */
  firm: string;
  /** Scope */
  scope: string;
  /** Date */
  date: string | null;
  /** Status */
  status: "completed" | "in-progress" | "planned";
  /** Report available? */
  reportAvailable: boolean;
}

export interface IncidentRecord {
  /** Incident date */
  date: string;
  /** Severity */
  severity: "critical" | "high" | "medium" | "low";
  /** Description */
  description: string;
  /** Resolution */
  resolution: string;
  /** Post-mortem URL */
  postMortemUrl: string | null;
  /** Funds lost (USD) */
  fundsLostUsd: number;
}

// ════════════════════════════════════════════════════════════
// LAYER 5 — MARKET STRUCTURE
// ════════════════════════════════════════════════════════════

export interface MarketStructure {
  /** Market maker arrangement */
  marketMaker: MarketMakerInfo | null;
  /** Initial float (tokens available at listing) */
  initialFloat: string;
  /** Initial float as percentage of total supply */
  initialFloatPercent: number;
  /** Target market cap at listing (USD) */
  targetMarketCapUsd: string | null;
  /** Liquidity strategy */
  liquidityStrategy: string;
  /** Existing DEX liquidity */
  dexLiquidity: DexLiquidityInfo[];
  /** Proposed trading pairs */
  proposedPairs: string[];
  /** Anti-manipulation measures */
  antiManipulation: string[];
}

export interface MarketMakerInfo {
  /** Firm name */
  firm: string;
  /** Agreement status */
  status: "signed" | "in-negotiation" | "planned" | "not-started";
  /** Agreement date */
  agreementDate: string | null;
  /** Pairs covered */
  pairsCovered: string[];
  /** Markets covered (exchanges) */
  marketsCovered: string[];
}

export interface DexLiquidityInfo {
  /** DEX name */
  dex: string;
  /** Chain */
  chain: string;
  /** Pool address */
  poolAddress: string;
  /** Total liquidity (USD) */
  totalLiquidityUsd: string;
  /** Pair */
  pair: string;
}

// ════════════════════════════════════════════════════════════
// LAYER 6 — OPERATIONS (Network, Uptime, Incident Response)
// ════════════════════════════════════════════════════════════

export interface NetworkOpsSnapshot {
  /** Network name */
  network: string;
  /** Chain ID */
  chainId: number;
  /** Status */
  status: "operational" | "degraded" | "outage" | "maintenance";
  /** Current block height */
  blockHeight: number;
  /** Block time (current average, seconds) */
  blockTimeSeconds: number;
  /** TPS (current) */
  currentTps: number;
  /** Peak TPS (observed) */
  peakTps: number;
  /** Active validators */
  activeValidators: number;
  /** Total validators */
  totalValidators: number;
  /** Uptime (last 30 days, percentage) */
  uptimeLast30d: number;
  /** Status page URL */
  statusPageUrl: string | null;
  /** Incident count (last 90 days) */
  incidentCount90d: number;
  /** Last incident date */
  lastIncidentDate: string | null;
  /** SLA targets */
  slaTargets: SlaTarget[];
  /** Snapshot timestamp */
  timestamp: string;
}

export interface SlaTarget {
  /** Metric name */
  metric: string;
  /** Target value */
  target: string;
  /** Current value */
  current: string;
  /** Meeting target? */
  met: boolean;
}

export interface IncidentResponsePlan {
  /** Version */
  version: string;
  /** Last updated */
  updatedAt: string;
  /** Severity levels */
  severityLevels: SeverityLevel[];
  /** Escalation contacts */
  escalationContacts: EscalationContact[];
  /** Communication channels */
  communicationChannels: string[];
  /** Post-mortem policy */
  postMortemPolicy: string;
}

export interface SeverityLevel {
  level: "SEV1" | "SEV2" | "SEV3" | "SEV4";
  description: string;
  responseTime: string;
  notifyExchanges: boolean;
}

export interface EscalationContact {
  role: string;
  name: string;
  email: string;
  responseTime: string;
}

// ════════════════════════════════════════════════════════════
// LAYER 7 — RISK FLAGS & VALIDATION
// ════════════════════════════════════════════════════════════

export type RiskSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface RiskFlag {
  /** Flag ID */
  id: string;
  /** Category */
  category: "legal" | "security" | "technical" | "market" | "operational" | "governance";
  /** Severity */
  severity: RiskSeverity;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** What exchanges will ask */
  exchangeQuestion: string;
  /** Current answer */
  currentAnswer: string;
  /** Mitigation plan */
  mitigation: string;
  /** Mitigation status */
  mitigationStatus: "resolved" | "in-progress" | "planned" | "accepted" | "not-planned";
  /** Expected resolution date */
  expectedResolution: string | null;
  /** Auto-detected or manual */
  source: "auto" | "manual";
}

export interface ReadinessScore {
  /** Overall score (0-100) */
  overall: number;
  /** Per-category scores */
  categories: Record<string, CategoryScore>;
  /** Per-exchange scores */
  exchanges: Record<string, ExchangeScore>;
  /** Computed at */
  computedAt: string;
  /** Version of scoring model */
  scoringModel: string;
}

export interface CategoryScore {
  score: number;
  maxScore: number;
  weight: number;
  items: ScoreItem[];
}

export interface ScoreItem {
  name: string;
  score: number;
  maxScore: number;
  status: "pass" | "partial" | "fail" | "not-applicable";
  details: string;
}

export interface ExchangeScore {
  exchange: string;
  score: number;
  status: "ready" | "nearly-ready" | "in-progress" | "not-ready";
  blockers: string[];
  recommendations: string[];
}

// ════════════════════════════════════════════════════════════
// COMPOSITE — Full Exchange Readiness State
// ════════════════════════════════════════════════════════════

export interface ExchangeReadinessState {
  /** Schema version */
  schemaVersion: string;
  /** Last updated */
  updatedAt: string;
  /** Issuer entity (Layer 1) */
  issuer: IssuerEntity;
  /** Token registry (Layer 2) */
  token: TokenRegistry;
  /** Current supply snapshot (Layer 2) */
  supply: SupplySnapshot;
  /** Vesting schedules (Layer 2) */
  vesting: VestingSchedule[];
  /** Treasury wallets (Layer 2) */
  treasuryWallets: TreasuryWallet[];
  /** Admin powers (Layer 2) */
  adminPowers: AdminPower[];
  /** Security posture (Layer 4) */
  security: SecurityPosture;
  /** Market structure (Layer 5) */
  marketStructure: MarketStructure;
  /** Network ops (Layer 6) */
  networkOps: NetworkOpsSnapshot;
  /** Incident response plan (Layer 6) */
  incidentResponse: IncidentResponsePlan;
  /** Readiness scores (Layer 7) */
  readiness: ReadinessScore;
  /** Risk flags (Layer 7) */
  riskFlags: RiskFlag[];
  /** Wallet integration params (Layer 3) */
  walletIntegration: WalletIntegrationParams;
}
