import React, { useState } from 'react';
import { useTonBet } from '../hooks/useTonBet.js';
import { useInBuiltWallet } from '../hooks/useInBuiltWallet.jsx';

export default function BetSlip({ config, slip, setSlip }) {
  const [betMode, setBetMode] = useState('single'); // 'single' | 'parlay'
  const [stake, setStake] = useState('0.5');
  const [useVoucher, setUseVoucher] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [txDetails, setTxDetails] = useState([]);

  const { placeBet } = useTonBet();
  const { address, isUnlocked, summary } = useInBuiltWallet();

  const ngnRate = summary?.ngnPerTon || 1590;

  // Single math: potential return per pick
  const singlePotentialTon = slip.reduce((acc, pick) => acc + (Number(stake || 0) * (pick.price || 0)), 0);
  const singlePotentialNgn = singlePotentialTon * ngnRate;

  // Parlay math: multiplied odds across all picks
  const parlayOdds = slip.reduce((n, p) => n * (p.price || 1), 1);
  const parlayPotentialTon = Number(stake || 0) * parlayOdds;
  const parlayPotentialNgn = parlayPotentialTon * ngnRate;

  const totalOddsDisplay = betMode === 'parlay' ? parlayOdds.toFixed(2) : null;
  const potentialTonDisplay = betMode === 'parlay' ? parlayPotentialTon.toFixed(4) : singlePotentialTon.toFixed(4);
  const potentialNgnDisplay = Math.round(betMode === 'parlay' ? parlayPotentialNgn : singlePotentialNgn).toLocaleString();

  async function submit() {
    if (!adult) {
      setMessage('Confirm you are at least 18 years old and wagering is legal in your jurisdiction.');
      return;
    }
    if (!address) {
      setMessage('Please set up or connect your in-built TON betting wallet first.');
      return;
    }
    if (!useVoucher && !isUnlocked) {
      setMessage('Please unlock your in-built wallet in the Wallet tab to sign transactions.');
      return;
    }

    setBusy(true);
    setMessage('');
    setTxDetails([]);

    try {
      const confirmed = [];
      if (betMode === 'single') {
        for (const pick of slip) {
          const res = await placeBet({
            game: pick.game,
            selection: pick.outcome,
            stakeTon: stake,
            config,
            useVoucher,
          });
          confirmed.push(res);
        }
      } else {
        // Parlay batch
        for (const pick of slip) {
          const res = await placeBet({
            game: pick.game,
            selection: pick.outcome,
            stakeTon: (Number(stake) / slip.length).toFixed(4),
            config,
            useVoucher,
          });
          confirmed.push(res);
        }
      }

      setSlip([]);
      setTxDetails(confirmed);
      setMessage(`Successfully placed ${confirmed.length} wager(s) on TON Mainnet!`);
    } catch (e) {
      setMessage(e.message || 'Error placing bet');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-xl mx-auto space-y-6 pb-12">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Mainnet Bet Slip</h2>
          <p className="text-xs text-slate-400 mt-0.5">Non-custodial escrow wagering</p>
        </div>
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setBetMode('single')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${betMode === 'single' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Single
          </button>
          <button
            type="button"
            onClick={() => setBetMode('parlay')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${betMode === 'parlay' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Parlay
          </button>
        </div>
      </div>

      {!slip.length ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <div className="text-3xl">🎯</div>
          <h3 className="font-bold text-white text-base">Your Bet Slip is Empty</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Select an outcome from any live or upcoming sports match on the Home page to build your slip.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Picks List */}
          <div className="space-y-2">
            {slip.map((pick, i) => (
              <article
                key={pick.game.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow"
              >
                <div>
                  <div className="font-bold text-sm text-white">
                    {pick.game.awayTeam} <span className="text-slate-500 font-normal">@</span> {pick.game.homeTeam}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono font-semibold text-cyan-400 uppercase bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                      {pick.outcome}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Odds: <strong className="text-white">{pick.price.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSlip(slip.filter((_, j) => j !== i))}
                  className="text-xs text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-950/40 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </article>
            ))}
          </div>

          {/* Staking & Payout Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div>
              <div className="flex justify-between items-center text-xs text-slate-300 mb-1.5">
                <label className="font-semibold uppercase tracking-wider text-slate-400">
                  {betMode === 'single' ? 'Stake Per Pick (TON)' : 'Total Parlay Stake (TON)'}
                </label>
                <span className="font-mono text-slate-400">
                  Wallet: {summary?.tonBalance || '0.00'} TON
                </span>
              </div>
              <input
                type="number"
                min="0.1"
                step="0.05"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-lg font-bold outline-none focus:border-cyan-500"
              />
            </div>

            {/* Voucher toggle */}
            {Number(summary?.voucherTon || 0) > 0 && (
              <label className="flex items-center gap-3 p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={useVoucher}
                  onChange={(e) => setUseVoucher(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-amber-500 cursor-pointer"
                />
                <div className="text-xs">
                  <div className="font-bold text-amber-300">Deduct from 400% Voucher Balance First</div>
                  <div className="text-slate-400">
                    Available Voucher: <span className="font-mono text-white">{summary.voucherTon} TON</span> (Winnings paid in real TON!)
                  </div>
                </div>
              </label>
            )}

            {/* Math Breakdown */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
              {betMode === 'parlay' && (
                <div className="flex justify-between text-slate-400">
                  <span>Combined Odds:</span>
                  <span className="text-cyan-400 font-bold">{totalOddsDisplay}x</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>Total Potential Return:</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {potentialTonDisplay} TON
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Estimated Value in Naira:</span>
                <span className="text-white font-semibold">
                  ≈ ₦{potentialNgnDisplay} NGN
                </span>
              </div>
            </div>

            {/* Age gate checkbox */}
            <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded bg-slate-800 border-slate-700 text-cyan-500 cursor-pointer"
              />
              <span>I confirm I am 18+ and legally permitted to wager real money on TON Mainnet.</span>
            </label>

            <button
              type="button"
              disabled={busy || !slip.length}
              onClick={submit}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.99]"
            >
              {busy ? 'Verifying on TON Mainnet...' : useVoucher ? 'Place Bet with Voucher' : 'Sign & Submit Bet to Mainnet'}
            </button>

            {message && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
                <p className="text-cyan-300 font-semibold">{message}</p>
                {txDetails.map((tx, idx) => (
                  <div key={idx} className="text-[11px] text-slate-400">
                    Query #{tx.queryId}:{' '}
                    {tx.txHash ? (
                      <a
                        href={`https://tonscan.org/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 underline font-mono"
                      >
                        {tx.txHash.slice(0, 16)}... ↗
                      </a>
                    ) : (
                      <span className="text-amber-400">Voucher Stake Verified</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
