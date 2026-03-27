import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  confirmSaleOrder,
  createSaleOrder,
  getIcoConfig,
  getSaleOrder,
  getWalletAllocations,
  type AllocationRecord,
  type CreateOrderInput,
  type PaymentMethod,
  type SaleOrder,
  type SaleTier,
} from "./icoApi";

const ORDER_STORAGE_KEY = "unykorn.ico.lastOrderId";
const WALLET_STORAGE_KEY = "unykorn.ico.lastWallet";

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

function getTimeRemaining(value: string): string {
  const diff = Math.max(0, new Date(value).getTime() - Date.now());
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isTxHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function isValidWallet(value: string, rail?: string): boolean {
  if (rail === "base") return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
  return /^(uny1_[a-z0-9]{16,}|0x[a-fA-F0-9]{40})$/.test(value.trim());
}

/** Generate a QR code as an SVG data URI using a minimal qr algorithm */
function generateQrDataUri(data: string): string {
  // Use a Google Charts API fallback for QR generation (works without deps)
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}&bgcolor=0a0a12&color=f0f0f8&format=svg`;
}

function makeProofPacket(order: SaleOrder, allocation: AllocationRecord | null) {
  return {
    exportedAt: new Date().toISOString(),
    order,
    allocation,
  };
}

function getExpiryProgress(order: SaleOrder): number {
  const created = new Date(order.createdAt).getTime();
  const expires = new Date(order.expiresAt).getTime();
  const now = Date.now();
  if (expires <= created) return 100;
  const ratio = ((now - created) / (expires - created)) * 100;
  return Math.max(0, Math.min(100, ratio));
}

const JURISDICTION_OPTIONS = [
  { value: "", label: "Select your jurisdiction" },
  { value: "United States", label: "United States" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Canada", label: "Canada" },
  { value: "Australia", label: "Australia" },
  { value: "Singapore", label: "Singapore" },
  { value: "Switzerland", label: "Switzerland" },
  { value: "Germany", label: "Germany" },
  { value: "France", label: "France" },
  { value: "Japan", label: "Japan" },
  { value: "South Korea", label: "South Korea" },
  { value: "UAE", label: "United Arab Emirates" },
  { value: "Brazil", label: "Brazil" },
  { value: "India", label: "India" },
  { value: "Mexico", label: "Mexico" },
  { value: "Hong Kong", label: "Hong Kong" },
  { value: "Netherlands", label: "Netherlands" },
  { value: "Other", label: "Other (not a restricted jurisdiction)" },
] as const;

const BLOCKED_JURISDICTION_NAMES = new Set([
  "north korea", "iran", "syria", "cuba", "russia",
  "belarus", "myanmar", "burma", "venezuela", "sudan", "somalia", "yemen",
  "crimea", "donetsk", "luhansk",
]);

export default function PurchaseFlow() {
  const [flow, setFlow] = useState<FlowState>({ config: null, loading: true, error: null });
  const [form, setForm] = useState<CreateOrderInput>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [restoreOrderId, setRestoreOrderId] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [order, setOrder] = useState<SaleOrder | null>(null);
  const [allocation, setAllocation] = useState<AllocationRecord | null>(null);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState<string>("");
  const [polling, setPolling] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

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

        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const queryOrderId = params.get("orderId");
          const savedWallet = window.localStorage.getItem(WALLET_STORAGE_KEY);
          const savedOrderId = queryOrderId || window.localStorage.getItem(ORDER_STORAGE_KEY);
          if (savedWallet) {
            setForm((current) => ({ ...current, buyerWallet: savedWallet }));
            void loadAllocations(savedWallet);
          }
          if (savedOrderId) {
            setRestoreOrderId(savedOrderId);
            void getSaleOrder(savedOrderId)
              .then(setOrder)
              .catch(() => window.localStorage.removeItem(ORDER_STORAGE_KEY));
          }
        }
      })
      .catch((error: Error) => setFlow({ config: null, loading: false, error: error.message }));
  }, []);

  useEffect(() => {
    if (!order || order.status !== "pending_payment") return;

    setPolling(true);
    const timer = setInterval(() => {
      getSaleOrder(order.orderId)
        .then((updated) => {
          setOrder(updated);
          if (updated.status !== "pending_payment") setPolling(false);
        })
        .catch(() => undefined);
    }, 10000);

    return () => { clearInterval(timer); setPolling(false); };
  }, [order?.orderId, order?.status]);

  // Live countdown ticker (updates every second)
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!order || order.status !== "pending_payment") {
      setCountdown("");
      return;
    }
    const tick = () => setCountdown(getTimeRemaining(order.expiresAt));
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [order?.orderId, order?.status, order?.expiresAt]);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (order?.orderId) {
      url.searchParams.set("orderId", order.orderId);
    } else {
      url.searchParams.delete("orderId");
    }
    window.history.replaceState({}, "", url.toString());
  }, [order?.orderId]);

  const tiers = flow.config?.tiers ?? [];
  const methods = flow.config?.paymentMethods ?? [];
  const selectedTier = useMemo<SaleTier | undefined>(() => tiers.find((item) => item.id === form.tierId), [tiers, form.tierId]);
  const selectedMethod = useMemo<PaymentMethod | undefined>(() => methods.find((item) => item.id === form.paymentMethodId), [methods, form.paymentMethodId]);
  const activeMethod = useMemo<PaymentMethod | undefined>(() => methods.find((item) => item.id === order?.paymentMethodId) ?? selectedMethod, [methods, order?.paymentMethodId, selectedMethod]);
  const txHashValid = useMemo(() => txHash.trim().length === 0 || isTxHash(txHash), [txHash]);

  // Inline validation errors
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (touched.buyerName && !form.buyerName.trim()) errors.buyerName = "Full name is required";
    if (touched.buyerEmail && form.buyerEmail.trim() && !isValidEmail(form.buyerEmail)) errors.buyerEmail = "Enter a valid email address";
    if (touched.buyerEmail && !form.buyerEmail.trim()) errors.buyerEmail = "Email is required";
    if (touched.buyerWallet && form.buyerWallet.trim() && !isValidWallet(form.buyerWallet, selectedMethod?.rail)) {
      errors.buyerWallet = selectedMethod?.rail === "base" ? "Must be a valid 0x Ethereum address" : "Must be a valid UnyKorn or 0x address";
    }
    if (touched.buyerWallet && !form.buyerWallet.trim()) errors.buyerWallet = "Settlement wallet is required";
    if (touched.jurisdiction && !form.jurisdiction) errors.jurisdiction = "Select your jurisdiction";
    if (touched.amountUsd && selectedTier) {
      if (form.amountUsd < selectedTier.minUsd) errors.amountUsd = `Minimum investment is $${selectedTier.minUsd}`;
      if (form.amountUsd > selectedTier.maxUsd) errors.amountUsd = `Maximum investment is $${selectedTier.maxUsd}`;
    }
    return errors;
  }, [touched, form, selectedMethod?.rail, selectedTier]);

  const formComplete = useMemo(() => {
    return (
      form.buyerName.trim().length > 0 &&
      isValidEmail(form.buyerEmail) &&
      isValidWallet(form.buyerWallet, selectedMethod?.rail) &&
      form.jurisdiction.length > 0 &&
      form.acceptedTerms &&
      form.notRestrictedPerson &&
      form.acknowledgedRisk &&
      selectedTier !== undefined &&
      form.amountUsd >= (selectedTier?.minUsd ?? 0) &&
      form.amountUsd <= (selectedTier?.maxUsd ?? Infinity) &&
      Object.keys(validationErrors).length === 0
    );
  }, [form, selectedMethod?.rail, selectedTier, validationErrors]);
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

  useEffect(() => {
    if (!selectedTier) return;
    setForm((current) => {
      const clamped = Math.min(selectedTier.maxUsd, Math.max(selectedTier.minUsd, current.amountUsd));
      return clamped === current.amountUsd ? current : { ...current, amountUsd: clamped };
    });
  }, [selectedTier]);

  async function loadAllocations(wallet: string) {
    if (!wallet.trim()) return;
    setLoadingAllocations(true);
    try {
      const records = await getWalletAllocations(wallet.trim());
      setAllocations(records);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to load allocations");
    } finally {
      setLoadingAllocations(false);
    }
  }

  async function restoreOrder() {
    if (!restoreOrderId.trim()) return;
    setRestoring(true);
    setActionError(null);
    try {
      const restored = await getSaleOrder(restoreOrderId.trim());
      setOrder(restored);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ORDER_STORAGE_KEY, restored.orderId);
        window.localStorage.setItem(WALLET_STORAGE_KEY, restored.buyerWallet);
      }
      setForm((current) => ({ ...current, buyerWallet: restored.buyerWallet }));
      await loadAllocations(restored.buyerWallet);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to restore order");
    } finally {
      setRestoring(false);
    }
  }

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied`);
    } catch {
      setCopyMessage(`Copy ${label.toLowerCase()} manually`);
    }
  }

  function clearSavedState() {
    setOrder(null);
    setAllocation(null);
    setTxHash("");
    setRestoreOrderId("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ORDER_STORAGE_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete("orderId");
      window.history.replaceState({}, "", url.toString());
    }
  }

  function downloadProofPacket() {
    if (!order) return;
    const packet = makeProofPacket(order, allocation);
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${order.orderId}-proof.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setCopyMessage("Proof packet downloaded");
  }

  function downloadPaymentInstructions() {
    if (!order) return;
    const content = [
      "UnyKorn ICO Payment Instructions",
      `Order ID: ${order.orderId}`,
      `Invoice ID: ${order.invoiceId}`,
      `Tier: ${order.tierLabel}`,
      `Amount Due: ${order.amountUsd} ${order.settlementAsset}`,
      `Receiver: ${order.receiver}`,
      `Buyer Wallet: ${order.buyerWallet}`,
      `Created At: ${order.createdAt}`,
      `Expires At: ${order.expiresAt}`,
      `Allocation On Success: ${order.totalUny} UNY`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${order.orderId}-payment-instructions.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setCopyMessage("Payment instructions downloaded");
  }

  async function submitOrder() {
    setSubmitting(true);
    setActionError(null);
    try {
      const result = await createSaleOrder(form);
      setOrder(result.order);
      setAllocation(null);
      setTxHash("");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ORDER_STORAGE_KEY, result.order.orderId);
        window.localStorage.setItem(WALLET_STORAGE_KEY, result.order.buyerWallet);
      }
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
      setAllocations((current) => [result.allocation, ...current.filter((item) => item.allocationId !== result.allocation.allocationId)]);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(WALLET_STORAGE_KEY, result.allocation.wallet);
      }
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
            No cards. No custodial processor. Fully compliant.
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
                  <input value={form.buyerName} onBlur={() => markTouched("buyerName")} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} placeholder="Investor / buyer name" className={validationErrors.buyerName ? "sale-input-error" : ""} />
                  {validationErrors.buyerName && <span className="sale-field-error">{validationErrors.buyerName}</span>}
                </label>
                <label className="sale-field">
                  <span>Email</span>
                  <input value={form.buyerEmail} onBlur={() => markTouched("buyerEmail")} onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })} placeholder="name@fund.com" className={validationErrors.buyerEmail ? "sale-input-error" : ""} />
                  {validationErrors.buyerEmail && <span className="sale-field-error">{validationErrors.buyerEmail}</span>}
                </label>
                <label className="sale-field sale-field-wide">
                  <span>Settlement Wallet</span>
                  <input value={form.buyerWallet} onBlur={() => markTouched("buyerWallet")} onChange={(e) => setForm({ ...form, buyerWallet: e.target.value })} placeholder={selectedMethod?.rail === "base" ? "0x..." : "uny1_..."} className={validationErrors.buyerWallet ? "sale-input-error" : ""} />
                  {validationErrors.buyerWallet && <span className="sale-field-error">{validationErrors.buyerWallet}</span>}
                </label>
                <label className="sale-field">
                  <span>Jurisdiction</span>
                  <select value={form.jurisdiction} onBlur={() => markTouched("jurisdiction")} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} className={validationErrors.jurisdiction ? "sale-input-error" : ""}>
                    {JURISDICTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {validationErrors.jurisdiction && <span className="sale-field-error">{validationErrors.jurisdiction}</span>}
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
                  <input type="number" min={selectedTier?.minUsd ?? 100} max={selectedTier?.maxUsd ?? 25000} step="50" value={form.amountUsd} onBlur={() => markTouched("amountUsd")} onChange={(e) => setForm({ ...form, amountUsd: Number(e.target.value) })} className={validationErrors.amountUsd ? "sale-input-error" : ""} />
                  {validationErrors.amountUsd && <span className="sale-field-error">{validationErrors.amountUsd}</span>}
                </label>
              </div>

              <div className="sale-compliance-notice glass">
                <div className="sale-compliance-badge">Compliance</div>
                <p className="sale-compliance-text">
                  This token sale operates under a direct-settlement model with no custodial intermediary.
                  All transactions are on-chain and irreversible. UNY tokens are not registered securities
                  under any jurisdiction. Participation is prohibited from OFAC/UN-sanctioned jurisdictions
                  including North Korea, Iran, Syria, Cuba, Russia, Belarus, Myanmar, Venezuela, Sudan, Somalia, and Yemen.
                </p>
                {flow.config?.terms?.purchaseAgreement && (
                  <p className="sale-compliance-text"><strong>Purchase Agreement:</strong> {flow.config.terms.purchaseAgreement}</p>
                )}
              </div>

              <div className="sale-checks">
                <label>
                  <input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })} />
                  I have read and accept the UnyKorn Token Purchase Agreement, including the direct-settlement flow, lock-up terms, and refund policy (no refunds after on-chain confirmation).
                </label>
                <label>
                  <input type="checkbox" checked={form.notRestrictedPerson} onChange={(e) => setForm({ ...form, notRestrictedPerson: e.target.checked })} />
                  I am not a citizen, resident, or tax person of any OFAC/UN-sanctioned jurisdiction. I am not acting on behalf of any sanctioned entity or SDN-listed individual.
                </label>
                <label>
                  <input type="checkbox" checked={form.acknowledgedRisk} onChange={(e) => setForm({ ...form, acknowledgedRisk: e.target.checked })} />
                  I understand this is a purchase of digital tokens on a custom L1 blockchain. Token value may decrease to zero. I am investing only funds I can afford to lose entirely.
                </label>
              </div>

              <div className="sale-inline-actions">
                <button type="button" className="btn-outline sale-secondary-btn" onClick={() => void loadAllocations(form.buyerWallet)} disabled={loadingAllocations || !form.buyerWallet.trim()}>
                  {loadingAllocations ? "Loading Allocations…" : "Load My Allocations"}
                </button>
                {order && <span className="sale-helper-text">Active order saved in-browser for this wallet.</span>}
              </div>

              <div className="sale-restore glass">
                <label className="sale-field sale-field-wide">
                  <span>Restore Existing Order</span>
                  <input value={restoreOrderId} onChange={(e) => setRestoreOrderId(e.target.value)} placeholder="Paste order ID to restore checkout state" />
                </label>
                <button type="button" className="btn-outline sale-secondary-btn" onClick={() => void restoreOrder()} disabled={restoring || !restoreOrderId.trim()}>
                  {restoring ? "Restoring…" : "Restore Order"}
                </button>
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

              <button className="btn-primary sale-submit" onClick={submitOrder} disabled={submitting || !flow.config.saleEnabled || !formComplete}>
                {submitting ? "Opening Order…" : !formComplete ? "Complete All Fields" : "Open Live Sale Order"}
              </button>

              {actionError && <div className="sale-error-text">{actionError}</div>}
              {copyMessage && <div className="sale-helper-text">{copyMessage}</div>}
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
                    <div><span>Time Remaining</span><strong className={countdown && parseInt(countdown) < 5 ? "sale-countdown-warn" : "sale-countdown"}>{order.status === "pending_payment" ? countdown || getTimeRemaining(order.expiresAt) : "Completed"}</strong></div>
                    <div><span>Rail</span><strong>{activeMethod?.label ?? order.settlementRail}</strong></div>
                    {polling && <div className="sale-polling-indicator"><span className="sale-pulse" /> Checking for updates…</div>}
                  </div>

                  <div className="sale-action-row">
                    <button type="button" className="btn-outline sale-mini-btn" onClick={() => void copyValue("Order ID", order.orderId)}>Copy Order ID</button>
                    <button type="button" className="btn-outline sale-mini-btn" onClick={() => void copyValue("Invoice ID", order.invoiceId)}>Copy Invoice ID</button>
                    <button type="button" className="btn-outline sale-mini-btn" onClick={() => void copyValue("Treasury Address", order.receiver)}>Copy Treasury</button>
                    <button type="button" className="btn-outline sale-mini-btn" onClick={() => void copyValue("Amount", `${order.amountUsd} ${order.settlementAsset}`)}>Copy Amount</button>
                    <button type="button" className="btn-outline sale-mini-btn" onClick={() => void copyValue("Recovery Link", `${window.location.origin}${window.location.pathname}?orderId=${encodeURIComponent(order.orderId)}`)}>Copy Recovery Link</button>
                    <button type="button" className="btn-outline sale-mini-btn" onClick={downloadPaymentInstructions}>Download Instructions</button>
                    <button type="button" className="btn-outline sale-mini-btn" onClick={downloadProofPacket}>Download Proof</button>
                    <button type="button" className="btn-outline sale-mini-btn" onClick={clearSavedState}>Clear Session</button>
                  </div>

                  <div className="sale-order-health glass">
                    <div className="sale-order-health-head">
                      <span>Order Window</span>
                      <strong>{order.status === "pending_payment" ? `${Math.round(100 - getExpiryProgress(order))}% remaining` : "Closed"}</strong>
                    </div>
                    <div className="sale-order-health-bar">
                      <div className="sale-order-health-fill" style={{ width: `${getExpiryProgress(order)}%` }} />
                    </div>
                  </div>

                  <div className="sale-steps glass">
                    <div className="sale-step"><span>1</span><p>Send the exact amount shown below from the wallet you entered.</p></div>
                    <div className="sale-step"><span>2</span><p>Wait for network confirmation, then paste the transaction hash.</p></div>
                    <div className="sale-step"><span>3</span><p>Verification issues the allocation record and stores it under your wallet.</p></div>
                  </div>

                  <div className="sale-timeline glass">
                    <div className={`sale-timeline-item ${order.createdAt ? "is-complete" : ""}`}>
                      <span />
                      <div>
                        <strong>Order Opened</strong>
                        <p>{fmtDate(order.createdAt)}</p>
                      </div>
                    </div>
                    <div className={`sale-timeline-item ${order.status !== "cancelled" ? "is-complete" : ""}`}>
                      <span />
                      <div>
                        <strong>Awaiting Payment</strong>
                        <p>{order.status === "pending_payment" ? "Waiting for transfer and tx hash submission." : "Payment window processed."}</p>
                      </div>
                    </div>
                    <div className={`sale-timeline-item ${order.status === "paid" ? "is-complete" : ""}`}>
                      <span />
                      <div>
                        <strong>Allocation Issued</strong>
                        <p>{order.paidAt ? fmtDate(order.paidAt) : "Will populate after on-chain verification succeeds."}</p>
                      </div>
                    </div>
                  </div>

                  <div className="sale-instructions">
                    <div className="sale-instruction-card glass">
                      <div className="sale-preview-label">Send Exactly</div>
                      <div className="sale-instruction-amount">{order.amountUsd} {order.settlementAsset}</div>
                      <div className="sale-preview-label">To Treasury</div>
                      <div className="sale-mono">{order.receiver}</div>
                      <div className="sale-qr-wrap">
                        <img src={generateQrDataUri(order.receiver)} alt="Treasury QR" className="sale-qr" loading="lazy" />
                        <span className="sale-qr-label">Scan to copy address</span>
                      </div>
                    </div>
                    <div className="sale-instruction-card glass">
                      <div className="sale-preview-label">Allocation On Success</div>
                      <div className="sale-instruction-amount grad-text">{order.totalUny} UNY</div>
                      <div className="sale-preview-label">Tier</div>
                      <div>{order.tierLabel} · {order.baseUny} base + {order.bonusUny} bonus</div>
                      <div className="sale-instruction-meta">
                        <div><span className="sale-preview-label">Invoice</span><span className="sale-mono">{order.invoiceId}</span></div>
                        <div><span className="sale-preview-label">Nonce</span><span className="sale-mono">{order.nonce}</span></div>
                      </div>
                    </div>
                  </div>

                  {order.status === "pending_payment" && (
                    <div className="sale-confirm">
                      <label className="sale-field sale-field-wide">
                        <span>Transaction Hash</span>
                        <input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Paste on-chain tx hash after sending funds" />
                      </label>
                      {!txHashValid && <div className="sale-error-text">Transaction hash must be a 0x-prefixed 64-byte hash.</div>}
                      {activeMethod && isTxHash(txHash) && activeMethod.explorerTxBase.includes("/tx/") && (
                        <a className="sale-explorer-link" href={`${activeMethod.explorerTxBase}${txHash.trim()}`} target="_blank" rel="noreferrer">
                          Open transaction in explorer
                        </a>
                      )}
                      <button className="btn-primary sale-submit" onClick={submitConfirmation} disabled={confirming || !txHash.trim() || !txHashValid}>
                        {confirming ? "Verifying Payment…" : "Verify Payment & Issue Allocation"}
                      </button>
                    </div>
                  )}

                  {allocation && (
                    <div className="sale-success glass-glow">
                      <div className="sale-success-head">
                        <div className="sale-success-icon">✓</div>
                        <div className="sale-success-title">Allocation Issued</div>
                      </div>
                      <div className="sale-success-grid">
                        <div><span>Allocation ID</span><strong>{allocation.allocationId}</strong></div>
                        <div><span>Receipt</span><strong>{allocation.receiptId}</strong></div>
                        <div><span>Paid</span><strong>{allocation.amountPaid} {allocation.settlementAsset}</strong></div>
                        <div><span>Issued</span><strong>{allocation.totalUny} UNY</strong></div>
                        <div><span>Tx Hash</span><strong className="sale-mono">{allocation.txHash}</strong></div>
                        <div><span>Confirmed</span><strong>{fmtDate(allocation.createdAt)}</strong></div>
                      </div>
                      <div className="sale-success-actions">
                        <button type="button" className="btn-outline sale-mini-btn" onClick={downloadProofPacket}>Download Receipt</button>
                        <button type="button" className="btn-outline sale-mini-btn" onClick={() => void copyValue("Allocation ID", allocation.allocationId)}>Copy Allocation ID</button>
                        <button type="button" className="btn-outline sale-mini-btn" onClick={() => void copyValue("Receipt ID", allocation.receiptId)}>Copy Receipt</button>
                      </div>
                    </div>
                  )}

                  {allocations.length > 0 && (
                    <div className="sale-success glass">
                      <div className="sale-success-title">Issued Allocations</div>
                      <div className="sale-allocation-list">
                        {allocations.map((item) => (
                          <div key={item.allocationId} className="sale-allocation-item">
                            <div>
                              <span>{item.allocationId}</span>
                              <strong>{item.totalUny} UNY</strong>
                            </div>
                            <div>
                              <span>{item.amountPaid} {item.settlementAsset}</span>
                              <strong>{fmtDate(item.createdAt)}</strong>
                            </div>
                            <div>
                              <span>Receipt</span>
                              <strong>{item.receiptId}</strong>
                            </div>
                            <div>
                              <span>Tx Hash</span>
                              <strong className="sale-mono">{item.txHash}</strong>
                            </div>
                          </div>
                        ))}
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
