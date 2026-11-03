import { Address, beginCell, toNano } from '@ton/core';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { useInBuiltWallet } from './useInBuiltWallet.jsx';
import { api, json } from '../api.js';

const PLACE_BET = 0x504c4143;
const CLAIM_BET = 0x434c414d;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function recordWithRetry(path, body) {
  let last;
  for (let i = 0; i < 8; i++) {
    try {
      return await api(path, json(body));
    } catch (e) {
      last = e;
      if (!String(e.message).includes('NOT_FOUND_OR_NOT_FINAL')) throw e;
      await wait(1800);
    }
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
  const inBuiltWallet = useInBuiltWallet();

  async function placeBet({ game, selection, stakeTon, config, useVoucher = false }) {
    const activeAddress = inBuiltWallet.address || tonConnectUI.wallet?.account?.address;
    if (!activeAddress) throw new Error('Please create, unlock or connect a TON wallet.');

    const odds = typeof game.odds === 'object' ? game.odds : JSON.parse(game.postedOddsJson || game.oddsJson || '{}');
    const price = odds?.[selection];
    if (!selection || !Number.isFinite(price)) throw new Error('Selected outcome is currently unavailable.');

    const selectionIndex = ({ home: 0, draw: 1, away: 2 })[selection] ?? 0;
    const stakeNano = toNano(stakeTon);
    const oddsBps = Math.round(price * 10000);
    const queryId = randomQueryId();

    // 1. Voucher Stake (Gasless off-chain promotion)
    if (useVoucher) {
      const voucherBalNano = BigInt(inBuiltWallet.summary?.voucherNano || '0');
      if (voucherBalNano < stakeNano) {
        throw new Error('Insufficient voucher balance for this stake.');
      }

      const res = await api('/bets/place', json({
        walletAddress: activeAddress,
        gameId: game.id,
        selection,
        stakeNano: stakeNano.toString(),
        queryId,
        stakeSource: 'voucher',
      }));

      await inBuiltWallet.refreshSummary();
      return { ...res, queryId, stakeSource: 'voucher' };
    }

    // 2. Real TON On-Chain Stake to Tolk Escrow Contract
    if (!config?.escrowAddress) {
      throw new Error('Escrow contract address not configured.');
    }

    const marketId = await hashGameId(game.id);
    const bodyCell = beginCell()
      .storeUint(PLACE_BET, 32)
      .storeUint(BigInt(queryId), 64)
      .storeUint(marketId, 256)
      .storeUint(selectionIndex, 8)
      .storeUint(oddsBps, 32)
      .storeAddress(Address.parse(activeAddress))
      .storeCoins(stakeNano)
      .endCell();

    let txHash = '';

    if (inBuiltWallet.address && inBuiltWallet.isUnlocked) {
      // Sign with in-built non-custodial wallet client-side
      txHash = await inBuiltWallet.sendTon({
        to: config.escrowAddress,
        amountTon: (Number(stakeTon) + 0.05).toString(),
        payload: bodyCell,
      });
    } else if (tonConnectUI.wallet) {
      // Fallback: Sign with Tonkeeper
      const bodyBase64 = bodyCell.toBoc().toString('base64');
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{
          address: config.escrowAddress,
          amount: (stakeNano + toNano('0.05')).toString(),
          payload: bodyBase64,
        }],
      });
      txHash = txResult?.boc ? 'submitted' : '';
    } else {
      throw new Error('In-built wallet is locked. Please unlock it in Wallet tab first.');
    }

    // Verify on-chain via backend TonCenter API
    const recorded = await recordWithRetry('/bets/place', {
      walletAddress: activeAddress,
      gameId: game.id,
      selection,
      stakeNano: stakeNano.toString(),
      queryId,
      stakeSource: 'wallet',
    });

    await inBuiltWallet.refreshSummary();
    return { ...recorded, queryId, txHash };
  }

  return { placeBet };
}
