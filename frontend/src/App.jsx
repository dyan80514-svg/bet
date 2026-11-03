import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { InBuiltWalletProvider, useInBuiltWallet } from './hooks/useInBuiltWallet.jsx';
import AgeGateModal from './components/AgeGateModal.jsx';
import TonConnectButton from './components/TonConnectButton.jsx';
import ReserveBanner from './components/ReserveBanner.jsx';
import Home from './pages/Home.jsx';
import BetSlip from './pages/BetSlip.jsx';
import MyBets from './pages/MyBets.jsx';
import Wallet from './pages/Wallet.jsx';
import Admin from './pages/Admin.jsx';
import Settings from './pages/Settings.jsx';
import { api } from './api.js';

function TopNav({ slipLength }) {
  const { isCreated, address, isUnlocked, summary } = useInBuiltWallet();

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark">◆</span>FAIRPLAY<span className="brand-ton">TON</span>
      </Link>
      <nav>
        <NavLink to="/">Markets</NavLink>
        <NavLink to="/bet-slip" className="nav-slip">
          Slip {slipLength > 0 && <span className="ml-1 px-1.5 py-0.2 bg-cyan-500 text-slate-950 font-bold rounded-full text-xs">{slipLength}</span>}
        </NavLink>
        <NavLink to="/my-bets">My Bets</NavLink>
        <NavLink to="/wallet">Wallet</NavLink>
        <NavLink to="/admin">Admin</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <div className="wallet-actions flex items-center gap-2">
        <span className="network-label">
          <i />TON MAINNET
        </span>
        {isCreated && address ? (
          <Link
            to="/wallet"
            className="flex items-center gap-1.5 text-xs bg-slate-900 border border-slate-700 px-2.5 py-1.5 rounded-xl font-mono text-cyan-300 hover:border-cyan-500 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${isUnlocked ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
            <span>{summary?.tonBalance || '0.00'} TON</span>
          </Link>
        ) : null}
        <TonConnectButton />
      </div>
    </header>
  );
}

function AppShell() {
  const [config, setConfig] = useState(null);
  const [slip, setSlip] = useState([]);

  const refreshConfig = useCallback(async () => {
    try {
      setConfig(await api('/config'));
    } catch {
      setConfig({ bettingEnabled: false, disabledReason: 'Backend unavailable' });
    }
  }, []);

  useEffect(() => {
    refreshConfig();
    const id = setInterval(refreshConfig, 30000);
    return () => clearInterval(id);
  }, [refreshConfig]);

  return (
    <div className="app-shell">
      <TopNav slipLength={slip.length} />
      <main>
        <ReserveBanner config={config} />
        <Routes>
          <Route path="/" element={<Home config={config} slip={slip} setSlip={setSlip} />} />
          <Route path="/bet-slip" element={<BetSlip config={config} slip={slip} setSlip={setSlip} />} />
          <Route path="/my-bets" element={<MyBets config={config} />} />
          <Route path="/wallet" element={<Wallet config={config} />} />
          <Route path="/admin" element={<Admin config={config} />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <AgeGateModal />
      <footer>
        <span>FAIRPLAY · TON MAINNET DECENTRALIZED SPORTSBOOK</span>
        <span>For adults only (18+) · Bet responsibly · Non-custodial contracts on TON Mainnet.</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}>
      <InBuiltWalletProvider>
        <AppShell />
      </InBuiltWalletProvider>
    </TonConnectUIProvider>
  );
}
