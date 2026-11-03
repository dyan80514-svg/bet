import React, { useState, useEffect } from 'react';
import { api, json } from '../api.js';
import { useInBuiltWallet } from '../hooks/useInBuiltWallet.jsx';

export default function AgeGateModal() {
  const { address, summary, refreshSummary } = useInBuiltWallet();
  const [accepted, setAccepted] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isVerified = Boolean(summary?.ageVerified && summary?.termsAccepted);

  if (isVerified || dismissed) return null;

  const handleConfirm = async () => {
    if (!confirmedAge || !accepted) return;
    setSubmitting(true);
    try {
      if (address) {
        await api('/wallet/accept-terms', json({ walletAddress: address, ageVerified: true }));
        await refreshSummary();
      }
      setDismissed(true);
    } catch (err) {
      console.error('Failed to confirm age/terms:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-xl">
            18+
          </div>
          <div>
            <h2 className="text-xl font-bold">Age & Regulatory Verification</h2>
            <p className="text-xs text-slate-400">TON Mainnet Real Wagering Platform</p>
          </div>
        </div>

        <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
          <p>
            You are entering a non-custodial decentralized sports betting platform operating directly on{' '}
            <strong className="text-cyan-400">TON Mainnet</strong>.
          </p>
          <p>
            Wagers involve real Toncoin (TON). Losses and winnings are real and settled on-chain. You must be at least 18
            years of age (or legal gambling age in your jurisdiction) to participate.
          </p>
        </div>

        <div className="space-y-3 pt-2 text-sm text-slate-300">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmedAge}
              onChange={(e) => setConfirmedAge(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0 cursor-pointer"
            />
            <span>I confirm that I am at least 18 years old and legally permitted to wager in my jurisdiction.</span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0 cursor-pointer"
            />
            <span>
              I accept the Terms of Service, Responsible Gambling policy, and acknowledge that all wagers on TON Mainnet
              are final and irreversible.
            </span>
          </label>
        </div>

        <button
          type="button"
          disabled={!confirmedAge || !accepted || submitting}
          onClick={handleConfirm}
          className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.99]"
        >
          {submitting ? 'Verifying...' : 'Enter Mainnet Platform'}
        </button>
      </div>
    </div>
  );
}
