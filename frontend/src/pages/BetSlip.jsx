import { useState } from 'react';
import { useTonBet } from '../hooks/useTonBet.js';

export default function BetSlip({ config, slip, setSlip, wallet }) {
  const [stake, setStake] = useState('0.2'), [adult, setAdult] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const { placeBet } = useTonBet();
  const totalOdds = slip.reduce((n, p) => n * p.price, 1);
  const potential = Number(stake || 0) * totalOdds;
  async function submit() {
    if (!adult) return setMessage('Confirm you are at least 18 and legally eligible in your location.');
    if (!wallet.address) return setMessage('Connect the TON wallet that will sign and fund the wager.');
    if (!config?.bettingEnabled) return setMessage('Wagering is disabled until contract deployment, reserves and odds feed are ready.');
    setBusy(true); setMessage('');
    try {
      const confirmed = [];
      for (const pick of slip) confirmed.push(await placeBet({ game: pick.game, selection: pick.outcome, stakeTon: stake, config }));
      setSlip([]); setMessage(`${confirmed.length} onchain wager${confirmed.length === 1 ? '' : 's'} verified.`);
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <section className="narrow-page"><div className="section-head"><div><small>TON CONNECT WALLET TRANSACTIONS</small><h2>Bet slip</h2></div></div>
    {!slip.length ? <div className="empty-state"><b>Your slip is empty</b><span>Choose an outcome from an open onchain market.</span></div> : <>
      <div className="slip-list">{slip.map((pick, i) => <article className="slip-row" key={pick.game.id}><div><b>{pick.game.awayTeam} @ {pick.game.homeTeam}</b><span>{pick.outcome.toUpperCase()} · {pick.price.toFixed(2)} decimal</span></div><button onClick={() => setSlip(slip.filter((_, j) => j !== i))}>Remove</button></article>)}</div>
      <div className="slip-card"><label>STAKE PER PICK (TON)<input type="number" min="0.1" step="0.01" value={stake} onChange={e => setStake(e.target.value)} /></label><div className="slip-math"><span>{slip.length} separate wager(s)</span><b>Potential return per pick: {(Number(stake || 0) * (slip[0]?.price || 0)).toFixed(4)} TON</b></div><div className="slip-note">Your wallet signs each wager directly to the escrow contract. Each transaction attaches 0.1 TON for contract execution and reserve padding in addition to the stated stake. The connected wallet remains yours.</div>
        <label className="adult-confirm"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} />I confirm I am 18+ and wagering is legal where I am located.</label>
        <button className="primary-action" disabled={busy || !config?.bettingEnabled} onClick={submit}>{busy ? 'Waiting for wallet and chain…' : 'Sign wagers in TON wallet'}</button>
        {message && <div className="inline-alert">{message}</div>}
      </div>
    </>}
  </section>;
}
