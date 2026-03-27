const EXCHANGE_API_BASE = "https://api.unykorn.org/exchange/v1";

// ── Types ────────────────────────────────────────────────────

export interface TradingPair {
  id: string;
  base: string;
  quote: string;
  minOrder: string;
  tickSize: string;
  lotSize: string;
}

export interface Ticker {
  pair: string;
  lastPrice: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  change24h: string;
  changePercent24h: string;
  bid: string;
  ask: string;
  timestamp: string;
}

export interface OrderBookLevel {
  price: string;
  amount: string;
}

export interface OrderBook {
  pair: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: string;
  timestamp: string;
}

export interface ExchangeOrder {
  id: string;
  wallet: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  pair: string;
  price: string;
  amount: string;
  filled: string;
  remaining: string;
  status: "open" | "filled" | "partial" | "cancelled" | "expired";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface Trade {
  id: string;
  pair: string;
  price: string;
  amount: string;
  total: string;
  buyerWallet: string;
  sellerWallet: string;
  createdAt: string;
}

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSummary {
  currentPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
  marketCap: number;
  circulatingSupply: number;
  totalSupply: number;
  pairs: number;
  timestamp: string;
}

export interface PortfolioSummary {
  wallet: string;
  holdings: { asset: string; balance: string; valueUsd: string }[];
  totalValueUsd: string;
  totalUnyHeld: string;
  allocations: number;
  averageBuyPrice: string;
  unrealizedPnl: string;
  unrealizedPnlPct: string;
  vestingLocked: string;
  vestingClaimable: string;
  referralBonus: string;
}

export interface VestingTranche {
  id: string;
  amount: string;
  unlockAt: string;
  status: "locked" | "claimable" | "claimed";
  claimedAt?: string;
}

export interface VestingSchedule {
  id: string;
  wallet: string;
  allocationId: string;
  totalUny: string;
  claimedUny: string;
  tranches: VestingTranche[];
  createdAt: string;
}

export interface ReferralRecord {
  code: string;
  ownerWallet: string;
  referrals: string[];
  totalBonus: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  createdAt: string;
}

export interface Leaderboard {
  topHolders: { rank: number; wallet: string; balance: string; pct: string }[];
  topReferrers: { rank: number; code: string; referrals: number; bonus: string; tier: string }[];
  recentTrades: Trade[];
  timestamp: string;
}

// ── API Functions ────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${EXCHANGE_API_BASE}${path}`, init);
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`);
  return data;
}

export async function getPairs(): Promise<TradingPair[]> {
  const data = await apiFetch<{ pairs: TradingPair[] }>("/pairs");
  return data.pairs;
}

export async function getTicker(): Promise<Ticker[]> {
  const data = await apiFetch<{ tickers: Ticker[] }>("/ticker");
  return data.tickers;
}

export async function getOrderBook(pair = "UNY/USDF"): Promise<OrderBook> {
  return apiFetch<OrderBook>(`/orderbook?pair=${encodeURIComponent(pair)}`);
}

export async function getRecentTrades(pair = "UNY/USDF"): Promise<Trade[]> {
  const data = await apiFetch<{ trades: Trade[] }>(`/trades?pair=${encodeURIComponent(pair)}`);
  return data.trades;
}

export async function getOHLCV(pair = "UNY/USDF", interval = "1h"): Promise<OHLCV[]> {
  const data = await apiFetch<{ candles: OHLCV[] }>(`/ohlcv?pair=${encodeURIComponent(pair)}&interval=${interval}`);
  return data.candles;
}

export async function getMarketSummary(): Promise<MarketSummary> {
  return apiFetch<MarketSummary>("/market-summary");
}

export async function placeOrder(wallet: string, side: "buy" | "sell", pair: string, price: number, amount: number, type: "limit" | "market" = "limit") {
  return apiFetch<{ order: ExchangeOrder; matched: number; trades: Trade[] }>("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, side, pair, price, amount, type }),
  });
}

export async function getWalletOrders(wallet: string): Promise<ExchangeOrder[]> {
  const data = await apiFetch<{ orders: ExchangeOrder[] }>(`/orders?wallet=${encodeURIComponent(wallet)}`);
  return data.orders;
}

export async function cancelOrder(orderId: string, wallet: string): Promise<ExchangeOrder> {
  const data = await apiFetch<{ order: ExchangeOrder }>(`/orders/${orderId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  return data.order;
}

export async function getPortfolio(wallet: string): Promise<PortfolioSummary> {
  return apiFetch<PortfolioSummary>(`/portfolio/${encodeURIComponent(wallet)}`);
}

export async function getVesting(wallet: string): Promise<VestingSchedule[]> {
  const data = await apiFetch<{ schedules: VestingSchedule[] }>(`/vesting/${encodeURIComponent(wallet)}`);
  return data.schedules;
}

export async function claimVesting(wallet: string, scheduleId: string, trancheId: string) {
  return apiFetch<{ schedule: VestingSchedule; claimed: VestingTranche }>("/vesting/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, scheduleId, trancheId }),
  });
}

export async function generateReferral(wallet: string): Promise<ReferralRecord> {
  return apiFetch<ReferralRecord>("/referral/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
}

export async function getReferral(code: string): Promise<ReferralRecord> {
  return apiFetch<ReferralRecord>(`/referral/${encodeURIComponent(code)}`);
}

export async function applyReferral(code: string, wallet: string, amountUsd: number) {
  return apiFetch<{ bonus: string; tier: string; bonusPct: number; record: ReferralRecord }>("/referral/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, wallet, amountUsd }),
  });
}

export async function getLeaderboard(): Promise<Leaderboard> {
  return apiFetch<Leaderboard>("/leaderboard");
}
