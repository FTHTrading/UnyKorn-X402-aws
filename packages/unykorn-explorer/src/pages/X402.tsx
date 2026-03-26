import { useEffect, useState } from "react";
import {
  getInvoices,
  getReceipts,
  getReceiptRoots,
  timeAgo,
  truncHash,
  CHAIN,
  type Invoice,
  type Receipt,
  type ReceiptRoot,
} from "../api";

const PAID_ROUTES = [
  { path: "/agent-pay-api/*", ns: "fth.agents.pay", price: "0.0001 UNY", desc: "A2A agent execution" },
  { path: "/trade-verify/*", ns: "fth.trade.verify", price: "0.00025 UNY", desc: "Trade-document verification" },
  { path: "/genesis-repro/*", ns: "fth.genesis.repro", price: "0.0005 UNY", desc: "Genesis reproduction proofs" },
  { path: "/invoice-export/*", ns: "fth.invoice.export", price: "0.001 UNY", desc: "Bulk invoice data export" },
];

export default function X402() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [roots, setRoots] = useState<ReceiptRoot[]>([]);
  const [facilitatorUp, setFacUp] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [inv, rec, rr] = await Promise.all([getInvoices(), getReceipts(), getReceiptRoots()]);
        setInvoices(inv);
        setReceipts(rec);
        setRoots(rr);
        setFacUp(true);
      } catch {
        setFacUp(false);
      }
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const totalRevenue = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + parseFloat(i.amount ?? "0"), 0);

  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero" style={{ marginBottom: "var(--sov-space-6)" }}>
        <h1 className="hero-title">
          <span className="gradient-text">x402</span> Payment Protocol
        </h1>
        <p className="hero-sub">
          HTTP 402 Payment Required — machine-native paywall for every API endpoint.
          Pay-per-call with zero human friction.
        </p>
        <div className="protocol-badges">
          <span className="protocol-badge">FTH-x402 / 2.0</span>
          <span className="protocol-badge">{CHAIN.rails.length} Rails</span>
          <span className="protocol-badge">{CHAIN.proofs.length} Proof Types</span>
          <span className="protocol-badge">{CHAIN.assets.length} Assets</span>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="stat-card">
          <div className="stat-label">Total Invoices</div>
          <div className="stat-value">{invoices.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Paid</div>
          <div className="stat-value" style={{ color: "var(--sov-success)" }}>
            {invoices.filter((i) => i.status === "paid").length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: "var(--sov-warning)" }}>
            {invoices.filter((i) => i.status === "pending").length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Revenue</div>
          <div className="stat-value">{totalRevenue.toFixed(4)} UNY</div>
        </div>
      </div>

      {/* ── Payment Flow Diagram ── */}
      <div className="section-header">
        <h2 className="section-title">Payment Flow</h2>
      </div>
      <div className="glass" style={{ padding: "var(--sov-space-5)", textAlign: "center" }}>
        <div className="flow-diagram">
          <div className="flow-step">
            <div className="flow-icon">🌐</div>
            <div className="flow-label">Client</div>
            <div className="flow-desc">Requests paid endpoint</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="flow-icon">⚡</div>
            <div className="flow-label">Gateway</div>
            <div className="flow-desc">CF Worker edge</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step" style={{ borderColor: "var(--sov-danger)" }}>
            <div className="flow-icon">🔴</div>
            <div className="flow-label">HTTP 402</div>
            <div className="flow-desc">Invoice in body</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="flow-icon">💰</div>
            <div className="flow-label">Pay</div>
            <div className="flow-desc">Submit proof</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step" style={{ borderColor: "var(--sov-success)" }}>
            <div className="flow-icon">✅</div>
            <div className="flow-label">Verify</div>
            <div className="flow-desc">Facilitator checks</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step" style={{ borderColor: "var(--sov-accent-1)" }}>
            <div className="flow-icon">📦</div>
            <div className="flow-label">Serve</div>
            <div className="flow-desc">200 + data</div>
          </div>
        </div>
      </div>

      {/* ── Settlement Rails ── */}
      <div className="two-col">
        <div>
          <div className="section-header">
            <h2 className="section-title">Settlement Rails</h2>
          </div>
          <div className="glass">
            <table className="data-table">
              <thead>
                <tr><th>Rail</th><th>Type</th></tr>
              </thead>
              <tbody>
                {CHAIN.rails.map((r) => (
                  <tr key={r}>
                    <td style={{ fontWeight: 600, color: "var(--sov-accent-1)" }}>{r}</td>
                    <td>{railDesc(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="section-header">
            <h2 className="section-title">Proof Types</h2>
          </div>
          <div className="glass">
            <table className="data-table">
              <thead>
                <tr><th>Proof</th><th>Description</th></tr>
              </thead>
              <tbody>
                {CHAIN.proofs.map((p) => (
                  <tr key={p}>
                    <td className="mono" style={{ fontSize: "0.85rem" }}>{p}</td>
                    <td>{proofDesc(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Supported Assets ── */}
      <div className="section-header">
        <h2 className="section-title">Supported Assets</h2>
        <span className="section-badge">{CHAIN.assets.length} tokens</span>
      </div>
      <div className="glass">
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
          {CHAIN.assets.map((a) => (
            <div key={a} className="stat-card" style={{ textAlign: "center" }}>
              <div className="stat-value" style={{ fontSize: "1.1rem" }}>{a}</div>
              <div className="stat-label">{assetCategory(a)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Paid Routes ── */}
      <div className="section-header">
        <h2 className="section-title">Revenue Endpoints</h2>
        <span className="section-badge">LIVE</span>
      </div>
      <div className="glass">
        <table className="data-table">
          <thead>
            <tr><th>Route</th><th>Namespace</th><th>Price</th><th>Description</th><th>Status</th></tr>
          </thead>
          <tbody>
            {PAID_ROUTES.map((r) => (
              <tr key={r.path}>
                <td className="mono" style={{ color: "var(--sov-accent-2)" }}>{r.path}</td>
                <td className="mono">{r.ns}</td>
                <td style={{ fontWeight: 600 }}>{r.price}</td>
                <td>{r.desc}</td>
                <td><span className="pill pill-success">LIVE</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Live Invoices ── */}
      <div className="section-header">
        <h2 className="section-title">
          Live Invoices {!facilitatorUp && <span style={{ color: "var(--sov-danger)", fontSize: "0.8rem" }}>(facilitator offline)</span>}
        </h2>
        <span className="section-badge">{invoices.length} total</span>
      </div>
      <div className="glass">
        {invoices.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr><th>ID</th><th>Resource</th><th>Amount</th><th>Asset</th><th>Proof</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {invoices.slice(0, 20).map((inv) => (
                <tr key={inv.invoice_id}>
                  <td className="mono" style={{ color: "var(--sov-accent-1)" }}>
                    {truncHash(inv.invoice_id, 8)}
                  </td>
                  <td className="mono">{inv.resource || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{inv.amount}</td>
                  <td>{inv.asset}</td>
                  <td>{inv.proof_type || "—"}</td>
                  <td>
                    <span className={`pill ${inv.status === "paid" ? "pill-success" : inv.status === "pending" ? "pill-warning" : "pill-info"}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="mono">{inv.created_at ? timeAgo(inv.created_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ textAlign: "center", padding: "var(--sov-space-5)", opacity: 0.6 }}>
            {facilitatorUp ? "No invoices yet — call a paid endpoint to generate one" : "Connect facilitator to view invoices"}
          </p>
        )}
      </div>

      {/* ── Receipt Roots ── */}
      {roots.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Anchored Receipt Roots</h2>
            <span className="section-badge">{roots.length} anchors</span>
          </div>
          <div className="glass">
            <table className="data-table">
              <thead>
                <tr><th>Merkle Root</th><th>Count</th><th>L1 Tx</th><th>Anchored</th></tr>
              </thead>
              <tbody>
                {roots.map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ color: "var(--sov-accent-2)" }}>{truncHash(r.merkle_root, 10)}</td>
                    <td>{r.item_count}</td>
                    <td className="mono">{r.anchor_tx_hash ? truncHash(r.anchor_tx_hash, 8) : "pending"}</td>
                    <td className="mono">{r.anchored_at ? timeAgo(r.anchored_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Receipts ── */}
      {receipts.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Payment Receipts</h2>
            <span className="section-badge">{receipts.length}</span>
          </div>
          <div className="glass">
            <table className="data-table">
              <thead>
                <tr><th>Receipt</th><th>Invoice</th><th>Proof</th><th>Verified</th></tr>
              </thead>
              <tbody>
                {receipts.slice(0, 15).map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ color: "var(--sov-accent-1)" }}>{truncHash(r.receipt_id || `receipt-${i}`, 8)}</td>
                    <td className="mono">{truncHash(r.invoice_id || "—", 8)}</td>
                    <td>{r.rail || "—"}</td>
                    <td className="mono">{r.created_at ? timeAgo(r.created_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/* ── helpers ── */
function railDesc(r: string) {
  const m: Record<string, string> = {
    "unykorn-l1": "Native UnyKorn L1 settlement (~1s finality)",
  };
  return m[r] || r;
}

function proofDesc(p: string) {
  const m: Record<string, string> = {
    prepaid_credit: "Pre-funded credit balance",
    channel_spend: "Payment channel spend proof",
    signed_auth: "Signed authorization token",
    tx_hash: "On-chain transaction hash",
  };
  return m[p] || p;
}

function assetCategory(a: string) {
  if (a === "UNY") return "Native";
  if (a.startsWith("w")) return "Wrapped";
  return "Stablecoin";
}
