const ICO_API_BASE = "https://api.unykorn.org/ico/v1";

export type TierId = "seed" | "private" | "public";
export type PaymentMethodId = "usdf-unykorn" | "usdc-base";

export interface SaleTier {
  id: TierId;
  label: string;
  priceUsd: number;
  bonusPct: number;
  minUsd: number;
  maxUsd: number;
  live: boolean;
  allocation: string;
}

export interface PaymentMethod {
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

export interface SaleOrder {
  orderId: string;
  invoiceId: string;
  nonce: string;
  tierId: TierId;
  tierLabel: string;
  buyerName: string;
  buyerEmail: string;
  buyerWallet: string;
  jurisdiction: string;
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

export interface AllocationRecord {
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

export interface IcoConfig {
  saleEnabled: boolean;
  tiers: SaleTier[];
  paymentMethods: PaymentMethod[];
  terms: {
    riskDisclosure: boolean;
    whitelistMode: boolean;
    settlement: string;
  };
}

export interface CreateOrderInput {
  buyerName: string;
  buyerEmail: string;
  buyerWallet: string;
  jurisdiction: string;
  tierId: TierId;
  paymentMethodId: PaymentMethodId;
  amountUsd: number;
  acknowledgedRisk: boolean;
  notRestrictedPerson: boolean;
  acceptedTerms: boolean;
}

export async function getIcoConfig(): Promise<IcoConfig> {
  const res = await fetch(`${ICO_API_BASE}/config`);
  if (!res.ok) throw new Error("Failed to load sale config");
  return res.json() as Promise<IcoConfig>;
}

export async function createSaleOrder(input: CreateOrderInput): Promise<{ order: SaleOrder; payment: PaymentMethod & { amount: string; expiresAt: string; invoiceId: string; nonce: string } }> {
  const res = await fetch(`${ICO_API_BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? "Failed to create sale order"));
  return data as unknown as { order: SaleOrder; payment: PaymentMethod & { amount: string; expiresAt: string; invoiceId: string; nonce: string } };
}

export async function getSaleOrder(orderId: string): Promise<SaleOrder> {
  const res = await fetch(`${ICO_API_BASE}/orders/${orderId}`);
  const data = await res.json() as { order?: SaleOrder; error?: string };
  if (!res.ok || !data.order) throw new Error(data.error ?? "Failed to load sale order");
  return data.order;
}

export async function confirmSaleOrder(orderId: string, txHash: string, payer?: string): Promise<{ order: SaleOrder; allocation: AllocationRecord }> {
  const res = await fetch(`${ICO_API_BASE}/orders/${orderId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txHash, payer }),
  });
  const data = await res.json() as { order?: SaleOrder; allocation?: AllocationRecord; error?: string };
  if (!res.ok || !data.order || !data.allocation) throw new Error(data.error ?? "Failed to confirm payment");
  return { order: data.order, allocation: data.allocation };
}

export async function getWalletAllocations(wallet: string): Promise<AllocationRecord[]> {
  const res = await fetch(`${ICO_API_BASE}/allocations/${encodeURIComponent(wallet)}`);
  const data = await res.json() as { allocations?: AllocationRecord[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to load allocations");
  return data.allocations ?? [];
}
