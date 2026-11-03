import React, { useCallback, useEffect, useState } from 'react';
import { useInBuiltWallet } from '../hooks/useInBuiltWallet.jsx';
import { useTonConnect } from '../hooks/useTonConnect.js';
import { api } from '../api.js';

export default function MyBets() {
  const { address: inBuiltAddress, summary } = useInBuiltWallet();
  const { connectedAddress } = useTonConnect();
  const activeAddress = inBuiltAddress || connectedAddress;

  const [bets, setBets] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'pending' | 'won' | 'lost'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const ngnRate = summary?.ngnPerTon || 1590;

  const refresh = useCallback(async () => {
    if (!activeAddress) {
      setBets([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api(`/bets/mine/${encodeURIComponent(activeAddress)}`);
      setBets(data.bets || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!activeAddress) {
    return (
      <section className="max-w-3xl mx-auto space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3 shadow-xl">
          <div className="text-3xl">🎫</div>
          <h2 className="text-xl font-bold text-white">Connect or Unlock Your TON Wallet</h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Your on-chain bets and voucher stakes are indexed by wallet address. Set up your wallet to view your active
            positions.
          </p>
        </div>
      </section>
    );
  }

  const filtered = bets.filter((b) => {
    if (filter === 'all') return true;
    return b.status.toLowerCase() === filter;
  });

  return (
    <section className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">My Wagers</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
              {bets.length} Total
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time on-chain settlements from ESPN & Action Network feeds
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          {['all', 'pending', 'won', 'lost'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg capitalize transition-all ${filter === f ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 text-xs">
          {error}
        </div>
      )}

      {!filtered.length ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <p className="text-slate-300 font-semibold text-sm">No {filter !== 'all' ? filter : ''} wagers found.</p>
          <p className="text-xs text-slate-500">
            Wagers placed on TON Mainnet or via Voucher credit will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const stakeTon = (Number(b.stakeNano) / 1e9).toFixed(3);
            const potTon = (Number(b.potentialNano) / 1e9).toFixed(3);
            const potNgn = Math.round(Number(potTon) * ngnRate).toLocaleString();
            const isWon = b.status === 'won';
            const isLost = b.status === 'lost';
            const isPending = b.status === 'pending';

            return (
              <article
                key={b.id}
                className={`bg-slate-900 border rounded-2xl p-5 shadow-lg space-y-3 transition-all ${
                  isWon
                    ? 'border-emerald-500/50 bg-emerald-950/10'
                    : isLost
                    ? 'border-rose-900/40 opacity-80'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {b.game.league || b.game.sport}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {b.stakeSource === 'voucher' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                        Voucher
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-xs font-bold uppercase font-mono px-2.5 py-1 rounded-full ${
                      isWon
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : isLost
                        ? 'bg-rose-950 text-rose-400 border border-rose-800'
                        : 'bg-cyan-950 text-cyan-400 border border-cyan-800 animate-pulse'
                    }`}
                  >
                    {isWon ? '✓ Won' : isLost ? '✕ Lost' : '⏳ Pending'}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {b.game.awayTeam} <span className="text-slate-500 font-normal">@</span> {b.game.homeTeam}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">
                      Pick: <strong className="text-cyan-300 uppercase">{b.selection}</strong> @ {Number(b.decimalOdds).toFixed(2)} decimal
                    </p>
                  </div>

                  <div className="text-right sm:shrink-0 font-mono">
                    <div className="text-xs text-slate-400">
                      Stake: <strong className="text-white">{stakeTon} TON</strong>
                    </div>
                    <div className="text-sm font-bold text-emerald-400">
                      Return: {potTon} TON <span className="text-xs text-slate-400">(≈ ₦{potNgn})</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                  <span>Query #{b.chainBetId}</span>
                  {b.txHash && !b.txHash.startsWith('voucher_') && (
                    <a
                      href={`https://tonscan.org/tx/${b.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 underline hover:text-cyan-300"
                    >
                      View on Tonscan ↗
                    </a>
                  )}
                  {isWon && (
                    <span className="text-emerald-400 font-semibold">
                      Credited to Temporary Balance! Instant withdrawal available in Wallet.
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
