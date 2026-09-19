/**
 * @unykorn/x402-standard
 *
 * Canonical HTTP 402 / x402 rail for all UnyKorn web3 properties.
 * Asset: ATP on Apostle Chain (chain_id 7332).
 * Humans: Stripe at gateway.unykorn.org/buy
 * Agents: X-Payment-Receipt header with Apostle tx_hash
 */

export const X402_VERSION = 1;
export const CHAIN_ID = 7332;
export const ATP_DECIMALS = 18n;

export const DEFAULT_PAY_TO = "agent:87724c76-da93-4b1a-9fa6-271ba856338e";
export const DEFAULT_APOSTLE_URL = "https://apostle.unykorn.org";
export const DEFAULT_FACILITATOR_URL = "https://x402.unykorn.org";
export const BUY_ATP_URL = "https://gateway.unykorn.org/buy";
export const ATP_DOCS_URL = "https://genesis402.com/atp.html";
export const UNIFIED_LEDGER_URL = "https://x402-ledger-worker.kevanbtc.workers.dev/append";
export const OPS_EVENTS_URL = "https://ops-hub-worker.kevanbtc.workers.dev/events";

export function normalizePayTo(wallet: string): string {
  const w = wallet.trim();
  return w.startsWith("agent:") ? w : `agent:${w}`;
}

/** Convert decimal ATP string to str_u128 (18 decimals). */
export function atpToRaw(atp: string | number): string {
  const [whole, frac = ""] = String(atp).split(".");
  const fracPadded = frac.padEnd(18, "0").slice(0, 18);
  return (BigInt(whole || "0") * 10n ** ATP_DECIMALS + BigInt(fracPadded || "0")).toString();
}

export interface X402PaymentMethod {
  asset: "ATP";
  chain: "Apostle Chain";
  chain_id: typeof CHAIN_ID;
  amount: string;
  amount_raw: string;
  payTo: string;
  memo_prefix: string;
}

export interface X402ConfigResponse {
  x402_version: number;
  service: string;
  free_mode: boolean;
  buy_atp_url: string;
  docs_url: string;
  facilitator_url: string;
  apostle_url: string;
  receipt_header: string;
  agent_id_header: string;
  version_header: string;
  payment_methods: X402PaymentMethod[];
  how_to_pay: string[];
  endpoints?: Array<{ path: string; amount_atp: string; memo: string }>;
}

export function buildX402Config(opts: {
  service: string;
  memoPrefix: string;
  payTo?: string;
  defaultAmountAtp?: string;
  freeMode?: boolean;
  endpoints?: Array<{ path: string; amount_atp: string; memo?: string }>;
  apostleUrl?: string;
  facilitatorUrl?: string;
}): X402ConfigResponse {
  const payTo = normalizePayTo(opts.payTo ?? DEFAULT_PAY_TO);
  const amount = opts.defaultAmountAtp ?? "0.10";
  const memoPrefix = opts.memoPrefix;

  return {
    x402_version: X402_VERSION,
    service: opts.service,
    free_mode: opts.freeMode === true,
    buy_atp_url: BUY_ATP_URL,
    docs_url: ATP_DOCS_URL,
    facilitator_url: opts.facilitatorUrl ?? DEFAULT_FACILITATOR_URL,
    apostle_url: opts.apostleUrl ?? DEFAULT_APOSTLE_URL,
    receipt_header: "X-Payment-Receipt",
    agent_id_header: "Agent-Id",
    version_header: "X-402-Version",
    payment_methods: [
      {
        asset: "ATP",
        chain: "Apostle Chain",
        chain_id: CHAIN_ID,
        amount,
        amount_raw: atpToRaw(amount),
        payTo,
        memo_prefix: memoPrefix,
      },
    ],
    how_to_pay: [
      `1. Buy ATP at ${BUY_ATP_URL} or send ATP on Apostle Chain (${CHAIN_ID})`,
      `2. Pay to ${payTo} with memo starting ${memoPrefix}`,
      "3. Retry the API call with header X-Payment-Receipt: <tx_hash>",
      "4. Optional: Agent-Id: agent:<your-uuid>, X-402-Version: 1",
    ],
    endpoints: opts.endpoints?.map((e) => ({
      path: e.path,
      amount_atp: e.amount_atp,
      memo: e.memo ?? `${memoPrefix}${e.path}`,
    })),
  };
}

export interface X402Descriptor {
  version: 1;
  asset: "ATP";
  amount: string;
  amount_human: string;
  chain_id: typeof CHAIN_ID;
  payTo: string;
  memo: string;
  expires: string;
  nonce: string;
  resource: string;
}

export function build402Descriptor(opts: {
  amountAtp: string;
  payTo?: string;
  resource: string;
  memo: string;
  ttlMs?: number;
}): X402Descriptor {
  const payTo = normalizePayTo(opts.payTo ?? DEFAULT_PAY_TO);
  const amountRaw = atpToRaw(opts.amountAtp);
  return {
    version: 1,
    asset: "ATP",
    amount: amountRaw,
    amount_human: `${opts.amountAtp} ATP`,
    chain_id: CHAIN_ID,
    payTo,
    memo: opts.memo,
    expires: new Date(Date.now() + (opts.ttlMs ?? 300_000)).toISOString(),
    nonce: `x402-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    resource: opts.resource,
  };
}

export function build402Body(opts: {
  amountAtp: string;
  payTo?: string;
  resource: string;
  memo: string;
  service?: string;
  message?: string;
}): Record<string, unknown> {
  const descriptor = build402Descriptor(opts);
  return {
    ok: false,
    error: "payment_required",
    payment_required: true,
    message:
      opts.message ??
      `Payment required: ${opts.amountAtp} ATP on Apostle Chain (${CHAIN_ID})`,
    service: opts.service,
    payment_options: {
      x402_atp: {
        description: `Pay ${opts.amountAtp} ATP on Apostle Chain`,
        descriptor,
        buy_atp_url: BUY_ATP_URL,
        instructions: [
          `Send ${opts.amountAtp} ATP to ${descriptor.payTo}`,
          `Memo: ${opts.memo}`,
          "Retry with header X-Payment-Receipt: <tx_hash>",
        ],
      },
    },
  };
}

export interface VerifyReceiptResult {
  valid: boolean;
  reason: string;
}

function normHash(h: string): string {
  return h.replace(/^0x/i, "").toLowerCase();
}

/** Verify ATP payment via facilitator and/or Apostle Chain receipts. */
export async function verifyAtpReceipt(opts: {
  txHash: string;
  expectedAmountRaw: string;
  payTo?: string;
  apostleUrl?: string;
  facilitatorUrl?: string;
}): Promise<VerifyReceiptResult> {
  const facilitator = (opts.facilitatorUrl ?? DEFAULT_FACILITATOR_URL).replace(/\/$/, "");

  try {
    const r = await fetch(`${facilitator}/v1/x402/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_hash: opts.txHash,
        expected_amount: opts.expectedAmountRaw,
      }),
    });
    if (r.ok) {
      const d = (await r.json()) as { valid?: boolean; reason?: string };
      if (d.valid) return { valid: true, reason: "facilitator_verified" };
    }
  } catch {
    // fall through to chain lookup
  }

  const payTo = (opts.payTo ?? DEFAULT_PAY_TO).replace(/^agent:/, "");
  const chainUrl = (opts.apostleUrl ?? DEFAULT_APOSTLE_URL).replace(/\/$/, "");

  try {
    const r = await fetch(`${chainUrl}/v1/receipts?to=${encodeURIComponent(payTo)}`);
    if (!r.ok) return { valid: false, reason: `chain_${r.status}` };
    const data = (await r.json()) as {
      receipts?: Array<{ tx_hash: string; amount: string }>;
    };
    const want = normHash(opts.txHash);
    const receipt = (data.receipts ?? []).find((rec) => normHash(rec.tx_hash) === want);
    if (!receipt) return { valid: false, reason: "tx_not_found" };
    if (BigInt(receipt.amount) < BigInt(opts.expectedAmountRaw)) {
      return {
        valid: false,
        reason: `insufficient: got ${receipt.amount} need ${opts.expectedAmountRaw}`,
      };
    }
    return { valid: true, reason: "apostle_chain_verified" };
  } catch (err) {
    return { valid: false, reason: `chain_error: ${String(err)}` };
  }
}

export interface X402GateResult {
  allowed: boolean;
  paid: boolean;
  status: number;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/** Check request headers for x402 payment. Returns 402 payload when payment missing/invalid. */
export async function checkX402Headers(
  req: Request,
  opts: {
    amountAtp: string;
    resource: string;
    memo: string;
    payTo?: string;
    freeMode?: boolean;
    service?: string;
    apostleUrl?: string;
    facilitatorUrl?: string;
  }
): Promise<X402GateResult> {
  if (opts.freeMode) {
    return { allowed: true, paid: false, status: 200 };
  }

  const receipt =
    req.headers.get("X-Payment-Receipt") ?? req.headers.get("x-payment-receipt");

  if (!receipt) {
    return {
      allowed: false,
      paid: false,
      status: 402,
      body: build402Body({
        amountAtp: opts.amountAtp,
        payTo: opts.payTo,
        resource: opts.resource,
        memo: opts.memo,
        service: opts.service,
      }),
      headers: {
        "WWW-Authenticate": "x402",
        "X-402-Version": "1",
        "Cache-Control": "no-store",
      },
    };
  }

  const verify = await verifyAtpReceipt({
    txHash: receipt,
    expectedAmountRaw: atpToRaw(opts.amountAtp),
    payTo: opts.payTo,
    apostleUrl: opts.apostleUrl,
    facilitatorUrl: opts.facilitatorUrl,
  });

  if (!verify.valid) {
    return {
      allowed: false,
      paid: false,
      status: 402,
      body: {
        ok: false,
        error: "payment_invalid",
        payment_required: true,
        reason: verify.reason,
      },
      headers: {
        "WWW-Authenticate": "x402",
        "X-402-Version": "1",
        "Cache-Control": "no-store",
      },
    };
  }

  return { allowed: true, paid: true, status: 200 };
}

/** Append verified payment to unified running ledger (all properties). */
export async function appendToUnifiedLedger(entry: {
  service: string;
  path: string;
  amount_atp: string;
  apostle_tx_hash?: string;
  stripe_session?: string;
  memo: string;
  verify_reason: string;
  payer?: string;
  source?: string;
  ledgerUrl?: string;
}): Promise<{ ok: boolean; payment_id?: string }> {
  const url = (entry.ledgerUrl ?? UNIFIED_LEDGER_URL).replace(/\/$/, "");
  const ledgerEndpoint = url.endsWith("/append") ? url : `${url}/append`;
  try {
    const payment_id = `x402-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetch(ledgerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_id,
        service: entry.service,
        path: entry.path,
        amount_atp: entry.amount_atp,
        apostle_tx_hash: entry.apostle_tx_hash,
        stripe_session: entry.stripe_session,
        memo: entry.memo,
        verify_reason: entry.verify_reason,
        payer: entry.payer ?? "unknown",
        payee: DEFAULT_PAY_TO,
        source: entry.source ?? entry.service,
      }),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { payment_id?: string };
    return { ok: true, payment_id: data.payment_id ?? payment_id };
  } catch {
    return { ok: false };
  }
}
