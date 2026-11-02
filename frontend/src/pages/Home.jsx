import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import GameCard from '../components/GameCard.jsx';

export default function Home({ config, slip, setSlip }) {
  const [games, setGames] = useState([]), [error, setError] = useState(''), [sport, setSport] = useState('all');
  const refresh = useCallback(async () => { try { const row = await api('/games/live'); setGames(row.games || []); setError(row.stale ? 'Using last known odds. Wagering is disabled on stale prices.' : ''); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { refresh(); const id = setInterval(refresh, 30000); return () => clearInterval(id); }, [refresh]);
  const sports = ['all', ...new Set(games.map(g => g.sport))];
  const filtered = sport === 'all' ? games : games.filter(g => g.sport === sport);
  function pick(game, outcome, price) { setSlip(current => current.some(x => x.game.id === game.id) ? current.filter(x => x.game.id !== game.id) : [...current, { game, outcome, price }]); }
  return <section>
    <div className="page-intro"><div><div className="eyebrow"><span className="live-dot" />KEYLESS ODDS FEED · ONCHAIN WAGERS</div><h1>Find your<br /><em>next edge.</em></h1><p>Wallet signed picks. TON escrow. You keep control of your keys.</p></div><div className="diamond-stage"><div className="diamond-orbit orbit-a"/><div className="diamond-orbit orbit-b"/><div className="hero-diamond">◆</div><span className="stage-label">TON MAINNET<br/>NON-CUSTODIAL</span></div></div>
    <div className="source-ribbon"><b>LIVE ODDS - NO API KEY</b><span>Best available lines from direct public sports feeds. Feeds can change or go offline.</span></div>
    {error && <div className="inline-alert">{error}</div>}
    <div className="section-head"><div><small>SPORTSBOOK MARKETS</small><h2>Upcoming games <span>{filtered.length}</span></h2></div><div className="sport-filters">{sports.map(s => <button className={sport === s ? 'active' : ''} key={s} onClick={() => setSport(s)}>{s.toUpperCase()}</button>)}</div></div>
    <div className="games-list">{filtered.length ? filtered.map(game => <GameCard key={game.id} game={game} bettingEnabled={Boolean(config?.bettingEnabled)} selection={slip.find(x => x.game.id === game.id)} onPick={pick} />) : <div className="empty-state"><b>No odds available</b><span>Live feeds may be offline or no events may be scheduled.</span></div>}</div>
  </section>;
}
