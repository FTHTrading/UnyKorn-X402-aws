import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Blocks from "./pages/Blocks";
import BlockDetail from "./pages/BlockDetail";
import Transactions from "./pages/Transactions";
import Verify from "./pages/Verify";
import X402 from "./pages/X402";
import Agents from "./pages/Agents";
import Namespaces from "./pages/Namespaces";
import Economics from "./pages/Economics";
import Listing from "./pages/Listing";
import Genesis from "./pages/Genesis";
import ProofCenter from "./pages/ProofCenter";
import Security from "./pages/Security";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="blocks" element={<Blocks />} />
        <Route path="blocks/:height" element={<BlockDetail />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="verify" element={<Verify />} />
        <Route path="x402" element={<X402 />} />
        <Route path="agents" element={<Agents />} />
        <Route path="namespaces" element={<Namespaces />} />
        <Route path="economics" element={<Economics />} />
        <Route path="listing" element={<Listing />} />
        <Route path="proof" element={<ProofCenter />} />
        <Route path="security" element={<Security />} />
        <Route path="genesis" element={<Genesis />} />
      </Route>
    </Routes>
  );
}
