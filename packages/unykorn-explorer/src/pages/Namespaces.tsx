import { useEffect, useState } from "react";
import { getNamespaces, type NamespaceRecord } from "../api";

export default function Namespaces() {
  const [records, setRecords] = useState<NamespaceRecord[]>([]);
  const [facilitatorUp, setFacUp] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const ns = await getNamespaces();
        setRecords(ns);
        setFacUp(true);
      } catch {
        setFacUp(false);
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const filtered = filter
    ? records.filter((r) => r.fqn?.toLowerCase().includes(filter.toLowerCase()))
    : records;

  /* build a hierarchical tree from the dot-separated FQNs */
  const tree = buildTree(filtered);

  return (
    <>
      {/* ── Hero ── */}
      <div className="ex-hero" style={{ marginBottom: "var(--sov-space-6)" }}>
        <h1 className="hero-title">
          <span className="gradient-text">Namespace</span> Registry
        </h1>
        <p className="hero-sub">
          Hierarchical namespace resolution system — every route, agent, asset, and
          service maps to an FQN. Payment requirements are inherited down the tree.
        </p>
        <div className="protocol-badges">
          <span className="protocol-badge">fth.* root</span>
          <span className="protocol-badge">DNS-style FQN</span>
          <span className="protocol-badge">x402 gating</span>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat-card">
          <div className="stat-label">Total Records</div>
          <div className="stat-value">{records.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Payment-Required</div>
          <div className="stat-value" style={{ color: "var(--sov-warning)" }}>
            {records.filter((r) => r.payment_required).length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Public</div>
          <div className="stat-value" style={{ color: "var(--sov-success)" }}>
            {records.filter((r) => r.visibility === "public").length}
          </div>
        </div>
      </div>

      {/* ── Filter ── */}
      <div style={{ marginBottom: "var(--sov-space-4)" }}>
        <input
          type="text"
          placeholder="Filter namespaces (e.g. fth.agents)…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 400,
            padding: "var(--sov-space-2) var(--sov-space-3)",
            background: "var(--sov-surface-1)",
            border: "1px solid var(--sov-border)",
            borderRadius: "var(--sov-radius-md)",
            color: "var(--sov-text-primary)",
            fontFamily: "var(--sov-font-mono)",
            fontSize: "0.9rem",
          }}
        />
      </div>

      {/* ── Namespace Tree ── */}
      {records.length > 0 ? (
        <div className="glass" style={{ padding: "var(--sov-space-4)" }}>
          <div className="ns-tree">
            {renderTree(tree, 0)}
          </div>
        </div>
      ) : (
        <div className="glass" style={{ padding: "var(--sov-space-6)", textAlign: "center", opacity: 0.6 }}>
          {facilitatorUp
            ? "No namespaces registered yet — seed via Facilitator admin API"
            : "Connect Facilitator to view namespace registry"}
        </div>
      )}

      {/* ── Table View ── */}
      {records.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Registry Table</h2>
            <span className="section-badge">{filtered.length} records</span>
          </div>
          <div className="glass">
            <table className="data-table">
              <thead>
                <tr>
                  <th>FQN</th>
                  <th>Owner</th>
                  <th>Resolve</th>
                  <th>Visibility</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ color: "var(--sov-accent-1)", fontWeight: 600 }}>
                      {r.fqn}
                    </td>
                    <td className="mono" style={{ fontSize: "0.85rem" }}>{r.owner || "—"}</td>
                    <td>
                      <span className="pill pill-info">{r.resolve_type}</span>{" "}
                      <span className="mono" style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                        {r.resolve_value && r.resolve_value.length > 50
                          ? r.resolve_value.slice(0, 50) + "…"
                          : r.resolve_value || "—"}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${r.visibility === "public" ? "pill-success" : "pill-warning"}`}>
                        {r.visibility}
                      </span>
                    </td>
                    <td>
                      {r.payment_required ? (
                        <span className="pill pill-purple">x402</span>
                      ) : (
                        <span style={{ opacity: 0.4 }}>free</span>
                      )}
                    </td>
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

/* ── Tree builder ── */
interface TreeNode {
  label: string;
  fqn: string;
  record?: NamespaceRecord;
  children: TreeNode[];
}

function buildTree(records: NamespaceRecord[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const r of records) {
    const parts = (r.fqn || "unknown").split(".");
    let level = root;

    for (let i = 0; i < parts.length; i++) {
      const label = parts[i];
      const fqn = parts.slice(0, i + 1).join(".");
      let node = level.find((n) => n.label === label);
      if (!node) {
        node = { label, fqn, children: [] };
        level.push(node);
      }
      if (i === parts.length - 1) {
        node.record = r;
      }
      level = node.children;
    }
  }

  return root;
}

function renderTree(nodes: TreeNode[], depth: number): React.ReactNode {
  return nodes.map((node) => (
    <div key={node.fqn} className="ns-node" style={{ paddingLeft: depth * 20 }}>
      <div className="ns-node-header">
        <span className="ns-connector">{depth > 0 ? "├── " : ""}</span>
        <span className="ns-label" style={{
          color: node.record ? "var(--sov-accent-1)" : "var(--sov-text-secondary)",
          fontWeight: node.record ? 600 : 400,
        }}>
          {node.label}
        </span>
        {node.record?.payment_required && (
          <span className="pill pill-purple" style={{ marginLeft: 8, fontSize: "0.7rem" }}>x402</span>
        )}
        {node.record?.visibility === "public" && (
          <span className="pill pill-success" style={{ marginLeft: 4, fontSize: "0.7rem" }}>public</span>
        )}
        {node.record?.resolve_type && (
          <span style={{ marginLeft: 8, opacity: 0.5, fontSize: "0.75rem", fontFamily: "var(--sov-font-mono)" }}>
            → {node.record.resolve_type}
          </span>
        )}
      </div>
      {node.children.length > 0 && renderTree(node.children, depth + 1)}
    </div>
  ));
}
