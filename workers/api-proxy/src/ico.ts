type JsonResponse = (data: unknown, status?: number) => Response;

export interface IcoEnv {
	STATE: KVNamespace;
	ICO_USDF_RECEIVER?: string;
	ICO_BASE_USDC_RECEIVER?: string;
	UNYKORN_RPC_URL?: string;
	BASE_RPC_URL?: string;
	BASE_USDC_ADDRESS?: string;
}

type TierId = "seed" | "private" | "public";
type PaymentMethodId = "usdf-unykorn" | "usdc-base";

interface IcoTier {
	id: TierId;
	label: string;
	priceUsd: number;
	bonusPct: number;
	minUsd: number;
	maxUsd: number;
	live: boolean;
	allocation: string;
}

interface PaymentMethod {
	id: PaymentMethodId;
	label: string;
	asset: "USDF" | "USDC";
	rail: "unykorn-l1" | "base";
	network: string;
	receiver: string;
	tokenAddress?: string;
	decimals: number;
	explorerTxBase: string;
}

interface SaleOrder {
	orderId: string;
	invoiceId: string;
	nonce: string;
	tierId: TierId;
	tierLabel: string;
	buyerName: string;
	buyerEmail: string;
	buyerWallet: string;
	jurisdiction: string;
	acknowledgedRisk: boolean;
	notRestrictedPerson: boolean;
	acceptedTerms: boolean;
	paymentMethodId: PaymentMethodId;
	settlementAsset: "USDF" | "USDC";
	settlementRail: "unykorn-l1" | "base";
	receiver: string;
	amountUsd: string;
	priceUsd: string;
	baseUny: string;
	bonusUny: string;
	totalUny: string;
	status: "pending_payment" | "paid" | "expired" | "cancelled";
	createdAt: string;
	expiresAt: string;
	paidAt?: string;
	txHash?: string;
	allocationId?: string;
	receiptId?: string;
}

interface AllocationRecord {
	allocationId: string;
	orderId: string;
	invoiceId: string;
	wallet: string;
	buyerEmail: string;
	tierId: TierId;
	settlementAsset: "USDF" | "USDC";
	settlementRail: "unykorn-l1" | "base";
	amountPaid: string;
	baseUny: string;
	bonusUny: string;
	totalUny: string;
	receiptId: string;
	txHash: string;
	status: "issued";
	createdAt: string;
}

interface CreateOrderBody {
	buyerName?: string;
	buyerEmail?: string;
	buyerWallet?: string;
	jurisdiction?: string;
	tierId?: TierId;
	paymentMethodId?: PaymentMethodId;
	amountUsd?: number;
	acknowledgedRisk?: boolean;
	notRestrictedPerson?: boolean;
	acceptedTerms?: boolean;
}

interface ConfirmOrderBody {
	txHash?: string;
	payer?: string;
}

interface JsonRpcReceiptLog {
	address: string;
	topics: string[];
	data: string;
}

interface JsonRpcReceipt {
	status?: string;
	blockNumber?: string;
	logs: JsonRpcReceiptLog[];
}

interface JsonRpcTx {
	from?: string;
	to?: string;
	value?: string;
}

interface L1TxStatus {
	tx_hash: string;
	status: "pending" | "committed" | "failed";
	block_height?: number;
	error?: string;
	from?: string;
	to?: string;
	amount?: string;
	value?: string;
}

const ORDER_TTL_MS = 30 * 60 * 1000;
const BASE_USDC_ADDRESS_DEFAULT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_RPC_URL_DEFAULT = "https://mainnet.base.org";
const UNYKORN_RPC_URL_DEFAULT = "https://rpc.l1.unykorn.org";
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TIERS: IcoTier[] = [
	{ id: "seed", label: "Seed", priceUsd: 0.005, bonusPct: 60, minUsd: 100, maxUsd: 25_000, live: true, allocation: "50,000,000 UNY" },
	{ id: "private", label: "Private Sale", priceUsd: 0.008, bonusPct: 30, minUsd: 500, maxUsd: 100_000, live: false, allocation: "80,000,000 UNY" },
	{ id: "public", label: "Public Sale", priceUsd: 0.012, bonusPct: 10, minUsd: 50, maxUsd: 50_000, live: false, allocation: "70,000,000 UNY" },
];

export async function handleIcoRequest(
	request: Request,
	url: URL,
	env: IcoEnv,
	jsonResponse: JsonResponse,
): Promise<Response> {
	const methods = getPaymentMethods(env);

	if (url.pathname === "/ico/v1/config" && request.method === "GET") {
		return jsonResponse({
			saleEnabled: methods.length > 0,
			tiers: TIERS,
			paymentMethods: methods,
			terms: {
				riskDisclosure: true,
				whitelistMode: false,
				settlement: "Direct wallet transfer only. No card processors. No custodial checkout.",
			},
		}, 200);
	}

	if (url.pathname === "/ico/v1/orders" && request.method === "POST") {
		return createOrder(request, env, methods, jsonResponse);
	}

	const orderMatch = url.pathname.match(/^\/ico\/v1\/orders\/([^/]+)$/);
	if (orderMatch && request.method === "GET") {
		return getOrder(orderMatch[1], env, jsonResponse);
	}

	const confirmMatch = url.pathname.match(/^\/ico\/v1\/orders\/([^/]+)\/confirm$/);
	if (confirmMatch && request.method === "POST") {
		return confirmOrder(confirmMatch[1], request, env, methods, jsonResponse);
	}

	const allocationMatch = url.pathname.match(/^\/ico\/v1\/allocations\/([^/]+)$/);
	if (allocationMatch && request.method === "GET") {
		return getAllocationsByWallet(allocationMatch[1], env, jsonResponse);
	}

	return jsonResponse({ error: "Not found" }, 404);
}

function getPaymentMethods(env: IcoEnv): PaymentMethod[] {
	const methods: PaymentMethod[] = [];

	if (env.ICO_USDF_RECEIVER) {
		methods.push({
			id: "usdf-unykorn",
			label: "USDF on UnyKorn L1",
			asset: "USDF",
			rail: "unykorn-l1",
			network: "UnyKorn L1",
			receiver: env.ICO_USDF_RECEIVER,
			decimals: 6,
			explorerTxBase: "https://ex.unykorn.org",
		});
	}

	if (env.ICO_BASE_USDC_RECEIVER) {
		methods.push({
			id: "usdc-base",
			label: "USDC on Base",
			asset: "USDC",
			rail: "base",
			network: "Base",
			receiver: env.ICO_BASE_USDC_RECEIVER,
			tokenAddress: env.BASE_USDC_ADDRESS ?? BASE_USDC_ADDRESS_DEFAULT,
			decimals: 6,
			explorerTxBase: "https://basescan.org/tx/",
		});
	}

	return methods;
}

async function createOrder(
	request: Request,
	env: IcoEnv,
	methods: PaymentMethod[],
	jsonResponse: JsonResponse,
): Promise<Response> {
	if (methods.length === 0) {
		return jsonResponse({ error: "Sale is not configured" }, 503);
	}

	let body: CreateOrderBody;
	try {
		body = await request.json() as CreateOrderBody;
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}
	const tier = TIERS.find((item) => item.id === body.tierId);
	const method = methods.find((item) => item.id === body.paymentMethodId);

	if (!tier) return jsonResponse({ error: "Invalid tier" }, 400);
	if (!tier.live) return jsonResponse({ error: `${tier.label} is not live` }, 400);
	if (!method) return jsonResponse({ error: "Invalid payment method" }, 400);
	if (!body.buyerName?.trim()) return jsonResponse({ error: "Buyer name is required" }, 400);
	if (!body.buyerEmail?.trim() || !isEmail(body.buyerEmail)) return jsonResponse({ error: "Valid email is required" }, 400);
	if (!body.buyerWallet?.trim() || !isWalletValid(body.buyerWallet, method.rail)) return jsonResponse({ error: "Valid settlement wallet is required" }, 400);
	if (!body.jurisdiction?.trim()) return jsonResponse({ error: "Jurisdiction is required" }, 400);
	if (!body.acceptedTerms || !body.acknowledgedRisk || !body.notRestrictedPerson) {
		return jsonResponse({ error: "All sale acknowledgements must be accepted" }, 400);
	}

	const amountUsd = Number(body.amountUsd ?? 0);
	if (!Number.isFinite(amountUsd) || amountUsd < tier.minUsd || amountUsd > tier.maxUsd) {
		return jsonResponse({ error: `Investment must be between ${tier.minUsd} and ${tier.maxUsd} USD` }, 400);
	}

	const normalizedWallet = normalizeWallet(body.buyerWallet, method.rail);
	const baseUny = amountUsd / tier.priceUsd;
	const bonusUny = baseUny * (tier.bonusPct / 100);
	const totalUny = baseUny + bonusUny;
	const orderId = makeId("ord");
	const invoiceId = makeId("saleinv");
	const nonce = makeId("nonce");
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ORDER_TTL_MS).toISOString();

	const order: SaleOrder = {
		orderId,
		invoiceId,
		nonce,
		tierId: tier.id,
		tierLabel: tier.label,
		buyerName: body.buyerName.trim(),
		buyerEmail: body.buyerEmail.trim().toLowerCase(),
		buyerWallet: normalizedWallet,
		jurisdiction: body.jurisdiction.trim(),
		acknowledgedRisk: true,
		notRestrictedPerson: true,
		acceptedTerms: true,
		paymentMethodId: method.id,
		settlementAsset: method.asset,
		settlementRail: method.rail,
		receiver: method.receiver,
		amountUsd: fmtDecimal(amountUsd),
		priceUsd: fmtDecimal(tier.priceUsd),
		baseUny: fmtDecimal(baseUny),
		bonusUny: fmtDecimal(bonusUny),
		totalUny: fmtDecimal(totalUny),
		status: "pending_payment",
		createdAt: now.toISOString(),
		expiresAt,
	};

	await env.STATE.put(orderKey(orderId), JSON.stringify(order));
	await env.STATE.put(invoiceKey(invoiceId), JSON.stringify({ orderId }));

	return jsonResponse({
		order,
		payment: {
			receiver: method.receiver,
			asset: method.asset,
			rail: method.rail,
			network: method.network,
			tokenAddress: method.tokenAddress,
			amount: order.amountUsd,
			expiresAt,
			invoiceId,
			nonce,
		},
	}, 201);
}

async function getOrder(orderId: string, env: IcoEnv, jsonResponse: JsonResponse): Promise<Response> {
	const order = await loadOrder(env, orderId);
	if (!order) return jsonResponse({ error: "Order not found" }, 404);
	return jsonResponse({ order: withDerivedStatus(order) }, 200);
}

async function confirmOrder(
	orderId: string,
	request: Request,
	env: IcoEnv,
	methods: PaymentMethod[],
	jsonResponse: JsonResponse,
): Promise<Response> {
	const order = await loadOrder(env, orderId);
	if (!order) return jsonResponse({ error: "Order not found" }, 404);

	const current = withDerivedStatus(order);
	if (current.status === "expired") return jsonResponse({ error: "Order expired" }, 400);
	if (current.status === "paid" && current.allocationId) {
		const allocation = await loadAllocation(env, current.allocationId);
		return jsonResponse({ order: current, allocation }, 200);
	}

	let body: ConfirmOrderBody;
	try {
		body = await request.json() as ConfirmOrderBody;
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}
	if (!body.txHash?.trim()) return jsonResponse({ error: "Transaction hash is required" }, 400);

	const txHash = body.txHash.trim();
	if (!isTxHash(txHash)) {
		return jsonResponse({ error: "Valid transaction hash is required" }, 400);
	}
	const existingTx = await env.STATE.get(txKey(txHash));
	if (existingTx && existingTx !== orderId) {
		return jsonResponse({ error: "Transaction hash already used for another order" }, 409);
	}

	const method = methods.find((item) => item.id === current.paymentMethodId);
	if (!method) return jsonResponse({ error: "Payment method not available" }, 503);

	const payer = normalizeWallet(body.payer?.trim() || current.buyerWallet, method.rail);
	if (!isWalletValid(payer, method.rail)) {
		return jsonResponse({ error: "Valid payer wallet is required" }, 400);
	}

	const verification = method.rail === "base"
		? await verifyBasePayment(env, current, method, txHash, payer)
		: await verifyUnykornPayment(env, current, txHash, payer);

	if (!verification.verified) {
		return jsonResponse({ error: verification.error, error_code: verification.errorCode }, 402);
	}

	const allocationId = makeId("alloc");
	const receiptId = makeId("sale_rcpt");
	const paidAt = new Date().toISOString();
	const paidOrder: SaleOrder = {
		...current,
		status: "paid",
		paidAt,
		txHash,
		allocationId,
		receiptId,
	};

	const allocation: AllocationRecord = {
		allocationId,
		orderId: current.orderId,
		invoiceId: current.invoiceId,
		wallet: payer,
		buyerEmail: current.buyerEmail,
		tierId: current.tierId,
		settlementAsset: current.settlementAsset,
		settlementRail: current.settlementRail,
		amountPaid: current.amountUsd,
		baseUny: current.baseUny,
		bonusUny: current.bonusUny,
		totalUny: current.totalUny,
		receiptId,
		txHash,
		status: "issued",
		createdAt: paidAt,
	};

	await env.STATE.put(orderKey(orderId), JSON.stringify(paidOrder));
	await env.STATE.put(allocationKey(allocationId), JSON.stringify(allocation));
	await env.STATE.put(txKey(txHash), orderId);
	await addWalletAllocation(env, payer, allocationId);

	return jsonResponse({ order: paidOrder, allocation }, 200);
}

async function getAllocationsByWallet(wallet: string, env: IcoEnv, jsonResponse: JsonResponse): Promise<Response> {
	const ids = await loadWalletAllocations(env, wallet);
	const allocations = await Promise.all(ids.map(async (id) => loadAllocation(env, id)));
	return jsonResponse({ allocations: allocations.filter((item): item is AllocationRecord => Boolean(item)) }, 200);
}

function withDerivedStatus(order: SaleOrder): SaleOrder {
	if (order.status === "pending_payment" && Date.now() > Date.parse(order.expiresAt)) {
		return { ...order, status: "expired" };
	}
	return order;
}

async function loadOrder(env: IcoEnv, orderId: string): Promise<SaleOrder | null> {
	const raw = await env.STATE.get(orderKey(orderId));
	return raw ? JSON.parse(raw) as SaleOrder : null;
}

async function loadAllocation(env: IcoEnv, allocationId: string): Promise<AllocationRecord | null> {
	const raw = await env.STATE.get(allocationKey(allocationId));
	return raw ? JSON.parse(raw) as AllocationRecord : null;
}

async function loadWalletAllocations(env: IcoEnv, wallet: string): Promise<string[]> {
	const raw = await env.STATE.get(walletKey(wallet));
	return raw ? JSON.parse(raw) as string[] : [];
}

async function addWalletAllocation(env: IcoEnv, wallet: string, allocationId: string): Promise<void> {
	const normalized = walletKey(wallet);
	const existing = await env.STATE.get(normalized);
	const ids = existing ? JSON.parse(existing) as string[] : [];
	if (!ids.includes(allocationId)) ids.unshift(allocationId);
	await env.STATE.put(normalized, JSON.stringify(ids.slice(0, 100)));
}

function orderKey(orderId: string): string { return `ico:order:${orderId}`; }
function invoiceKey(invoiceId: string): string { return `ico:invoice:${invoiceId}`; }
function allocationKey(allocationId: string): string { return `ico:allocation:${allocationId}`; }
function walletKey(wallet: string): string { return `ico:wallet:${wallet.toLowerCase()}`; }
function txKey(hash: string): string { return `ico:tx:${hash.toLowerCase()}`; }

function makeId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function fmtDecimal(value: number): string {
	return value.toFixed(6).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isWalletValid(value: string, rail: "unykorn-l1" | "base"): boolean {
	if (rail === "base") return /^0x[a-fA-F0-9]{40}$/.test(value);
	return /^uny1_[a-z0-9]{16,}$/.test(value) || /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeWallet(value: string, rail: "unykorn-l1" | "base"): string {
	return rail === "base" ? value.toLowerCase() : value.trim().toLowerCase();
}

function isTxHash(value: string): boolean {
	return /^0x[a-fA-F0-9]{64}$/.test(value);
}

async function verifyBasePayment(
	env: IcoEnv,
	order: SaleOrder,
	method: PaymentMethod,
	txHash: string,
	payer: string,
): Promise<{ verified: boolean; error?: string; errorCode?: string }> {
	const rpcUrl = env.BASE_RPC_URL ?? BASE_RPC_URL_DEFAULT;
	const tokenAddress = (method.tokenAddress ?? env.BASE_USDC_ADDRESS ?? BASE_USDC_ADDRESS_DEFAULT).toLowerCase();

	const [receipt, tx] = await Promise.all([
		callRpc<JsonRpcReceipt>(rpcUrl, "eth_getTransactionReceipt", [txHash]),
		callRpc<JsonRpcTx>(rpcUrl, "eth_getTransactionByHash", [txHash]),
	]);

	if (!receipt || !tx) return { verified: false, error: "Transaction not found", errorCode: "tx_not_found" };
	if (receipt.status !== "0x1") return { verified: false, error: "Transaction failed", errorCode: "tx_failed" };
	if ((tx.from ?? "").toLowerCase() !== payer.toLowerCase()) {
		return { verified: false, error: "Payer does not match transaction sender", errorCode: "tx_mismatch" };
	}

	const expectedAmount = parseUnits(order.amountUsd, method.decimals);
	const payerTopic = topicAddress(payer);
	const receiverTopic = topicAddress(order.receiver);

	const transfer = receipt.logs.find((log) => {
		if (log.address.toLowerCase() !== tokenAddress) return false;
		if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) return false;
		if (log.topics[1]?.toLowerCase() !== payerTopic) return false;
		if (log.topics[2]?.toLowerCase() !== receiverTopic) return false;
		try {
			return BigInt(log.data) >= expectedAmount;
		} catch {
			return false;
		}
	});

	if (!transfer) {
		return { verified: false, error: "No matching USDC transfer found", errorCode: "tx_mismatch" };
	}

	return { verified: true };
}

async function verifyUnykornPayment(
	env: IcoEnv,
	order: SaleOrder,
	txHash: string,
	payer: string,
): Promise<{ verified: boolean; error?: string; errorCode?: string }> {
	const rpcUrl = env.UNYKORN_RPC_URL ?? UNYKORN_RPC_URL_DEFAULT;

	const [status, ethReceipt, ethTx, latestBlock] = await Promise.all([
		callRpc<L1TxStatus>(rpcUrl, "tx_getStatus", [txHash]).catch(() => null),
		callRpc<{ status?: string; blockNumber?: string }>(rpcUrl, "eth_getTransactionReceipt", [txHash]).catch(() => null),
		callRpc<JsonRpcTx>(rpcUrl, "eth_getTransactionByHash", [txHash]).catch(() => null),
		callRpc<{ height?: number; blockHeight?: number; number?: string }>(rpcUrl, "chain_getLatestBlock", []).catch(() => null),
	]);

	if (!status && !ethReceipt && !ethTx) {
		return { verified: false, error: "Transaction lookup unavailable", errorCode: "tx_lookup_unavailable" };
	}
	if (status?.status === "failed" || ethReceipt?.status === "0x0") {
		return { verified: false, error: status?.error ?? "Transaction failed", errorCode: "tx_failed" };
	}

	const currentHeight = latestBlock?.height ?? latestBlock?.blockHeight ?? (latestBlock?.number ? Number.parseInt(latestBlock.number, 16) : undefined);
	const txBlockHeight = status?.block_height ?? (ethReceipt?.blockNumber ? Number.parseInt(ethReceipt.blockNumber, 16) : undefined);
	if (currentHeight !== undefined && txBlockHeight !== undefined && (currentHeight - txBlockHeight + 1) < 1) {
		return { verified: false, error: "Waiting for confirmation", errorCode: "tx_pending" };
	}

	const txFrom = (ethTx?.from ?? status?.from ?? "").toLowerCase();
	const txTo = (ethTx?.to ?? status?.to ?? "").toLowerCase();
	if (txFrom && txFrom !== payer.toLowerCase()) {
		return { verified: false, error: "Payer does not match transaction sender", errorCode: "tx_mismatch" };
	}
	if (txTo && txTo !== order.receiver.toLowerCase()) {
		return { verified: false, error: "Receiver does not match treasury address", errorCode: "tx_mismatch" };
	}

	const observed = ethTx?.value ?? status?.value ?? status?.amount;
	if (!observed || !amountMatches(order.amountUsd, observed, 6)) {
		return { verified: false, error: "Payment amount does not satisfy invoice", errorCode: "tx_mismatch" };
	}

	return { verified: true };
}

async function callRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T | null> {
	const res = await fetch(rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});

	if (!res.ok) throw new Error(`RPC ${res.status}`);
	const json = await res.json() as { result?: T | null; error?: { message?: string } };
	if (json.error) throw new Error(json.error.message ?? "RPC error");
	return json.result ?? null;
}

function parseUnits(value: string, decimals: number): bigint {
	const [whole, fraction = ""] = value.split(".");
	const normalized = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
	return BigInt(`${whole || "0"}${normalized}`);
}

function topicAddress(address: string): string {
	return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function amountMatches(invoiceAmount: string, observedValue: string, decimals: number): boolean {
	try {
		const invoiceUnits = parseUnits(invoiceAmount, decimals);
		const observedUnits = observedValue.startsWith("0x") ? BigInt(observedValue) : parseUnits(observedValue, decimals);
		return observedUnits >= invoiceUnits;
	} catch {
		return false;
	}
}
