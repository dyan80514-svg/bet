import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { api } from './api.js';
import TonConnectButton from './components/TonConnectButton.jsx';
import ReserveBanner from './components/ReserveBanner.jsx';
import { useTonWalletBalance } from './hooks/useTonWallet.js';
import Home from './pages/Home.jsx';
import BetSlip from './pages/BetSlip.jsx';
import MyBets from './pages/MyBets.jsx';
import Wallet from './pages/Wallet.jsx';
import Admin from './pages/Admin.jsx';
import Settings from './pages/Settings.jsx';

function AppShell() {
  const [config, setConfig] = useState(null), [slip, setSlip] = useState([]);
  const wallet = useTonWalletBalance();
  const refreshConfig = useCallback(async () => { try { setConfig(await api('/config')); } catch { setConfig({ bettingEnabled: false, disabledReason: 'Backend unavailable' }); } }, []);
  useEffect(() => { refreshConfig(); const id = setInterval(refreshConfig, 30000); return () => clearInterval(id); }, [refreshConfig]);
  return <div className="app-shell"><header className="topbar"><Link to="/" className="brand"><span className="brand-mark">◆</span>FAIRPLAY<span className="brand-ton">TON</span></Link><nav><NavLink to="/">Markets</NavLink><NavLink to="/my-bets">My bets</NavLink><NavLink to="/wallet">Wallet</NavLink><NavLink to="/admin">Admin</NavLink><NavLink to="/settings">Settings</NavLink><NavLink to="/bet-slip" className="nav-slip">Slip {slip.length}</NavLink></nav><div className="wallet-actions"><span className="network-label"><i />TON MAINNET</span><TonConnectButton /></div></header>
    <main><ReserveBanner config={config} /><Routes>
      <Route path="/" element={<Home config={config} slip={slip} setSlip={setSlip} />} />
      <Route path="/bet-slip" element={<BetSlip config={config} slip={slip} setSlip={setSlip} wallet={wallet} />} />
      <Route path="/my-bets" element={<MyBets config={config} />} />
      <Route path="/wallet" element={<Wallet config={config} />} />
      <Route path="/admin" element={<Admin config={config} />} />
      <Route path="/settings" element={<Settings />} />
    </Routes></main>
    <footer><span>FAIRPLAY · TON NETWORK</span><span>For adults only · Bet responsibly · Gambling requires a license in your jurisdiction.</span></footer>
  </div>;
}

export default function App() {
  return <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}><AppShell /></TonConnectUIProvider>;
}
