import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { getChainStatus, type ChainStatus } from "../api";

export default function Layout() {
  const [chain, setChain] = useState<ChainStatus | null>(null);

  useEffect(() => {
    getChainStatus().then(setChain).catch(() => {});
    const t = setInterval(() => {
      getChainStatus().then(setChain).catch(() => {});
    }, 6000);
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
            Chain {chain.chainId} · {chain.blockHeight} Ledger Entries · {chain.synced ? "Live" : "Offline"}
          </div>
        )}

        <nav className="ex-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/blocks">Ledger</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
          <NavLink to="/x402">x402</NavLink>
          <NavLink to="/agents">A2A Agents</NavLink>
          <NavLink to="/namespaces">Namespaces</NavLink>
          <NavLink to="/economics">Economics</NavLink>
          <NavLink to="/listing">Listing</NavLink>
          <NavLink to="/proof">Proof Center</NavLink>
          <NavLink to="/security">Security</NavLink>
          <NavLink to="/genesis">Genesis</NavLink>
        </nav>
      </header>

      <main className="ex-main">
        <Outlet />
      </main>

      <footer className="ex-footer">
        <span>UnyKorn L1 Explorer · ex.unykorn.org · </span>
        <a href="https://github.com/FTHTrading/UnyKorn-X402-aws/blob/main/docs/WHITEPAPER.md" target="_blank" rel="noreferrer">Whitepaper</a>
        <span> · </span>
        <a href="https://ico.unykorn.org" target="_blank" rel="noreferrer">Token Sale</a>
        <span> · </span>
        <a href="https://github.com/FTHTrading/UnyKorn-X402-aws" target="_blank" rel="noreferrer">GitHub</a>
        <span> · L1 Devnet RPC coming Q2 2026 · Sovereign Design System v1.2</span>
      </footer>
    </div>
  );
}
