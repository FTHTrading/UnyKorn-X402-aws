/**
 * UNY Automated Market Maker — Constant-Product (x·y = k)
 *
 * Implements an on-chain-ready AMM for UNY price discovery.
 * This is the mechanism that connects x402 revenue to real UNY valuation.
 *
 * Architecture:
 *   - Constant-product pool on UnyKorn L1
 *   - 0.3% swap fee → split: 50% to LPs, 50% to protocol treasury
 *   - Price oracle from reserve ratio
 *   - LP tokens (UNY-LP) track proportional ownership
 *   - Protocol-owned liquidity on UnyKorn L1
 *
 * The AMM creates a real market for UNY:
 *   1. x402 payments generate UNY demand (users need UNY to pay invoices)
 *   2. Revenue from x402 fees flows into LP (deepening liquidity)
 *   3. Buy-and-burn from protocol fees creates deflationary pressure
 *   4. Deeper liquidity → lower slippage → more users → more fees → cycle
 */

// ── Types ──────────────────────────────────────────────────

export interface AMMState {
  /** UNY reserve in the pool */
  reserveUNY: bigint;
  /** USDF reserve in the pool */
  reserveUSDf: bigint;
  /** Invariant k = reserveUNY * reserveUSDf */
  k: bigint;
  /** Total LP tokens outstanding */
  totalLPShares: bigint;
  /** Current UNY price in USDF */
  priceUNY: number;
  /** Cumulative trading volume (USDF terms) */
  cumulativeVolumeUSDf: bigint;
  /** Total fees collected (USDF terms) */
  cumulativeFeesUSDf: bigint;
  /** Total UNY burned via protocol buyback */
  totalBurned: bigint;
  /** Pool creation timestamp */
  createdAt: string;
  /** Last trade timestamp */
  lastTradeAt: string | null;
}

export interface SwapResult {
  /** Direction of swap */
  direction: "UNY_TO_USDF" | "USDF_TO_UNY";
  /** Amount of input token */
  amountIn: bigint;
  /** Amount of output token received */
  amountOut: bigint;
  /** Fee taken in input token */
  fee: bigint;
  /** Price impact percentage */
  priceImpact: number;
  /** Effective price of this trade */
  effectivePrice: number;
  /** Pool price after this swap */
  newPrice: number;
  /** Timestamp */
  timestamp: string;
}

export interface LPPosition {
  /** Unique position ID */
  positionId: string;
  /** Provider address/identifier */
  provider: string;
  /** LP shares owned */
  shares: bigint;
  /** Share of total pool (0 to 1) */
  poolShare: number;
  /** UNY value of position at current price */
  valueUNY: bigint;
  /** USDF value of position at current price */
  valueUSDf: bigint;
  /** Unclaimed fees earned */
  unclaimedFeesUSDf: bigint;
  /** Deposit timestamp */
  depositedAt: string;
}

interface LPProviderState {
  shares: bigint;
  lastFeeCheckpoint: bigint; // cumulative fee per share at deposit
}

// ── Constants ──────────────────────────────────────────────

/** 0.3% swap fee in basis points */
const SWAP_FEE_BPS = 30n;
const BPS_DENOMINATOR = 10_000n;

/** Fee split: 50% to LPs, 50% to protocol */
const LP_FEE_SHARE_BPS = 5_000n;

/** Minimum liquidity locked forever (prevents division by zero) */
const MINIMUM_LIQUIDITY = 1000n;

/** UNY decimals */
const UNY_DECIMALS = 18n;

/** USDF decimals */
const USDF_DECIMALS = 6n;

/** Scaling factor for internal math */
const PRECISION = 10n ** 18n;

// ── AMM Implementation ─────────────────────────────────────

export class UnyAMM {
  private reserveUNY: bigint = 0n;
  private reserveUSDf: bigint = 0n;
  private totalLPShares: bigint = 0n;
  private providers: Map<string, LPProviderState> = new Map();
  private cumulativeVolumeUSDf: bigint = 0n;
  private cumulativeFeesUSDf: bigint = 0n;
  private cumulativeFeesPerShare: bigint = 0n;
  private protocolFees: bigint = 0n;
  private totalBurned: bigint = 0n;
  private createdAt: string;
  private lastTradeAt: string | null = null;

  constructor() {
    this.createdAt = new Date().toISOString();
  }

  // ── Pool Initialization ──────────────────────────────────

  /**
   * Initialize the pool with seed liquidity.
   * The initial price is determined by the ratio: priceUNY = amountUSDf / amountUNY
   *
   * Example: 10,000,000 UNY + 100,000 USDF → $0.01 per UNY
   * As x402 demand grows, price rises organically.
   */
  initializePool(
    amountUNY: bigint,
    amountUSDf: bigint,
    provider: string
  ): { shares: bigint; initialPrice: number } {
    if (this.totalLPShares > 0n) throw new Error("Pool already initialized");
    if (amountUNY <= 0n || amountUSDf <= 0n) throw new Error("Amounts must be positive");

    this.reserveUNY = amountUNY;
    this.reserveUSDf = amountUSDf;

    // Initial LP shares = sqrt(amountUNY * amountUSDf)
    const product = amountUNY * amountUSDf;
    const shares = sqrt(product);

    // Lock MINIMUM_LIQUIDITY shares permanently (like Uniswap V2)
    const providerShares = shares - MINIMUM_LIQUIDITY;
    this.totalLPShares = shares;

    this.providers.set(provider, {
      shares: providerShares,
      lastFeeCheckpoint: 0n,
    });

    const initialPrice = Number(amountUSDf) / Number(amountUNY);

    return { shares: providerShares, initialPrice };
  }

  // ── Swaps ────────────────────────────────────────────────

  /**
   * Swap UNY for USDF (selling UNY).
   * Applies 0.3% fee, updates reserves, returns output amount.
   */
  swapUNYforUSDf(amountIn: bigint): SwapResult {
    return this._swap(amountIn, "UNY_TO_USDF");
  }

  /**
   * Swap USDF for UNY (buying UNY).
   * This is what x402 payers do — buy UNY to pay invoices.
   */
  swapUSDfForUNY(amountIn: bigint): SwapResult {
    return this._swap(amountIn, "USDF_TO_UNY");
  }

  /**
   * Get a quote for a swap without executing it.
   */
  quote(
    amountIn: bigint,
    direction: "UNY_TO_USDF" | "USDF_TO_UNY"
  ): { amountOut: bigint; fee: bigint; priceImpact: number; effectivePrice: number } {
    const [reserveIn, reserveOut] =
      direction === "UNY_TO_USDF"
        ? [this.reserveUNY, this.reserveUSDf]
        : [this.reserveUSDf, this.reserveUNY];

    const fee = (amountIn * SWAP_FEE_BPS) / BPS_DENOMINATOR;
    const amountInAfterFee = amountIn - fee;

    // x * y = k → amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee)
    const amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);

    const priceBefore = Number(this.reserveUSDf) / Number(this.reserveUNY);
    const newReserveUNY =
      direction === "UNY_TO_USDF"
        ? this.reserveUNY + amountInAfterFee
        : this.reserveUNY - amountOut;
    const newReserveUSDf =
      direction === "UNY_TO_USDF"
        ? this.reserveUSDf - amountOut
        : this.reserveUSDf + amountInAfterFee;
    const priceAfter = Number(newReserveUSDf) / Number(newReserveUNY);
    const priceImpact = Math.abs((priceAfter - priceBefore) / priceBefore) * 100;

    const effectivePrice =
      direction === "UNY_TO_USDF"
        ? Number(amountOut) / Number(amountIn)
        : Number(amountIn) / Number(amountOut);

    return { amountOut, fee, priceImpact, effectivePrice };
  }

  // ── Liquidity ────────────────────────────────────────────

  /**
   * Add liquidity to the pool. Must add both tokens in current ratio.
   */
  addLiquidity(
    amountUNY: bigint,
    amountUSDf: bigint,
    provider: string,
    slippageBps: number = 50
  ): { shares: bigint; actualUNY: bigint; actualUSDf: bigint } {
    if (this.totalLPShares === 0n) throw new Error("Pool not initialized");

    // Calculate optimal amounts based on current ratio
    const optimalUSDf = (amountUNY * this.reserveUSDf) / this.reserveUNY;
    let actualUNY: bigint;
    let actualUSDf: bigint;

    if (optimalUSDf <= amountUSDf) {
      actualUNY = amountUNY;
      actualUSDf = optimalUSDf;
    } else {
      actualUNY = (amountUSDf * this.reserveUNY) / this.reserveUSDf;
      actualUSDf = amountUSDf;
    }

    // Slippage check
    const minUNY = (amountUNY * BigInt(10000 - slippageBps)) / 10000n;
    const minUSDf = (amountUSDf * BigInt(10000 - slippageBps)) / 10000n;
    if (actualUNY < minUNY || actualUSDf < minUSDf) {
      throw new Error("Slippage exceeds tolerance");
    }

    // Shares proportional to the smaller ratio
    const sharesFromUNY = (actualUNY * this.totalLPShares) / this.reserveUNY;
    const sharesFromUSDf = (actualUSDf * this.totalLPShares) / this.reserveUSDf;
    const shares = sharesFromUNY < sharesFromUSDf ? sharesFromUNY : sharesFromUSDf;

    this.reserveUNY += actualUNY;
    this.reserveUSDf += actualUSDf;
    this.totalLPShares += shares;

    // Update provider
    const existing = this.providers.get(provider);
    if (existing) {
      existing.shares += shares;
    } else {
      this.providers.set(provider, {
        shares,
        lastFeeCheckpoint: this.cumulativeFeesPerShare,
      });
    }

    return { shares, actualUNY, actualUSDf };
  }

  /**
   * Remove liquidity from the pool. Burns LP shares, returns proportional tokens.
   */
  removeLiquidity(
    shares: bigint,
    provider: string
  ): { amountUNY: bigint; amountUSDf: bigint; feesEarned: bigint } {
    const state = this.providers.get(provider);
    if (!state || state.shares < shares) throw new Error("Insufficient LP shares");

    // Calculate proportional amounts
    const amountUNY = (shares * this.reserveUNY) / this.totalLPShares;
    const amountUSDf = (shares * this.reserveUSDf) / this.totalLPShares;

    // Calculate fees earned
    const feeDelta = this.cumulativeFeesPerShare - state.lastFeeCheckpoint;
    const feesEarned = (state.shares * feeDelta) / PRECISION;

    // Update state
    this.reserveUNY -= amountUNY;
    this.reserveUSDf -= amountUSDf;
    this.totalLPShares -= shares;
    state.shares -= shares;
    state.lastFeeCheckpoint = this.cumulativeFeesPerShare;

    if (state.shares === 0n) {
      this.providers.delete(provider);
    }

    return { amountUNY, amountUSDf, feesEarned };
  }

  // ── Protocol Operations ──────────────────────────────────

  /**
   * Execute a protocol buyback-and-burn.
   * Uses accumulated protocol fees (USDF) to buy UNY and burn it.
   * This creates deflationary pressure directly from x402 revenue.
   */
  protocolBuybackAndBurn(): { unyBurned: bigint; usdfSpent: bigint; newPrice: number } {
    if (this.protocolFees === 0n) throw new Error("No protocol fees to burn");

    const usdfToSpend = this.protocolFees;
    this.protocolFees = 0n;

    // Buy UNY with protocol fees
    const fee = (usdfToSpend * SWAP_FEE_BPS) / BPS_DENOMINATOR;
    const usdfAfterFee = usdfToSpend - fee;
    const unyOut = (this.reserveUNY * usdfAfterFee) / (this.reserveUSDf + usdfAfterFee);

    this.reserveUSDf += usdfAfterFee;
    this.reserveUNY -= unyOut;
    this.totalBurned += unyOut;

    // UNY is burned — removed from circulation permanently
    const newPrice = Number(this.reserveUSDf) / Number(this.reserveUNY);

    return { unyBurned: unyOut, usdfSpent: usdfToSpend, newPrice };
  }

  /**
   * Deposit x402 revenue into the protocol fee pool.
   * Called by the Revenue Flywheel after collecting x402 payments.
   */
  depositRevenue(amountUSDf: bigint): void {
    this.protocolFees += amountUSDf;
  }

  // ── View State ───────────────────────────────────────────

  getState(): AMMState {
    return {
      reserveUNY: this.reserveUNY,
      reserveUSDf: this.reserveUSDf,
      k: this.reserveUNY * this.reserveUSDf,
      totalLPShares: this.totalLPShares,
      priceUNY:
        this.reserveUNY > 0n
          ? Number(this.reserveUSDf) / Number(this.reserveUNY)
          : 0,
      cumulativeVolumeUSDf: this.cumulativeVolumeUSDf,
      cumulativeFeesUSDf: this.cumulativeFeesUSDf,
      totalBurned: this.totalBurned,
      createdAt: this.createdAt,
      lastTradeAt: this.lastTradeAt,
    };
  }

  getPosition(provider: string): LPPosition | null {
    const state = this.providers.get(provider);
    if (!state) return null;

    const poolShare =
      this.totalLPShares > 0n
        ? Number(state.shares) / Number(this.totalLPShares)
        : 0;

    const valueUNY = this.totalLPShares > 0n
      ? (state.shares * this.reserveUNY) / this.totalLPShares
      : 0n;
    const valueUSDf = this.totalLPShares > 0n
      ? (state.shares * this.reserveUSDf) / this.totalLPShares
      : 0n;

    const feeDelta = this.cumulativeFeesPerShare - state.lastFeeCheckpoint;
    const unclaimedFeesUSDf = (state.shares * feeDelta) / PRECISION;

    return {
      positionId: `lp-${provider}`,
      provider,
      shares: state.shares,
      poolShare,
      valueUNY,
      valueUSDf,
      unclaimedFeesUSDf,
      depositedAt: this.createdAt,
    };
  }

  getProtocolFees(): bigint {
    return this.protocolFees;
  }

  // ── Internal ─────────────────────────────────────────────

  private _swap(amountIn: bigint, direction: "UNY_TO_USDF" | "USDF_TO_UNY"): SwapResult {
    if (amountIn <= 0n) throw new Error("Amount must be positive");
    if (this.totalLPShares === 0n) throw new Error("Pool not initialized");

    const [reserveIn, reserveOut] =
      direction === "UNY_TO_USDF"
        ? [this.reserveUNY, this.reserveUSDf]
        : [this.reserveUSDf, this.reserveUNY];

    const fee = (amountIn * SWAP_FEE_BPS) / BPS_DENOMINATOR;
    const amountInAfterFee = amountIn - fee;

    // Constant product: x * y = k
    const amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);
    if (amountOut >= reserveOut) throw new Error("Insufficient liquidity");

    // Price before
    const priceBefore = Number(this.reserveUSDf) / Number(this.reserveUNY);

    // Update reserves
    if (direction === "UNY_TO_USDF") {
      this.reserveUNY += amountInAfterFee;
      this.reserveUSDf -= amountOut;
    } else {
      this.reserveUSDf += amountInAfterFee;
      this.reserveUNY -= amountOut;
    }

    // Split fees: 50% to LPs (stays in pool), 50% to protocol
    const lpFee = (fee * LP_FEE_SHARE_BPS) / BPS_DENOMINATOR;
    const protocolFee = fee - lpFee;

    // Convert fee to USDF terms for tracking
    const feeInUSDf =
      direction === "UNY_TO_USDF"
        ? (fee * this.reserveUSDf) / this.reserveUNY
        : fee;

    this.cumulativeFeesUSDf += feeInUSDf;
    this.protocolFees += protocolFee;

    // Update cumulative fee per LP share
    if (this.totalLPShares > 0n) {
      this.cumulativeFeesPerShare += (feeInUSDf * PRECISION) / this.totalLPShares;
    }

    // Track volume in USDF terms
    const volumeUSDf =
      direction === "UNY_TO_USDF" ? amountOut : amountIn;
    this.cumulativeVolumeUSDf += volumeUSDf;

    // Price after
    const priceAfter = Number(this.reserveUSDf) / Number(this.reserveUNY);
    const priceImpact = Math.abs((priceAfter - priceBefore) / priceBefore) * 100;

    const effectivePrice =
      direction === "UNY_TO_USDF"
        ? Number(amountOut) / Number(amountIn)
        : Number(amountIn) / Number(amountOut);

    this.lastTradeAt = new Date().toISOString();

    return {
      direction,
      amountIn,
      amountOut,
      fee,
      priceImpact,
      effectivePrice,
      newPrice: priceAfter,
      timestamp: this.lastTradeAt,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────

/** Integer square root (Babylonian method) */
function sqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("Negative input");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}
