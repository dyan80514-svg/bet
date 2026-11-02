import { useCallback, useEffect, useState } from 'react';
import { toNano } from '@ton/core';
import { useTonWalletBalance } from '../hooks/useTonWallet.js';
import { useTonBet } from '../hooks/useTonBet.js';
import { api } from '../api.js';

export default function MyBets({ config }) {
  const { address } = useTonWalletBalance();
  const [bets, setBets] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const { claimBet } = useTonBet();
  const refresh = useCallback(async () => { if (!address) return setBets([]); try { const row = await api(`/bets/mine/${encodeURIComponent(address)}`); setBets(row.bets || []); setError(''); } catch (e) { setError(e.message); } }, [address]);
  useEffect(() => { refresh(); const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, [refresh]);
  async function claim(bet) { try { setBusy(bet.id); await claimBet({ queryId: bet.queryId, config }); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(''); } }
  if (!address) return <section className="narrow-page"><h2>My bets</h2><div className="empty-state">Connect your TON wallet to view its positions.</div></section>;
  return <section className="narrow-page"><div className="section-head"><div><small>ESCROW CONTRACT POSITIONS</small><h2>My bets <span>{bets.length}</span></h2></div></div>{error && <div className="inline-alert">{error}</div>}
    {!bets.length ? <div className="empty-state"><b>No indexed wagers</b><span>Confirmed wagers appear here after the backend verifies them onchain.</span></div> : <div className="position-list">{bets.map(b => { const due = b.status === 'won_unclaimed' || b.status === 'void_unclaimed'; return <article className="position-card" key={b.id}><div className="game-card-head"><span className="sport-chip">{b.game.league}</span><span className="game-state">{b.status.replaceAll('_', ' ').toUpperCase()}</span></div><b>{b.game.awayTeam} @ {b.game.homeTeam}</b><span>{b.selection.toUpperCase()} @ {Number(b.decimalOdds).toFixed(2)}</span><small>Stake {Number(b.stakeNano) / 1e9} TON · Bet ID {b.queryId}</small>{due && <button className="primary-action" disabled={busy === b.id} onClick={() => claim(b)}>{busy === b.id ? 'Waiting for TON wallet…' : 'Claim from escrow to wallet'}</button>}{b.status === 'lost_unclaimed' && <button className="secondary-action" disabled={busy === b.id} onClick={() => claim(b)}>{busy === b.id ? 'Waiting…' : 'Finalize lost bet'}</button>}</article>; })}</div>}
  </section>;
}
