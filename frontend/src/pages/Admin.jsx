import { useEffect, useState } from 'react';
import { Address, beginCell, toNano } from '@ton/core';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { api, json } from '../api.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function marketHash(id) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)); return BigInt(`0x${[...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')}`); }
function sameAddress(a, b) { try { return Address.parse(a).toRawString() === Address.parse(b).toRawString(); } catch { return false; } }

export default function Admin({ config }) {
  const [ui] = useTonConnectUI();
  const [games, setGames] = useState([]), [notice, setNotice] = useState(''), [resultByGame, setResultByGame] = useState({}), [busy, setBusy] = useState(''), [token, setToken] = useState(''), [status, setStatus] = useState(null);
  const adminConnected = Boolean(ui.wallet && config?.adminWalletAddress && sameAddress(ui.wallet.account.address, config.adminWalletAddress));
  async function refresh() { try { const r = await api('/games/cached'); setGames(r.games || []); } catch (e) { setNotice(e.message); } }
  useEffect(() => { refresh(); }, []);
  async function openMarket(game) {
    if (!adminConnected || !config?.escrowAddress) return setNotice('Connect the configured market owner wallet.');
    try {
      setBusy(game.id); setNotice('');
      const odds = game.odds || {}, count = Number.isFinite(odds.draw) ? 3 : 2, closeAt = Math.floor(new Date(game.commenceTime).getTime() / 1000);
      const body = beginCell().storeUint(0x4d4b544f, 32).storeUint(await marketHash(game.id), 256).storeUint(count, 8).storeUint(closeAt, 64).storeUint(Math.round(odds.home * 10000), 32).storeUint(Math.round((odds.draw || 1) * 10000), 32).storeUint(Math.round(odds.away * 10000), 32).endCell().toBoc().toString('base64');
      await ui.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 300, network: config.tonNetworkId, messages: [{ address: config.escrowAddress, amount: toNano('0.1').toString(), payload: body }] });
      await sleep(1500); const saved = await api('/admin/market/open', json({ gameId: game.id, closesAt: closeAt })); setNotice(`Market opened onchain · ${saved.txHash}`); await refresh();
    } catch (e) { setNotice(e.message); }
    finally { setBusy(''); }
  }
  async function resolve(game) {
    if (!adminConnected || !config?.escrowAddress) return setNotice('Connect the configured market owner wallet.');
    try {
      setBusy(game.id); setNotice(''); const raw = resultByGame[game.id]; const result = raw === 'void' ? 255 : Number(raw);
      if (![0, 1, 2, 255].includes(result)) throw new Error('Choose a valid outcome or void.');
      const body = beginCell().storeUint(0x52534c54, 32).storeUint(await marketHash(game.id), 256).storeUint(result, 8).endCell().toBoc().toString('base64');
      await ui.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 300, network: config.tonNetworkId, messages: [{ address: config.escrowAddress, amount: toNano('0.1').toString(), payload: body }] });
      await sleep(1500); const saved = await api('/admin/results', json({ gameId: game.id, result })); setNotice(`Result verified onchain · ${saved.txHash}`); await refresh();
    } catch (e) { setNotice(e.message); }
    finally { setBusy(''); }
  }
  async function loadStatus(e) { e.preventDefault(); try { const row = await api('/admin/status', { headers: { authorization: `Bearer ${token}` } }); setStatus(row); setNotice('Admin settings connected.'); } catch (err) { setNotice(err.message); } }
  return <section className="narrow-page"><div className="section-head"><div><small>OPERATOR · ONCHAIN OWNER ACTIONS</small><h2>Admin</h2></div></div>
    <div className="admin-owner"><span className={`status-dot ${adminConnected ? 'good' : ''}`} />{adminConnected ? 'Owner wallet connected' : 'Connect the configured onchain owner wallet to open markets or post results.'}</div>
    <form className="admin-token-form" onSubmit={loadStatus}><label>Backend admin token<input type="password" autoComplete="current-password" value={token} onChange={e => setToken(e.target.value)} placeholder="Only needed for KYC and audited settings" /></label><button className="secondary-action">Load admin status</button></form>
    {status && <div className="reserve-card"><span>ESCROW BALANCE</span><b>{(Number(status.reserve.balanceNano) / 1e9).toFixed(3)} TON</b><small>Reserved liabilities {(Number(status.reserve.liabilitiesNano) / 1e9).toFixed(3)} TON · minimum {(Number(status.reserve.minimumNano) / 1e9).toFixed(3)} TON · {status.reserve.funded ? 'FUNDED' : 'NOT FUNDED'}</small><span>CONTRACT {status.escrowAddress || 'not configured'}</span></div>}
    {notice && <div className="inline-alert">{notice}</div>}
    <div className="admin-game-list">{games.map(game => <article className="position-card" key={game.id}><div className="game-card-head"><span className="sport-chip">{game.league}</span><span>{new Date(game.commenceTime).toLocaleString()}</span></div><b>{game.awayTeam} @ {game.homeTeam}</b><small>Current feed prices: {JSON.stringify(game.odds)}</small>{!game.marketOpen ? <button className="primary-action" disabled={!adminConnected || busy === game.id || new Date(game.commenceTime) <= new Date()} onClick={() => openMarket(game)}>{busy === game.id ? 'Confirming onchain…' : 'Open market at these odds'}</button> : <><select value={resultByGame[game.id] ?? ''} onChange={e => setResultByGame(s => ({ ...s, [game.id]: e.target.value }))}><option value="">Choose result</option><option value="0">{game.homeTeam} (index 0)</option>{game.postedOddsJson && JSON.parse(game.postedOddsJson).draw && <option value="1">Draw (index 1)</option>}<option value={game.postedOddsJson && JSON.parse(game.postedOddsJson).draw ? '2' : '1'}>{game.awayTeam} (last index)</option><option value="void">Void · refund stakes</option></select><button className="secondary-action" disabled={!adminConnected || busy === game.id} onClick={() => resolve(game)}>{busy === game.id ? 'Resolving…' : 'Post and verify result'}</button></>}</article>)}</div>
  </section>;
}
