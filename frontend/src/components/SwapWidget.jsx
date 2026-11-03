import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TonClient, fromNano, toNano } from '@ton/ton';
import { DEX, pTON } from '@ston-fi/sdk';
import { useInBuiltWallet } from '../hooks/useInBuiltWallet.jsx';

const TON_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
const USDT_ADDRESS = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const NOT_ADDRESS = 'EQAvlWFDxQRWejqQrqKnqcVE0XuKGJZXaNmCFoyAcAn0BAHr';

const TOKENS = {
  TON: { symbol: 'TON', name: 'Toncoin', address: TON_ADDRESS, decimals: 9 },
  USDT: { symbol: 'USDT', name: 'Tether USD', address: USDT_ADDRESS, decimals: 6 },
  NOT: { symbol: 'NOT', name: 'Notcoin', address: NOT_ADDRESS, decimals: 9 },
};

const STONFI_ROUTER = 'EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt';

export default function SwapWidget({ onSwapComplete }) {
  const { address, isUnlocked, sendTon, summary, refreshSummary } = useInBuiltWallet();

  const [fromToken, setFromToken] = useState('TON');
  const [toToken, setToToken] = useState('USDT');
  const [fromAmount, setFromAmount] = useState('1');
  const [slippage, setSlippage] = useState('0.01'); // 1%

  const [quote, setQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');

  const tonClient = useRef(new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC' }));

  const fetchQuote = useCallback(async () => {
    if (!fromAmount || Number(fromAmount) <= 0) {
      setQuote(null);
      return;
    }

    setLoadingQuote(true);
    setError('');

    try {
      const fromDec = TOKENS[fromToken].decimals;
      const units = BigInt(Math.floor(Number(fromAmount) * 10 ** fromDec)).toString();
      const offerAddr = TOKENS[fromToken].address;
      const askAddr = TOKENS[toToken].address;

      const url = `https://api.ston.fi/v1/swap/simulate?offer_address=${offerAddr}&ask_address=${askAddr}&units=${units}&slippage_tolerance=${slippage}`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to fetch STON.fi quote');
      const data = await res.json();

      const toDec = TOKENS[toToken].decimals;
      const askUnits = Number(data.ask_units) / 10 ** toDec;
      const minAskUnits = Number(data.min_ask_units) / 10 ** toDec;

      setQuote({
        askUnits: askUnits.toFixed(4),
        minAskUnits: minAskUnits.toFixed(4),
        priceImpact: (Number(data.price_impact || 0) * 100).toFixed(2),
        swapRate: Number(data.swap_rate || 0).toFixed(4),
        raw: data,
      });
    } catch (err) {
      setError(err.message || 'Error fetching quote');
      setQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  }, [fromAmount, fromToken, toToken, slippage]);

  useEffect(() => {
    const timer = setTimeout(fetchQuote, 400);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  const handleFlip = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount('');
    setQuote(null);
  };

  const executeSwap = async () => {
    if (!address) {
      setError('Please create or unlock your in-built wallet');
      return;
    }
    if (!isUnlocked) {
      setError('Please unlock your in-built wallet to sign the swap');
      return;
    }
    if (!quote || !quote.raw) {
      setError('No valid quote available');
      return;
    }

    setSwapping(true);
    setError('');
    setTxHash('');

    try {
      const client = tonClient.current;
      const router = client.open(new DEX.v1.Router(STONFI_ROUTER));

      if (fromToken === 'TON') {
        const offerNano = toNano(fromAmount);
        const minAskUnits = BigInt(quote.raw.min_ask_units);

        const params = await router.getSwapTonToJettonTxParams({
          userWalletAddress: address,
          proxyTon: new pTON.v1(),
          offerAmount: offerNano,
          askJettonAddress: TOKENS[toToken].address,
          minAskAmount: minAskUnits,
        });

        const hash = await sendTon({
          to: params.to.toString(),
          amountTon: fromNano(params.value),
          payload: params.body,
        });

        setTxHash(hash);
        refreshSummary();
        if (onSwapComplete) onSwapComplete(hash);
      } else {
        setError('Direct Jetton -> TON swap requires holding Jettons in wallet. Ensure Jetton balance is funded.');
      }
    } catch (err) {
      setError(err.message || 'Swap transaction failed');
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md mx-auto text-slate-100 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          STON.fi Instant Swap
        </h3>
        <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded">
          TON Mainnet
        </span>
      </div>

      {/* From Token */}
      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 mb-2">
        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
          <span>You Pay</span>
          <span>Balance: {fromToken === 'TON' ? (summary?.tonBalance || '0.00') : '0.00'} {fromToken}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
            placeholder="0.0"
            className="w-full bg-transparent text-xl font-bold font-mono outline-none text-white placeholder-slate-600"
          />
          <select
            value={fromToken}
            onChange={(e) => {
              const val = e.target.value;
              if (val === toToken) handleFlip();
              else setFromToken(val);
            }}
            className="bg-slate-800 border border-slate-700 text-sm font-semibold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
          >
            {Object.keys(TOKENS).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          type="button"
          onClick={handleFlip}
          className="p-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-full text-slate-300 transition-colors shadow-md"
          title="Switch tokens"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* To Token */}
      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 mb-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
          <span>You Receive</span>
          <span>{loadingQuote ? 'Fetching quote...' : quote ? `1 ${fromToken} ≈ ${quote.swapRate} ${toToken}` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={quote ? quote.askUnits : ''}
            placeholder={loadingQuote ? 'Calculating...' : '0.0'}
            className="w-full bg-transparent text-xl font-bold font-mono outline-none text-emerald-400 placeholder-slate-600 cursor-default"
          />
          <select
            value={toToken}
            onChange={(e) => {
              const val = e.target.value;
              if (val === fromToken) handleFlip();
              else setToToken(val);
            }}
            className="bg-slate-800 border border-slate-700 text-sm font-semibold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
          >
            {Object.keys(TOKENS).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quote Details */}
      {quote && (
        <div className="bg-slate-950/60 rounded-lg p-3 text-xs space-y-1.5 border border-slate-800/60 mb-4 font-mono">
          <div className="flex justify-between text-slate-400">
            <span>Minimum Received:</span>
            <span className="text-slate-200">{quote.minAskUnits} {toToken}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Price Impact:</span>
            <span className="text-slate-200">{quote.priceImpact}%</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Slippage Tolerance:</span>
            <div className="flex gap-1.5">
              {['0.005', '0.01', '0.025'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlippage(s)}
                  className={`px-1.5 py-0.5 rounded text-[10px] ${slippage === s ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800 text-slate-400'}`}
                >
                  {(Number(s) * 100)}%
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-2.5 bg-rose-950/50 border border-rose-800 text-rose-300 text-xs rounded-lg mb-3">
          {error}
        </div>
      )}

      {txHash && (
        <div className="p-2.5 bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs rounded-lg mb-3 space-y-1">
          <p className="font-semibold">Swap submitted to TON Mainnet!</p>
          <a
            href={`https://tonscan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 underline break-all block"
          >
            View on Tonscan ↗
          </a>
        </div>
      )}

      <button
        type="button"
        disabled={swapping || loadingQuote || !quote}
        onClick={executeSwap}
        className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.99]"
      >
        {swapping ? 'Signing & Broadcasting Swap...' : 'Swap via STON.fi DEX'}
      </button>
    </div>
  );
}
