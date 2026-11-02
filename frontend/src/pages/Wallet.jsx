import { toNano } from '@ton/core';
import { useTonWalletBalance } from '../hooks/useTonWallet.js';
import { api } from '../api.js';

export default function Wallet({ config }) {
  const { wallet, address, balance, error } = useTonWalletBalance();
  return <section className="narrow-page"><div className="section-head"><div><small>YOUR KEYS · YOUR TON ACCOUNT</small><h2>Wallet</h2></div></div>{!address ? <div className="empty-state">Connect a TON wallet to read your onchain balance.</div> : <div className="wallet-card"><span>CONNECTED TON MAINNET ADDRESS</span><code>{address}</code><div className="wallet-large">{balance ? Number(balance.ton).toFixed(4) : '—'} <small>TON</small></div><p>Balance is read from TON Center. Your private key never reaches this app.</p><div className="wallet-separator"/><span>NON-CUSTODIAL BETTING</span><p>Wagers are locked in the escrow contract. Winning bets can be claimed by the same wallet after the result is posted. There is no site deposit balance and no admin withdrawal from an open position.</p><a className="secondary-action" href={`https://tonscan.org/address/${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">View wallet on Tonscan</a>{error && <div className="inline-alert">{error}</div>}{config?.escrowAddress && <small className="muted">Escrow contract: {config.escrowAddress}</small>}</div>}</section>;
}
