import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { getChainStatus, type ChainStatus } from "../api";

export default function Layout() {
  const [chain, setChain] = useState<ChainStatus | null>(null);

  useEffect(() => {
    setChain(getChainStatus());
    const t = setInterval(() => setChain(getChainStatus()), 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="ex-shell">
      <header className="ex-header">
        <div className="ex-logo">
          <div className="ex-logo-icon">U</div>
          <span>UnyKorn</span>
          <span className="ex-logo-sub">L1 Explorer</span>
        </div>

        {chain && (
          <div className="ex-chain-badge">
            <span className="ex-chain-dot" />
            Chain {chain.chainId} · Block #{chain.blockHeight.toLocaleString()}
          </div>
        )}

        <nav className="ex-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/blocks">Blocks</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
          <NavLink to="/x402">x402</NavLink>
          <NavLink to="/agents">A2A Agents</NavLink>
          <NavLink to="/namespaces">Namespaces</NavLink>
          <NavLink to="/economics">Economics</NavLink>
        </nav>
      </header>

      <main className="ex-main">
        <Outlet />
      </main>

      <footer className="ex-footer">
        <span>UnyKorn L1 Explorer · ex.unykorn.org · </span>
        <a href="https://407.unykorn.org" target="_blank" rel="noreferrer">Protocol Docs</a>
        <span> · </span>
        <a href="https://fth-x402-gateway-staging.kevanbtc.workers.dev/health" target="_blank" rel="noreferrer">Gateway Status</a>
        <span> · Sovereign Design System v1.1</span>
      </footer>
    </div>
  );
}
