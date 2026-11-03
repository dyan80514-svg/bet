import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useInBuiltWallet } from '../hooks/useInBuiltWallet.jsx';
import SwapWidget from '../components/SwapWidget.jsx';
import TonConnectButton from '../components/TonConnectButton.jsx';
import { useTonConnect } from '../hooks/useTonConnect.js';
import { api, json } from '../api.js';

export default function Wallet() {
  const {
    isCreated,
    address,
    isUnlocked,
    summary,
    loading,
    error,
    createWallet,
    importWallet,
    unlock,
    lock,
    logout,
    refreshSummary,
    sendTon,
  } = useInBuiltWallet();

  const { connectedAddress } = useTonConnect();

  // Creation & Import states
  const [modalMode, setModalMode] = useState(null); // 'create' | 'import' | 'unlock' | 'send' | 'receive' | 'backup'
  const [password, setPassword] = useState('');
  const [importWords, setImportWords] = useState('');
  const [createdWords, setCreatedWords] = useState(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);

  // Send state
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [sendTxHash, setSendTxHash] = useState('');

  // Withdraw temporary balance state
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState('');

  // Active tab
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'swap' | 'transactions'

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      setActionError('Password must be at least 6 characters');
      return;
    }
    setActionError('');
    try {
      const { words } = await createWallet(password);
      setCreatedWords(words);
      setModalMode('backup');
      setPassword('');
    } catch (err) {
      setActionError(err.message || 'Creation failed');
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    const words = importWords.trim().split(/\s+/);
    if (words.length !== 24) {
      setActionError('Mnemonic must be exactly 24 words');
      return;
    }
    if (!password || password.length < 6) {
      setActionError('Password must be at least 6 characters');
      return;
    }
    setActionError('');
    try {
      await importWallet(words, password);
      setModalMode(null);
      setPassword('');
      setImportWords('');
    } catch (err) {
      setActionError(err.message || 'Import failed. Check your phrase.');
    }
  };

  const handleUnlock = async (e) => {
    e.preventDefault();
    setActionError('');
    try {
      await unlock(password);
      setModalMode(null);
      setPassword('');
    } catch (err) {
      setActionError('Incorrect password');
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!sendTo || !sendAmount || Number(sendAmount) <= 0) {
      setActionError('Please enter a valid recipient and amount');
      return;
    }
    setSending(true);
    setActionError('');
    setSendTxHash('');
    try {
      const hash = await sendTon({ to: sendTo, amountTon: sendAmount });
      setSendTxHash(hash);
      setSendAmount('');
      setSendTo('');
      refreshSummary();
    } catch (err) {
      setActionError(err.message || 'Transaction failed');
    } finally {
      setSending(false);
    }
  };

  const handleWithdrawTemporary = async () => {
    if (!address || !summary?.temporaryNano || BigInt(summary.temporaryNano) <= 0n) return;
    setWithdrawing(true);
    setWithdrawMsg('');
    try {
      const res = await api('/wallet/withdraw-temporary', json({
        walletAddress: address,
        amountNano: summary.temporaryNano,
      }));
      setWithdrawMsg(`Withdrawn ${(Number(res.withdrawnNano) / 1e9).toFixed(4)} TON to your wallet!`);
      refreshSummary();
    } catch (err) {
      setWithdrawMsg(`Withdrawal error: ${err.message}`);
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header with network badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white tracking-tight">Non-Custodial Betting Wallet</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              TON Mainnet
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Keys are client-side encrypted via AES-GCM + PBKDF2. No mnemonics ever touch the server.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {connectedAddress ? (
            <div className="text-xs bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl text-slate-300">
              Tonkeeper: <span className="font-mono text-cyan-400">{connectedAddress.slice(0, 4)}...{connectedAddress.slice(-4)}</span>
            </div>
          ) : (
            <TonConnectButton />
          )}
        </div>
      </div>

      {/* Main Wallet Card / Creation Gate */}
      {!isCreated ? (
        <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-3xl">
            💎
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-xl font-bold text-white">Create Your Mainnet Betting Wallet</h2>
            <p className="text-sm text-slate-400">
              Generate a native TON v4R2 non-custodial wallet with a 24-word mnemonic, or import an existing wallet
              phrase from Tonkeeper or MyTonWallet.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto">
            <button
              type="button"
              onClick={() => { setModalMode('create'); setActionError(''); }}
              className="flex-1 py-3 px-5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg transition-all"
            >
              Generate New Wallet
            </button>
            <button
              type="button"
              onClick={() => { setModalMode('import'); setActionError(''); }}
              className="flex-1 py-3 px-5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl border border-slate-700 transition-all"
            >
              Import 24 Words
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Unlocked / Locked status banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Primary Address & Lock State */}
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Active In-Built Wallet</span>
                <div className="flex items-center gap-2">
                  {isUnlocked ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Unlocked
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 flex items-center gap-1">
                      🔒 Locked
                    </span>
                  )}
                  {isUnlocked ? (
                    <button
                      type="button"
                      onClick={lock}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                    >
                      Lock
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setModalMode('unlock')}
                      className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-2.5 py-1 rounded font-semibold"
                    >
                      Unlock to Transact
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                <span className="font-mono text-sm text-cyan-300 truncate select-all">{address}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                    title="Copy Address"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                  <a
                    href={`https://tonscan.org/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                    title="View on Tonscan"
                  >
                    Tonscan ↗
                  </a>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setModalMode('send')}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-sm transition-all shadow"
                >
                  Send TON
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('receive')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-sm border border-slate-700"
                >
                  Receive / QR
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('swap')}
                  className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-600 text-white font-semibold rounded-xl text-sm transition-all shadow"
                >
                  STON.fi Swap
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs rounded-xl border border-rose-800 ml-auto"
                >
                  Disconnect Wallet
                </button>
              </div>
            </div>

            {/* Balances Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Real Mainnet Balance</span>
              <div>
                <div className="text-3xl font-extrabold text-white font-mono">
                  {summary?.tonBalance || '0.00'} <span className="text-cyan-400 text-lg">TON</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  ≈ ₦{((Number(summary?.tonBalance || 0) * (summary?.ngnPerTon || 1590))).toLocaleString(undefined, { maximumFractionDigits: 0 })} NGN
                </div>
              </div>

              {/* Bonus / Voucher Balances */}
              <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Voucher Balance:</span>
                  <span className="font-mono font-bold text-amber-400">
                    {summary?.voucherTon || '0.00'} TON (400% Bonus)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Deposit Bonus:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {summary?.bonusTon || '0.00'} TON (100%)
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                  <span className="text-slate-400">Temporary Winnings:</span>
                  <span className="font-mono font-bold text-cyan-300">
                    {summary?.temporaryTon || '0.00'} TON
                  </span>
                </div>
              </div>

              {Number(summary?.temporaryTon || 0) > 0 && (
                <button
                  type="button"
                  disabled={withdrawing}
                  onClick={handleWithdrawTemporary}
                  className="w-full py-2 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs shadow transition-all"
                >
                  {withdrawing ? 'Withdrawing...' : 'Withdraw Winnings to Wallet'}
                </button>
              )}
              {withdrawMsg && (
                <p className="text-[11px] text-center text-cyan-400">{withdrawMsg}</p>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 space-x-4">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`pb-3 font-semibold text-sm transition-all border-b-2 ${activeTab === 'overview' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              Account Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('swap')}
              className={`pb-3 font-semibold text-sm transition-all border-b-2 ${activeTab === 'swap' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              STON.fi DEX Swap
            </button>
          </div>

          {activeTab === 'swap' && (
            <div className="pt-2">
              <SwapWidget />
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="font-bold text-white text-base">Voucher & Deposit Bonus Policy</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
                  <h4 className="font-bold text-amber-400 text-sm">400% Signup Voucher</h4>
                  <p>
                    Every new account is automatically credited with a voucher worth 400% of ₦1,000 converted to TON at
                    real-time STON.fi rates.
                  </p>
                  <p className="text-slate-400">
                    Use voucher balance to stake on any live market. Winning bets credit withdrawable real TON directly
                    to your temporary balance!
                  </p>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
                  <h4 className="font-bold text-emerald-400 text-sm">100% Deposit Bonus + 400% Recredit</h4>
                  <p>
                    Every incoming deposit detected on-chain automatically adds 100% match bonus plus re-credits the 400%
                    voucher.
                  </p>
                  <p className="text-slate-400">
                    Deposits are scanned automatically via TonCenter Mainnet API. No promo codes needed.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {modalMode === 'create' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Create Wallet Password</h3>
            <p className="text-xs text-slate-400">
              This password encrypts your 24-word phrase locally on this device via AES-GCM + PBKDF2 (100,000 iterations).
            </p>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Set Password (min 6 characters)</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm outline-none focus:border-cyan-500"
              />
            </div>
            {actionError && <p className="text-xs text-rose-400">{actionError}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-sm"
              >
                {loading ? 'Generating...' : 'Generate 24 Words'}
              </button>
            </div>
          </form>
        </div>
      )}

      {modalMode === 'backup' && createdWords && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400"></span>
              <h3 className="text-lg font-bold text-white">Back Up Your 24-Word Recovery Phrase</h3>
            </div>
            <p className="text-xs text-amber-300/90 bg-amber-950/40 border border-amber-800/60 p-2.5 rounded-lg">
              ⚠️ Write these words down on paper in exact order. This phrase is the ONLY way to recover your funds. We
              never store your phrase on any server.
            </p>
            <div className="grid grid-cols-3 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs select-all max-h-60 overflow-y-auto">
              {createdWords.map((word, idx) => (
                <div key={idx} className="flex gap-1.5 p-1 bg-slate-900 rounded border border-slate-800/80">
                  <span className="text-slate-500">{idx + 1}.</span>
                  <span className="text-cyan-300 font-semibold">{word}</span>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-cyan-500"
              />
              <span>I have saved and securely backed up all 24 words.</span>
            </label>
            <button
              type="button"
              disabled={!backupConfirmed}
              onClick={() => { setModalMode(null); setCreatedWords(null); }}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl text-sm"
            >
              Continue to Mainnet
            </button>
          </div>
        </div>
      )}

      {modalMode === 'import' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleImport} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Import TON Mnemonic</h3>
            <p className="text-xs text-slate-400">
              Paste your 24-word mnemonic phrase from Tonkeeper or MyTonWallet.
            </p>
            <div>
              <label className="block text-xs text-slate-300 mb-1">24 Words (separated by spaces)</label>
              <textarea
                rows={4}
                required
                value={importWords}
                onChange={(e) => setImportWords(e.target.value)}
                placeholder="word1 word2 word3 ... word24"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono text-xs outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Create Local Encryption Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm outline-none focus:border-cyan-500"
              />
            </div>
            {actionError && <p className="text-xs text-rose-400">{actionError}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-sm"
              >
                {loading ? 'Importing...' : 'Import & Encrypt'}
              </button>
            </div>
          </form>
        </div>
      )}

      {modalMode === 'unlock' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleUnlock} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Unlock Wallet</h3>
            <p className="text-xs text-slate-400">Enter your password to decrypt private keys in memory for signing.</p>
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm outline-none focus:border-cyan-500"
            />
            {actionError && <p className="text-xs text-rose-400">{actionError}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-sm"
              >
                Unlock
              </button>
            </div>
          </form>
        </div>
      )}

      {modalMode === 'receive' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 text-center shadow-2xl">
            <h3 className="text-lg font-bold text-white">Receive TON Mainnet</h3>
            <div className="bg-white p-4 rounded-xl inline-block shadow-lg">
              <QRCodeSVG value={address} size={160} />
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <p className="font-mono text-xs text-cyan-300 break-all select-all">{address}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyAddress}
                className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-sm"
              >
                {copied ? '✓ Copied' : 'Copy Address'}
              </button>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMode === 'send' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSend} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Send TON Mainnet</h3>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Recipient Address (EQ... or UQ...)</label>
              <input
                type="text"
                required
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="UQ..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Amount (TON)</label>
              <input
                type="number"
                step="0.001"
                min="0.01"
                required
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                placeholder="0.5"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none focus:border-cyan-500"
              />
            </div>
            {actionError && <p className="text-xs text-rose-400">{actionError}</p>}
            {sendTxHash && (
              <div className="p-2 bg-emerald-950/60 border border-emerald-800 rounded text-emerald-300 text-xs">
                Sent! <a href={`https://tonscan.org/tx/${sendTxHash}`} target="_blank" rel="noopener noreferrer" className="underline">View on Tonscan ↗</a>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={sending}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-sm"
              >
                {sending ? 'Signing & Broadcasting...' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
