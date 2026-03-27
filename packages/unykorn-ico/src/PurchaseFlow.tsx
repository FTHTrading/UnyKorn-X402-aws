import { useEffect, useMemo, useState } from "react";
import {
  confirmSaleOrder,
  createSaleOrder,
  getIcoConfig,
  getSaleOrder,
  type AllocationRecord,
  type CreateOrderInput,
  type PaymentMethod,
  type SaleOrder,
  type SaleTier,
} from "./icoApi";

type FlowState = {
  config: Awaited<ReturnType<typeof getIcoConfig>> | null;
  loading: boolean;
  error: string | null;
};

const DEFAULT_FORM: CreateOrderInput = {
  buyerName: "",
  buyerEmail: "",
  buyerWallet: "",
  jurisdiction: "",
  tierId: "seed",
  paymentMethodId: "usdf-unykorn",
  amountUsd: 1000,
  acknowledgedRisk: false,
  notRestrictedPerson: false,
  acceptedTerms: false,
};

function fmtDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default function PurchaseFlow() {
  const [flow, setFlow] = useState<FlowState>({ config: null, loading: true, error: null });
  const [form, setForm] = useState<CreateOrderInput>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [order, setOrder] = useState<SaleOrder | null>(null);
  const [allocation, setAllocation] = useState<AllocationRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    getIcoConfig()
      .then((config) => {
        setFlow({ config, loading: false, error: null });
        if (config.paymentMethods.length > 0) {
          setForm((current) => ({
            ...current,
            paymentMethodId: config.paymentMethods[0].id,
          }));
        }
      })
      .catch((error: Error) => setFlow({ config: null, loading: false, error: error.message }));
  }, []);

  useEffect(() => {
    if (!order || order.status !== "pending_payment") return;

    const timer = setInterval(() => {
      getSaleOrder(order.orderId)
        .then(setOrder)
        .catch(() => undefined);
    }, 15000);

    return () => clearInterval(timer);
  }, [order]);

  const tiers = flow.config?.tiers ?? [];
  const methods = flow.config?.paymentMethods ?? [];
  const selectedTier = useMemo<SaleTier | undefined>(() => tiers.find((item) => item.id === form.tierId), [tiers, form.tierId]);
  const selectedMethod = useMemo<PaymentMethod | undefined>(() => methods.find((item) => item.id === form.paymentMethodId), [methods, form.paymentMethodId]);
  const preview = useMemo(() => {
    if (!selectedTier) return null;
    const base = form.amountUsd / selectedTier.priceUsd;
    const bonus = base * (selectedTier.bonusPct / 100);
    return {
      base: base.toFixed(2),
      bonus: bonus.toFixed(2),
      total: (base + bonus).toFixed(2),
    };
  }, [form.amountUsd, selectedTier]);

  async function submitOrder() {
    setSubmitting(true);
    setActionError(null);
    try {
      const result = await createSaleOrder(form);
      setOrder(result.order);
      setAllocation(null);
      setTxHash("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitConfirmation() {
    if (!order) return;
    setConfirming(true);
    setActionError(null);
    try {
      const result = await confirmSaleOrder(order.orderId, txHash, form.buyerWallet);
      setOrder(result.order);
      setAllocation(result.allocation);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Payment confirmation failed");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="section" id="checkout" style={{ paddingTop: 16 }}>
      <div className="container">
        <div className="sec-header">
          <h2>Direct <span className="grad-text">Sale Checkout</span></h2>
          <p>
            Real invoice flow. Direct wallet transfer. Real payment verification. Real allocation issuance.
            No cards. No custodial processor. No mocks.
          </p>
        </div>

        {flow.loading && <div className="glass-solid sale-panel">Loading sale configuration…</div>}
        {flow.error && <div className="glass-solid sale-panel sale-error">{flow.error}</div>}

        {flow.config && (
          <div className="sale-shell">
            <div className="glass-solid sale-panel">
              <div className="sale-panel-head">
                <div>
                  <h3>Reserve Allocation</h3>
                  <p>Open a live sale order and get payment instructions instantly.</p>
                </div>
                <span className="sale-live-pill">{flow.config.saleEnabled ? "Live" : "Offline"}</span>
              </div>

              <div className="sale-grid">
                <label className="sale-field">
                  <span>Full Name</span>
                  <input value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} placeholder="Investor / buyer name" />
                </label>
                <label className="sale-field">
                  <span>Email</span>
                  <input value={form.buyerEmail} onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })} placeholder="name@fund.com" />
                </label>
                <label className="sale-field sale-field-wide">
                  <span>Settlement Wallet</span>
                  <input value={form.buyerWallet} onChange={(e) => setForm({ ...form, buyerWallet: e.target.value })} placeholder={selectedMethod?.rail === "base" ? "0x..." : "uny1_..."} />
                </label>
                <label className="sale-field">
                  <span>Jurisdiction</span>
                  <input value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} placeholder="United States / UAE / Singapore" />
                </label>
                <label className="sale-field">
                  <span>Tier</span>
                  <select value={form.tierId} onChange={(e) => setForm({ ...form, tierId: e.target.value as CreateOrderInput["tierId"] })}>
                    {tiers.map((tier) => (
                      <option key={tier.id} value={tier.id} disabled={!tier.live}>{tier.label} · ${tier.priceUsd} · +{tier.bonusPct}% {tier.live ? "" : "(soon)"}</option>
                    ))}
                  </select>
                </label>
                <label className="sale-field">
                  <span>Payment Rail</span>
                  <select value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value as CreateOrderInput["paymentMethodId"] })}>
                    {methods.map((method) => (
                      <option key={method.id} value={method.id}>{method.label}</option>
                    ))}
                  </select>
                </label>
                <label className="sale-field">
                  <span>Investment Amount (USD)</span>
                  <input type="number" min={selectedTier?.minUsd ?? 100} max={selectedTier?.maxUsd ?? 25000} step="50" value={form.amountUsd} onChange={(e) => setForm({ ...form, amountUsd: Number(e.target.value) })} />
                </label>
              </div>

              <div className="sale-checks">
                <label><input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })} /> I accept the sale terms and direct-settlement flow.</label>
                <label><input type="checkbox" checked={form.notRestrictedPerson} onChange={(e) => setForm({ ...form, notRestrictedPerson: e.target.checked })} /> I am not a restricted / sanctioned participant.</label>
                <label><input type="checkbox" checked={form.acknowledgedRisk} onChange={(e) => setForm({ ...form, acknowledgedRisk: e.target.checked })} /> I understand this is a crypto asset purchase with execution risk.</label>
              </div>

              {preview && selectedTier && selectedMethod && (
                <div className="sale-preview glass">
                  <div>
                    <div className="sale-preview-label">Base Allocation</div>
                    <div className="sale-preview-value">{preview.base} UNY</div>
                  </div>
                  <div>
                    <div className="sale-preview-label">Tier Bonus</div>
                    <div className="sale-preview-value">+{preview.bonus} UNY</div>
                  </div>
                  <div>
                    <div className="sale-preview-label">Total Issued</div>
                    <div className="sale-preview-value grad-text">{preview.total} UNY</div>
                  </div>
                  <div>
                    <div className="sale-preview-label">Settlement</div>
                    <div className="sale-preview-value">{form.amountUsd.toFixed(2)} {selectedMethod.asset}</div>
                  </div>
                </div>
              )}

              <button className="btn-primary sale-submit" onClick={submitOrder} disabled={submitting || !flow.config.saleEnabled}>
                {submitting ? "Opening Order…" : "Open Live Sale Order"}
              </button>

              {actionError && <div className="sale-error-text">{actionError}</div>}
            </div>

            <div className="glass-solid sale-panel">
              <div className="sale-panel-head">
                <div>
                  <h3>Payment & Issuance</h3>
                  <p>Send funds directly, then submit the transaction hash for verification.</p>
                </div>
              </div>

              {!order && (
                <div className="sale-empty">
                  Open a sale order to get a real invoice ID, treasury address, and issuance quote.
                </div>
              )}

              {order && (
                <>
                  <div className="sale-order-meta glass">
                    <div><span>Order</span><strong>{order.orderId}</strong></div>
                    <div><span>Invoice</span><strong>{order.invoiceId}</strong></div>
                    <div><span>Status</span><strong className={`sale-status sale-status-${order.status}`}>{order.status.replace("_", " ")}</strong></div>
                    <div><span>Expires</span><strong>{fmtDate(order.expiresAt)}</strong></div>
                  </div>

                  <div className="sale-instructions">
                    <div className="sale-instruction-card glass">
                      <div className="sale-preview-label">Send Exactly</div>
                      <div className="sale-instruction-amount">{order.amountUsd} {order.settlementAsset}</div>
                      <div className="sale-preview-label">To Treasury</div>
                      <div className="sale-mono">{order.receiver}</div>
                    </div>
                    <div className="sale-instruction-card glass">
                      <div className="sale-preview-label">Allocation On Success</div>
                      <div className="sale-instruction-amount grad-text">{order.totalUny} UNY</div>
                      <div className="sale-preview-label">Tier</div>
                      <div>{order.tierLabel} · {order.baseUny} base + {order.bonusUny} bonus</div>
                    </div>
                  </div>

                  {order.status === "pending_payment" && (
                    <div className="sale-confirm">
                      <label className="sale-field sale-field-wide">
                        <span>Transaction Hash</span>
                        <input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Paste on-chain tx hash after sending funds" />
                      </label>
                      <button className="btn-primary sale-submit" onClick={submitConfirmation} disabled={confirming || !txHash.trim()}>
                        {confirming ? "Verifying Payment…" : "Verify Payment & Issue Allocation"}
                      </button>
                    </div>
                  )}

                  {allocation && (
                    <div className="sale-success glass-glow">
                      <div className="sale-success-title">Allocation Issued</div>
                      <div className="sale-success-grid">
                        <div><span>Allocation ID</span><strong>{allocation.allocationId}</strong></div>
                        <div><span>Receipt</span><strong>{allocation.receiptId}</strong></div>
                        <div><span>Paid</span><strong>{allocation.amountPaid} {allocation.settlementAsset}</strong></div>
                        <div><span>Issued</span><strong>{allocation.totalUny} UNY</strong></div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
