/**
 * UnyKorn Built-In Exchange Engine
 * OTC order book, limit orders, market data, portfolio tracking,
 * vesting schedules, referral system — all KV-backed.
 */

export interface ExchangeEnv {
	STATE: KVNamespace;
}

// ── Types ────────────────────────────────────────────────────

type OrderSide = "buy" | "sell";
type OrderType = "limit" | "market";
type OrderStatus = "open" | "filled" | "partial" | "cancelled" | "expired";
type VestingStatus = "locked" | "claimable" | "claimed";

interface ExchangeOrder {
	id: string;
	wallet: string;
	side: OrderSide;
	type: OrderType;
	pair: string;
	price: string;
	amount: string;
	filled: string;
	remaining: string;
	status: OrderStatus;
	createdAt: string;
	updatedAt: string;
	expiresAt?: string;
}

interface Trade {
	id: string;
	pair: string;
	price: string;
	amount: string;
	total: string;
	buyOrderId: string;
	sellOrderId: string;
	buyerWallet: string;
	sellerWallet: string;
	createdAt: string;
}

interface OHLCV {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

interface VestingSchedule {
	id: string;
	wallet: string;
	allocationId: string;
	totalUny: string;
	claimedUny: string;
	tranches: VestingTranche[];
	createdAt: string;
}

interface VestingTranche {
	id: string;
	amount: string;
	unlockAt: string;
	status: VestingStatus;
	claimedAt?: string;
}

interface ReferralRecord {
	code: string;
	ownerWallet: string;
	referrals: string[];
	totalBonus: string;
	tier: "bronze" | "silver" | "gold" | "platinum";
	createdAt: string;
}

interface PortfolioSummary {
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

// ── Constants ────────────────────────────────────────────────

const PAIRS = [
	{ id: "UNY/USDF", base: "UNY", quote: "USDF", minOrder: "100", tickSize: "0.000001", lotSize: "1" },
	{ id: "UNY/USDC", base: "UNY", quote: "USDC", minOrder: "100", tickSize: "0.000001", lotSize: "1" },
];

const REFERRAL_TIERS = [
	{ tier: "bronze" as const, minReferrals: 0, bonusPct: 2 },
	{ tier: "silver" as const, minReferrals: 5, bonusPct: 5 },
	{ tier: "gold" as const, minReferrals: 15, bonusPct: 8 },
	{ tier: "platinum" as const, minReferrals: 50, bonusPct: 12 },
];

// Simulated market state (will be made real with AMM integration)
const MARKET_STATE = {
	currentPrice: 0.008,
	high24h: 0.0085,
	low24h: 0.0074,
	volume24h: 847_500,
	change24h: 2.35,
	marketCap: 8_000_000,
	circulatingSupply: 200_000_000,
	totalSupply: 1_000_000_000,
};

// ── Handler ──────────────────────────────────────────────────

type JR = (data: unknown, status?: number) => Response;

export async function handleExchangeRequest(
	request: Request,
	url: URL,
	env: ExchangeEnv,
	jsonResponse: JR,
): Promise<Response> {

	// ── Market Data ──────────────────────

	if (url.pathname === "/exchange/v1/pairs" && request.method === "GET") {
		return jsonResponse({ pairs: PAIRS }, 200);
	}

	if (url.pathname === "/exchange/v1/ticker" && request.method === "GET") {
		const tickers = await getTickerData(env);
		return jsonResponse({ tickers }, 200);
	}

	if (url.pathname === "/exchange/v1/orderbook" && request.method === "GET") {
		const pair = url.searchParams.get("pair") ?? "UNY/USDF";
		const book = await getOrderBook(env, pair);
		return jsonResponse(book, 200);
	}

	if (url.pathname === "/exchange/v1/trades" && request.method === "GET") {
		const pair = url.searchParams.get("pair") ?? "UNY/USDF";
		const trades = await getRecentTrades(env, pair);
		return jsonResponse({ trades }, 200);
	}

	if (url.pathname === "/exchange/v1/ohlcv" && request.method === "GET") {
		const pair = url.searchParams.get("pair") ?? "UNY/USDF";
		const interval = url.searchParams.get("interval") ?? "1h";
		const ohlcv = generateOHLCV(interval);
		return jsonResponse({ pair, interval, candles: ohlcv }, 200);
	}

	if (url.pathname === "/exchange/v1/market-summary" && request.method === "GET") {
		return jsonResponse({
			...MARKET_STATE,
			pairs: PAIRS.length,
			timestamp: new Date().toISOString(),
		}, 200);
	}

	// ── Order Management ─────────────────

	if (url.pathname === "/exchange/v1/orders" && request.method === "POST") {
		return placeOrder(request, env, jsonResponse);
	}

	if (url.pathname === "/exchange/v1/orders" && request.method === "GET") {
		const wallet = url.searchParams.get("wallet");
		if (!wallet) return jsonResponse({ error: "wallet param required" }, 400);
		const orders = await getWalletOrders(env, wallet);
		return jsonResponse({ orders }, 200);
	}

	const cancelMatch = url.pathname.match(/^\/exchange\/v1\/orders\/([^/]+)\/cancel$/);
	if (cancelMatch && request.method === "POST") {
		return cancelOrder(cancelMatch[1], request, env, jsonResponse);
	}

	// ── Portfolio ────────────────────────

	const portfolioMatch = url.pathname.match(/^\/exchange\/v1\/portfolio\/([^/]+)$/);
	if (portfolioMatch && request.method === "GET") {
		const summary = await getPortfolio(env, decodeURIComponent(portfolioMatch[1]));
		return jsonResponse(summary, 200);
	}

	// ── Vesting ──────────────────────────

	const vestingMatch = url.pathname.match(/^\/exchange\/v1\/vesting\/([^/]+)$/);
	if (vestingMatch && request.method === "GET") {
		const schedules = await getVestingSchedules(env, decodeURIComponent(vestingMatch[1]));
		return jsonResponse({ schedules }, 200);
	}

	if (url.pathname === "/exchange/v1/vesting/claim" && request.method === "POST") {
		return claimVesting(request, env, jsonResponse);
	}

	// ── Referrals ────────────────────────

	if (url.pathname === "/exchange/v1/referral/generate" && request.method === "POST") {
		return generateReferralCode(request, env, jsonResponse);
	}

	const referralMatch = url.pathname.match(/^\/exchange\/v1\/referral\/([^/]+)$/);
	if (referralMatch && request.method === "GET") {
		const record = await getReferralRecord(env, referralMatch[1]);
		if (!record) return jsonResponse({ error: "Referral code not found" }, 404);
		return jsonResponse(record, 200);
	}

	if (url.pathname === "/exchange/v1/referral/apply" && request.method === "POST") {
		return applyReferral(request, env, jsonResponse);
	}

	// ── Leaderboard ──────────────────────

	if (url.pathname === "/exchange/v1/leaderboard" && request.method === "GET") {
		const board = await getLeaderboard(env);
		return jsonResponse(board, 200);
	}

	return jsonResponse({ error: "Exchange endpoint not found" }, 404);
}

// ── Order Book Implementation ────────────────────────────────

async function placeOrder(request: Request, env: ExchangeEnv, jr: JR): Promise<Response> {
	let body: { wallet?: string; side?: OrderSide; type?: OrderType; pair?: string; price?: number; amount?: number };
	try { body = await request.json() as typeof body; } catch { return jr({ error: "Invalid JSON" }, 400); }

	if (!body.wallet?.trim()) return jr({ error: "Wallet required" }, 400);
	if (!body.side || !["buy", "sell"].includes(body.side)) return jr({ error: "Side must be buy or sell" }, 400);
	if (!body.pair) return jr({ error: "Pair required" }, 400);
	if (!PAIRS.find(p => p.id === body.pair)) return jr({ error: "Invalid pair" }, 400);
	if (!body.amount || body.amount <= 0) return jr({ error: "Amount must be positive" }, 400);

	const price = body.type === "market" ? MARKET_STATE.currentPrice : (body.price ?? MARKET_STATE.currentPrice);
	if (price <= 0) return jr({ error: "Price must be positive" }, 400);

	const orderId = `exo_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
	const now = new Date().toISOString();

	const order: ExchangeOrder = {
		id: orderId,
		wallet: body.wallet.trim().toLowerCase(),
		side: body.side,
		type: body.type ?? "limit",
		pair: body.pair,
		price: price.toFixed(6),
		amount: body.amount.toFixed(2),
		filled: "0",
		remaining: body.amount.toFixed(2),
		status: "open",
		createdAt: now,
		updatedAt: now,
		expiresAt: new Date(Date.now() + 86400000).toISOString(),
	};

	await env.STATE.put(`exchange:order:${orderId}`, JSON.stringify(order), { expirationTtl: 86400 * 7 });

	// Track in wallet orders
	const walletKey = `exchange:wallet_orders:${order.wallet}`;
	const existing = await env.STATE.get(walletKey);
	const ids = existing ? JSON.parse(existing) as string[] : [];
	ids.unshift(orderId);
	await env.STATE.put(walletKey, JSON.stringify(ids.slice(0, 200)), { expirationTtl: 86400 * 30 });

	// Track in order book
	const bookKey = `exchange:book:${body.pair}:${body.side}`;
	const bookRaw = await env.STATE.get(bookKey);
	const book = bookRaw ? JSON.parse(bookRaw) as string[] : [];
	book.unshift(orderId);
	await env.STATE.put(bookKey, JSON.stringify(book.slice(0, 500)), { expirationTtl: 86400 * 7 });

	// Try to match (simple matching engine)
	const matchResult = await tryMatch(env, order);

	return jr({
		order: matchResult?.updatedOrder ?? order,
		matched: matchResult?.trades?.length ?? 0,
		trades: matchResult?.trades ?? [],
	}, 201);
}

async function tryMatch(env: ExchangeEnv, incomingOrder: ExchangeOrder): Promise<{ updatedOrder: ExchangeOrder; trades: Trade[] } | null> {
	const oppositeSide: OrderSide = incomingOrder.side === "buy" ? "sell" : "buy";
	const bookKey = `exchange:book:${incomingOrder.pair}:${oppositeSide}`;
	const bookRaw = await env.STATE.get(bookKey);
	if (!bookRaw) return null;

	const oppositeIds = JSON.parse(bookRaw) as string[];
	const trades: Trade[] = [];
	let remaining = parseFloat(incomingOrder.remaining);

	for (const oid of oppositeIds.slice(0, 20)) {
		if (remaining <= 0) break;

		const raw = await env.STATE.get(`exchange:order:${oid}`);
		if (!raw) continue;
		const counterOrder = JSON.parse(raw) as ExchangeOrder;
		if (counterOrder.status !== "open") continue;

		const counterPrice = parseFloat(counterOrder.price);
		const myPrice = parseFloat(incomingOrder.price);

		const priceMatch = incomingOrder.side === "buy"
			? myPrice >= counterPrice
			: myPrice <= counterPrice;

		if (!priceMatch) continue;

		const counterRemaining = parseFloat(counterOrder.remaining);
		const fillAmount = Math.min(remaining, counterRemaining);
		const tradePrice = counterPrice; // Price priority: existing order's price

		const trade: Trade = {
			id: `trd_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
			pair: incomingOrder.pair,
			price: tradePrice.toFixed(6),
			amount: fillAmount.toFixed(2),
			total: (fillAmount * tradePrice).toFixed(6),
			buyOrderId: incomingOrder.side === "buy" ? incomingOrder.id : counterOrder.id,
			sellOrderId: incomingOrder.side === "sell" ? incomingOrder.id : counterOrder.id,
			buyerWallet: incomingOrder.side === "buy" ? incomingOrder.wallet : counterOrder.wallet,
			sellerWallet: incomingOrder.side === "sell" ? incomingOrder.wallet : counterOrder.wallet,
			createdAt: new Date().toISOString(),
		};

		trades.push(trade);
		remaining -= fillAmount;

		// Update counter order
		const newCounterFilled = parseFloat(counterOrder.filled) + fillAmount;
		const newCounterRemaining = counterRemaining - fillAmount;
		counterOrder.filled = newCounterFilled.toFixed(2);
		counterOrder.remaining = newCounterRemaining.toFixed(2);
		counterOrder.status = newCounterRemaining <= 0.01 ? "filled" : "partial";
		counterOrder.updatedAt = new Date().toISOString();
		await env.STATE.put(`exchange:order:${counterOrder.id}`, JSON.stringify(counterOrder), { expirationTtl: 86400 * 7 });

		// Store trade
		await env.STATE.put(`exchange:trade:${trade.id}`, JSON.stringify(trade), { expirationTtl: 86400 * 30 });

		// Append to trade history
		const histKey = `exchange:trades:${incomingOrder.pair}`;
		const histRaw = await env.STATE.get(histKey);
		const hist = histRaw ? JSON.parse(histRaw) as string[] : [];
		hist.unshift(trade.id);
		await env.STATE.put(histKey, JSON.stringify(hist.slice(0, 500)), { expirationTtl: 86400 * 30 });
	}

	// Update incoming order
	const totalFilled = parseFloat(incomingOrder.amount) - remaining;
	incomingOrder.filled = totalFilled.toFixed(2);
	incomingOrder.remaining = remaining.toFixed(2);
	incomingOrder.status = remaining <= 0.01 ? "filled" : totalFilled > 0 ? "partial" : "open";
	incomingOrder.updatedAt = new Date().toISOString();
	await env.STATE.put(`exchange:order:${incomingOrder.id}`, JSON.stringify(incomingOrder), { expirationTtl: 86400 * 7 });

	return trades.length > 0 ? { updatedOrder: incomingOrder, trades } : null;
}

async function cancelOrder(orderId: string, request: Request, env: ExchangeEnv, jr: JR): Promise<Response> {
	let body: { wallet?: string };
	try { body = await request.json() as typeof body; } catch { return jr({ error: "Invalid JSON" }, 400); }

	const raw = await env.STATE.get(`exchange:order:${orderId}`);
	if (!raw) return jr({ error: "Order not found" }, 404);

	const order = JSON.parse(raw) as ExchangeOrder;
	if (body.wallet?.toLowerCase() !== order.wallet) return jr({ error: "Unauthorized" }, 403);
	if (order.status !== "open" && order.status !== "partial") return jr({ error: "Cannot cancel" }, 400);

	order.status = "cancelled";
	order.updatedAt = new Date().toISOString();
	await env.STATE.put(`exchange:order:${orderId}`, JSON.stringify(order), { expirationTtl: 86400 * 7 });

	return jr({ order }, 200);
}

async function getWalletOrders(env: ExchangeEnv, wallet: string): Promise<ExchangeOrder[]> {
	const key = `exchange:wallet_orders:${wallet.toLowerCase()}`;
	const raw = await env.STATE.get(key);
	if (!raw) return [];

	const ids = JSON.parse(raw) as string[];
	const orders: ExchangeOrder[] = [];
	for (const id of ids.slice(0, 50)) {
		const orderRaw = await env.STATE.get(`exchange:order:${id}`);
		if (orderRaw) orders.push(JSON.parse(orderRaw) as ExchangeOrder);
	}
	return orders;
}

async function getOrderBook(env: ExchangeEnv, pair: string) {
	const [bidsRaw, asksRaw] = await Promise.all([
		env.STATE.get(`exchange:book:${pair}:buy`),
		env.STATE.get(`exchange:book:${pair}:sell`),
	]);

	const bidIds = bidsRaw ? JSON.parse(bidsRaw) as string[] : [];
	const askIds = asksRaw ? JSON.parse(asksRaw) as string[] : [];

	const loadOrders = async (ids: string[]) => {
		const orders: ExchangeOrder[] = [];
		for (const id of ids.slice(0, 25)) {
			const raw = await env.STATE.get(`exchange:order:${id}`);
			if (raw) {
				const order = JSON.parse(raw) as ExchangeOrder;
				if (order.status === "open" || order.status === "partial") orders.push(order);
			}
		}
		return orders;
	};

	const bids = await loadOrders(bidIds);
	const asks = await loadOrders(askIds);

	// Aggregate by price level
	const aggregateLevels = (orders: ExchangeOrder[]) => {
		const levels = new Map<string, number>();
		for (const o of orders) {
			const rem = parseFloat(o.remaining);
			levels.set(o.price, (levels.get(o.price) ?? 0) + rem);
		}
		return [...levels.entries()].map(([price, amount]) => ({ price, amount: amount.toFixed(2) }));
	};

	return {
		pair,
		bids: aggregateLevels(bids).sort((a, b) => parseFloat(b.price) - parseFloat(a.price)),
		asks: aggregateLevels(asks).sort((a, b) => parseFloat(a.price) - parseFloat(b.price)),
		spread: calculateSpread(bids, asks),
		timestamp: new Date().toISOString(),
	};
}

function calculateSpread(bids: ExchangeOrder[], asks: ExchangeOrder[]): string {
	if (bids.length === 0 || asks.length === 0) return "N/A";
	const bestBid = Math.max(...bids.map(b => parseFloat(b.price)));
	const bestAsk = Math.min(...asks.map(a => parseFloat(a.price)));
	return ((bestAsk - bestBid) / bestBid * 100).toFixed(4) + "%";
}

async function getRecentTrades(env: ExchangeEnv, pair: string): Promise<Trade[]> {
	const histRaw = await env.STATE.get(`exchange:trades:${pair}`);
	if (!histRaw) {
		// Return seed trades for demo
		return generateSeedTrades(pair);
	}

	const ids = JSON.parse(histRaw) as string[];
	const trades: Trade[] = [];
	for (const id of ids.slice(0, 50)) {
		const raw = await env.STATE.get(`exchange:trade:${id}`);
		if (raw) trades.push(JSON.parse(raw) as Trade);
	}
	return trades.length > 0 ? trades : generateSeedTrades(pair);
}

async function getTickerData(env: ExchangeEnv) {
	return PAIRS.map(pair => ({
		pair: pair.id,
		lastPrice: MARKET_STATE.currentPrice.toFixed(6),
		high24h: MARKET_STATE.high24h.toFixed(6),
		low24h: MARKET_STATE.low24h.toFixed(6),
		volume24h: MARKET_STATE.volume24h.toFixed(2),
		change24h: MARKET_STATE.change24h.toFixed(2),
		changePercent24h: ((MARKET_STATE.change24h / MARKET_STATE.currentPrice) * 100).toFixed(2),
		bid: (MARKET_STATE.currentPrice - 0.0001).toFixed(6),
		ask: (MARKET_STATE.currentPrice + 0.0001).toFixed(6),
		timestamp: new Date().toISOString(),
	}));
}

// ── Portfolio ────────────────────────────────────────────────

async function getPortfolio(env: ExchangeEnv, wallet: string): Promise<PortfolioSummary> {
	const normalizedWallet = wallet.toLowerCase();

	// Load allocations
	const allocRaw = await env.STATE.get(`ico:wallet:${normalizedWallet}`);
	const allocIds = allocRaw ? JSON.parse(allocRaw) as string[] : [];

	let totalUny = 0;
	let totalPaid = 0;

	for (const aid of allocIds.slice(0, 50)) {
		const raw = await env.STATE.get(`ico:allocation:${aid}`);
		if (raw) {
			const alloc = JSON.parse(raw) as { totalUny: string; amountPaid: string };
			totalUny += parseFloat(alloc.totalUny);
			totalPaid += parseFloat(alloc.amountPaid);
		}
	}

	// Load vesting
	const vestRaw = await env.STATE.get(`exchange:vesting:${normalizedWallet}`);
	const vestIds = vestRaw ? JSON.parse(vestRaw) as string[] : [];
	let vestingLocked = 0;
	let vestingClaimable = 0;

	for (const vid of vestIds.slice(0, 20)) {
		const raw = await env.STATE.get(`exchange:vesting_schedule:${vid}`);
		if (raw) {
			const schedule = JSON.parse(raw) as VestingSchedule;
			for (const t of schedule.tranches) {
				if (t.status === "locked") vestingLocked += parseFloat(t.amount);
				if (t.status === "claimable" || (t.status === "locked" && Date.now() >= Date.parse(t.unlockAt))) {
					vestingClaimable += parseFloat(t.amount);
				}
			}
		}
	}

	// Load referral bonus
	const refRaw = await env.STATE.get(`exchange:referral_wallet:${normalizedWallet}`);
	let referralBonus = 0;
	if (refRaw) {
		const record = JSON.parse(refRaw) as ReferralRecord;
		referralBonus = parseFloat(record.totalBonus);
	}

	const avgBuyPrice = totalPaid > 0 && totalUny > 0 ? totalPaid / totalUny : 0;
	const currentValue = totalUny * MARKET_STATE.currentPrice;
	const unrealizedPnl = currentValue - totalPaid;
	const unrealizedPnlPct = totalPaid > 0 ? (unrealizedPnl / totalPaid) * 100 : 0;

	return {
		wallet: normalizedWallet,
		holdings: [
			{ asset: "UNY", balance: totalUny.toFixed(2), valueUsd: currentValue.toFixed(2) },
		],
		totalValueUsd: currentValue.toFixed(2),
		totalUnyHeld: totalUny.toFixed(2),
		allocations: allocIds.length,
		averageBuyPrice: avgBuyPrice.toFixed(6),
		unrealizedPnl: unrealizedPnl.toFixed(2),
		unrealizedPnlPct: unrealizedPnlPct.toFixed(2),
		vestingLocked: vestingLocked.toFixed(2),
		vestingClaimable: vestingClaimable.toFixed(2),
		referralBonus: referralBonus.toFixed(2),
	};
}

// ── Vesting ──────────────────────────────────────────────────

async function getVestingSchedules(env: ExchangeEnv, wallet: string): Promise<VestingSchedule[]> {
	const normalizedWallet = wallet.toLowerCase();
	const vestRaw = await env.STATE.get(`exchange:vesting:${normalizedWallet}`);
	if (!vestRaw) {
		// Auto-create vesting for existing allocations
		return createVestingFromAllocations(env, normalizedWallet);
	}

	const ids = JSON.parse(vestRaw) as string[];
	const schedules: VestingSchedule[] = [];
	for (const id of ids.slice(0, 20)) {
		const raw = await env.STATE.get(`exchange:vesting_schedule:${id}`);
		if (raw) {
			const schedule = JSON.parse(raw) as VestingSchedule;
			// Update tranche statuses
			for (const t of schedule.tranches) {
				if (t.status === "locked" && Date.now() >= Date.parse(t.unlockAt)) {
					t.status = "claimable";
				}
			}
			schedules.push(schedule);
		}
	}
	return schedules;
}

async function createVestingFromAllocations(env: ExchangeEnv, wallet: string): Promise<VestingSchedule[]> {
	const allocRaw = await env.STATE.get(`ico:wallet:${wallet}`);
	if (!allocRaw) return [];

	const allocIds = JSON.parse(allocRaw) as string[];
	const schedules: VestingSchedule[] = [];
	const vestIds: string[] = [];

	for (const aid of allocIds.slice(0, 20)) {
		const raw = await env.STATE.get(`ico:allocation:${aid}`);
		if (!raw) continue;

		const alloc = JSON.parse(raw) as { allocationId: string; totalUny: string; createdAt: string };
		const totalUny = parseFloat(alloc.totalUny);

		// Vesting schedule: 25% immediate, 25% at 3 months, 25% at 6 months, 25% at 12 months
		const baseDate = Date.parse(alloc.createdAt);
		const tranches: VestingTranche[] = [
			{ id: `vt_${crypto.randomUUID().slice(0, 8)}`, amount: (totalUny * 0.25).toFixed(2), unlockAt: new Date(baseDate).toISOString(), status: "claimable" },
			{ id: `vt_${crypto.randomUUID().slice(0, 8)}`, amount: (totalUny * 0.25).toFixed(2), unlockAt: new Date(baseDate + 90 * 86400000).toISOString(), status: "locked" },
			{ id: `vt_${crypto.randomUUID().slice(0, 8)}`, amount: (totalUny * 0.25).toFixed(2), unlockAt: new Date(baseDate + 180 * 86400000).toISOString(), status: "locked" },
			{ id: `vt_${crypto.randomUUID().slice(0, 8)}`, amount: (totalUny * 0.25).toFixed(2), unlockAt: new Date(baseDate + 365 * 86400000).toISOString(), status: "locked" },
		];

		// Update statuses
		for (const t of tranches) {
			if (t.status === "locked" && Date.now() >= Date.parse(t.unlockAt)) {
				t.status = "claimable";
			}
		}

		const schedule: VestingSchedule = {
			id: `vest_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
			wallet,
			allocationId: alloc.allocationId,
			totalUny: alloc.totalUny,
			claimedUny: "0",
			tranches,
			createdAt: alloc.createdAt,
		};

		await env.STATE.put(`exchange:vesting_schedule:${schedule.id}`, JSON.stringify(schedule), { expirationTtl: 86400 * 365 });
		vestIds.push(schedule.id);
		schedules.push(schedule);
	}

	if (vestIds.length > 0) {
		await env.STATE.put(`exchange:vesting:${wallet}`, JSON.stringify(vestIds), { expirationTtl: 86400 * 365 });
	}

	return schedules;
}

async function claimVesting(request: Request, env: ExchangeEnv, jr: JR): Promise<Response> {
	let body: { wallet?: string; scheduleId?: string; trancheId?: string };
	try { body = await request.json() as typeof body; } catch { return jr({ error: "Invalid JSON" }, 400); }

	if (!body.wallet?.trim() || !body.scheduleId || !body.trancheId) {
		return jr({ error: "wallet, scheduleId, and trancheId required" }, 400);
	}

	const raw = await env.STATE.get(`exchange:vesting_schedule:${body.scheduleId}`);
	if (!raw) return jr({ error: "Schedule not found" }, 404);

	const schedule = JSON.parse(raw) as VestingSchedule;
	if (schedule.wallet !== body.wallet.toLowerCase()) return jr({ error: "Unauthorized" }, 403);

	const tranche = schedule.tranches.find(t => t.id === body.trancheId);
	if (!tranche) return jr({ error: "Tranche not found" }, 404);

	if (tranche.status === "claimed") return jr({ error: "Already claimed" }, 400);
	if (Date.now() < Date.parse(tranche.unlockAt)) return jr({ error: "Not yet unlocked" }, 400);

	tranche.status = "claimed";
	tranche.claimedAt = new Date().toISOString();
	schedule.claimedUny = (parseFloat(schedule.claimedUny) + parseFloat(tranche.amount)).toFixed(2);

	await env.STATE.put(`exchange:vesting_schedule:${body.scheduleId}`, JSON.stringify(schedule), { expirationTtl: 86400 * 365 });

	return jr({ schedule, claimed: tranche }, 200);
}

// ── Referrals ────────────────────────────────────────────────

async function generateReferralCode(request: Request, env: ExchangeEnv, jr: JR): Promise<Response> {
	let body: { wallet?: string };
	try { body = await request.json() as typeof body; } catch { return jr({ error: "Invalid JSON" }, 400); }

	if (!body.wallet?.trim()) return jr({ error: "Wallet required" }, 400);

	const wallet = body.wallet.trim().toLowerCase();
	const existingRaw = await env.STATE.get(`exchange:referral_wallet:${wallet}`);
	if (existingRaw) {
		return jr(JSON.parse(existingRaw), 200);
	}

	const code = `UNY-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

	const record: ReferralRecord = {
		code,
		ownerWallet: wallet,
		referrals: [],
		totalBonus: "0",
		tier: "bronze",
		createdAt: new Date().toISOString(),
	};

	await env.STATE.put(`exchange:referral:${code}`, JSON.stringify(record), { expirationTtl: 86400 * 365 });
	await env.STATE.put(`exchange:referral_wallet:${wallet}`, JSON.stringify(record), { expirationTtl: 86400 * 365 });

	return jr(record, 201);
}

async function getReferralRecord(env: ExchangeEnv, code: string): Promise<ReferralRecord | null> {
	const raw = await env.STATE.get(`exchange:referral:${code}`);
	return raw ? JSON.parse(raw) as ReferralRecord : null;
}

async function applyReferral(request: Request, env: ExchangeEnv, jr: JR): Promise<Response> {
	let body: { code?: string; wallet?: string; amountUsd?: number };
	try { body = await request.json() as typeof body; } catch { return jr({ error: "Invalid JSON" }, 400); }

	if (!body.code || !body.wallet || !body.amountUsd) return jr({ error: "code, wallet, amountUsd required" }, 400);

	const raw = await env.STATE.get(`exchange:referral:${body.code}`);
	if (!raw) return jr({ error: "Invalid referral code" }, 404);

	const record = JSON.parse(raw) as ReferralRecord;
	if (record.ownerWallet === body.wallet.toLowerCase()) return jr({ error: "Cannot use own referral code" }, 400);

	// Find tier
	const tierInfo = [...REFERRAL_TIERS].reverse().find(t => record.referrals.length >= t.minReferrals) ?? REFERRAL_TIERS[0];
	const bonusUsd = body.amountUsd * (tierInfo.bonusPct / 100);

	record.referrals.push(body.wallet.toLowerCase());
	record.totalBonus = (parseFloat(record.totalBonus) + bonusUsd).toFixed(2);
	record.tier = tierInfo.tier;

	await env.STATE.put(`exchange:referral:${body.code}`, JSON.stringify(record), { expirationTtl: 86400 * 365 });
	await env.STATE.put(`exchange:referral_wallet:${record.ownerWallet}`, JSON.stringify(record), { expirationTtl: 86400 * 365 });

	return jr({ bonus: bonusUsd.toFixed(2), tier: tierInfo.tier, bonusPct: tierInfo.bonusPct, record }, 200);
}

// ── Leaderboard ──────────────────────────────────────────────

async function getLeaderboard(env: ExchangeEnv) {
	// Generate a sample leaderboard (real data accumulates over time)
	return {
		topHolders: [
			{ rank: 1, wallet: "uny1_treasury...fth", balance: "150,000,000", pct: "15.0%" },
			{ rank: 2, wallet: "uny1_foundrs...ko2", balance: "50,000,000", pct: "5.0%" },
			{ rank: 3, wallet: "uny1_earlybd...x9k", balance: "12,500,000", pct: "1.25%" },
			{ rank: 4, wallet: "uny1_seed01...a3m", balance: "5,000,000", pct: "0.5%" },
			{ rank: 5, wallet: "uny1_seed02...r7n", balance: "2,500,000", pct: "0.25%" },
		],
		topReferrers: [
			{ rank: 1, code: "UNY-ALPHA001", referrals: 47, bonus: "$940.00", tier: "gold" },
			{ rank: 2, code: "UNY-BETA0023", referrals: 23, bonus: "$460.00", tier: "gold" },
			{ rank: 3, code: "UNY-GAMMA042", referrals: 12, bonus: "$144.00", tier: "silver" },
		],
		recentTrades: generateSeedTrades("UNY/USDF").slice(0, 10),
		timestamp: new Date().toISOString(),
	};
}

// ── Helpers ──────────────────────────────────────────────────

function generateSeedTrades(pair: string): Trade[] {
	const now = Date.now();
	const trades: Trade[] = [];
	for (let i = 0; i < 25; i++) {
		const priceVar = MARKET_STATE.currentPrice + (Math.random() - 0.5) * 0.001;
		const amount = Math.floor(Math.random() * 50000 + 1000);
		trades.push({
			id: `seed_trd_${i}`,
			pair,
			price: priceVar.toFixed(6),
			amount: amount.toFixed(2),
			total: (amount * priceVar).toFixed(2),
			buyOrderId: `seed_buy_${i}`,
			sellOrderId: `seed_sell_${i}`,
			buyerWallet: "uny1_" + "x".repeat(20),
			sellerWallet: "uny1_" + "y".repeat(20),
			createdAt: new Date(now - i * 300000).toISOString(),
		});
	}
	return trades;
}

function generateOHLCV(interval: string): OHLCV[] {
	const candles: OHLCV[] = [];
	const now = Date.now();
	const intervalMs = interval === "1d" ? 86400000 : interval === "4h" ? 14400000 : 3600000;
	const count = 168; // 7 days for 1h, 42 days for 4h, 168 days for 1d

	let price = 0.005; // Start from genesis price
	for (let i = count; i >= 0; i--) {
		const time = now - i * intervalMs;
		const trend = (count - i) / count * 0.003; // Gradual uptrend to current price
		const noise = (Math.random() - 0.5) * 0.0008;
		const open = price;
		const close = 0.005 + trend + noise;
		const high = Math.max(open, close) + Math.random() * 0.0003;
		const low = Math.min(open, close) - Math.random() * 0.0003;
		const volume = Math.floor(Math.random() * 500000 + 100000);
		price = close;

		candles.push({
			time: Math.floor(time / 1000),
			open: parseFloat(open.toFixed(6)),
			high: parseFloat(high.toFixed(6)),
			low: parseFloat(Math.max(low, 0.001).toFixed(6)),
			close: parseFloat(close.toFixed(6)),
			volume,
		});
	}
	return candles;
}
