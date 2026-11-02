import { Address, beginCell, toNano } from '@ton/core';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { api, json } from '../api.js';

const PLACE_BET = 0x504c4143;
const CLAIM_BET = 0x434c414d;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function recordWithRetry(path, body) {
  let last;
  for (let i = 0; i < 7; i++) {
    try { return await api(path, json(body)); }
    catch (e) { last = e; if (!String(e.message).includes('NOT_FOUND_OR_NOT_FINAL')) throw e; await wait(1500); }
  }
  throw last;
}
function randomQueryId() {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return ((BigInt(words[0]) << 32n) | BigInt(words[1]) || 1n).toString();
}
async function hashGameId(id) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return BigInt(`0x${[...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('')}`);
}

export function useTonBet() {
  const [tonConnectUI] = useTonConnectUI();
  async function placeBet({ game, selection, stakeTon, config }) {
    if (!tonConnectUI.wallet || !config.escrowAddress || !game.marketOpen) throw new Error('Connect TON wallet and choose an open onchain market.');
    const odds = JSON.parse(game.postedOddsJson || '{}');
    const selectionIndex = game.outcomeCount === 3 ? ({ home: 0, draw: 1, away: 2 })[selection] : ({ home: 0, away: 1 })[selection];
    const price = odds[selection];
    if (!selection || selectionIndex === undefined || !Number.isFinite(price)) throw new Error('That outcome is unavailable.');
    const stakeNano = toNano(stakeTon);
    const oddsBps = Math.round(price * 10000);
    const queryId = randomQueryId();
    const marketId = await hashGameId(game.id);
    const body = beginCell().storeUint(PLACE_BET, 32).storeUint(BigInt(queryId), 64).storeUint(marketId, 256).storeUint(selectionIndex, 8).storeUint(oddsBps, 32).storeAddress(Address.parse(tonConnectUI.wallet.account.address)).storeCoins(stakeNano).endCell().toBoc().toString('base64');
    await tonConnectUI.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 300, network: config.tonNetworkId, messages: [{ address: config.escrowAddress, amount: (stakeNano + toNano('0.1')).toString(), payload: body }] });
    const recorded = await recordWithRetry('/bets/place', { walletAddress: tonConnectUI.wallet.account.address, gameId: game.id, selection, stakeNano: stakeNano.toString(), queryId });
    return { ...recorded, queryId };
  }
  async function claimBet({ queryId, config }) {
    if (!tonConnectUI.wallet || !config.escrowAddress) throw new Error('Connect the TON wallet that placed this bet.');
    const body = beginCell().storeUint(CLAIM_BET, 32).storeUint(BigInt(queryId), 64).endCell().toBoc().toString('base64');
    await tonConnectUI.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 300, network: config.tonNetworkId, messages: [{ address: config.escrowAddress, amount: toNano('0.1').toString(), payload: body }] });
    await recordWithRetry('/bets/claim/verify', { walletAddress: tonConnectUI.wallet.account.address, queryId });
  }
  return { placeBet, claimBet };
}
