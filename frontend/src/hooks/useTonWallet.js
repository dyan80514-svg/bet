import { useEffect, useState } from 'react';
import { useTonAddress, useTonWallet } from '@tonconnect/ui-react';
import { api } from '../api.js';

export function useTonWalletBalance() {
  const wallet = useTonWallet();
  const address = useTonAddress(false);
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!address) { setBalance(null); return; }
    let alive = true;
    const refresh = async () => { try { const row = await api(`/wallet/balance/${encodeURIComponent(address)}`); if (alive) { setBalance(row); setError(''); } } catch (e) { if (alive) setError(e.message); } };
    refresh(); const timer = setInterval(refresh, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [address]);
  return { wallet, address, balance, error };
}
