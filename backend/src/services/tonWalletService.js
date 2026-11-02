import { Address, fromNano } from '@ton/core';
import { TonClient } from '@ton/ton';
import { config } from '../config.js';

export const tonClient = new TonClient({ endpoint: config.toncenterUrl, apiKey: config.toncenterApiKey || undefined });

export function parseTonAddress(value) {
  try { return Address.parse(value).toString({ urlSafe: true, bounceable: false }); }
  catch { throw Object.assign(new Error('INVALID_TON_ADDRESS'), { status: 400 }); }
}

export async function getAddressBalance(address) {
  const normalized = parseTonAddress(address);
  const nano = await tonClient.getBalance(Address.parse(normalized));
  return { address: normalized, nano: nano.toString(), ton: fromNano(nano), network: config.tonNetwork };
}

export async function getContractBalance() {
  if (!config.escrowContractAddress) return { configured: false, address: null, nano: '0', ton: '0' };
  return { configured: true, ...(await getAddressBalance(config.escrowContractAddress)) };
}

export async function findEscrowTransaction({ walletAddress, marketId, queryId, selection, oddsBps, stakeNano }) {
  if (!config.escrowContractAddress) throw Object.assign(new Error('WAGERING_DISABLED_UNTIL_DEPLOYMENT_AND_RESERVES'), { status: 503 });
  const escrow = Address.parse(config.escrowContractAddress);
const wallet = parseTonAddress(walletAddress);
  const transactions = await tonClient.getTransactions(escrow, { limit: 100 });
  for (const tx of transactions) {
    const phase = tx.description;
    if (!phase || !('computePhase' in phase) || phase.computePhase.type !== 'vm' || !phase.computePhase.success || phase.aborted || (phase.type === 'generic' && phase.actionPhase && !phase.actionPhase.success)) continue;
    const message = tx.inMessage;
    if (!message || message.info.type !== 'internal' || message.info.src.toString({ urlSafe: true, bounceable: false }) !== wallet) continue;
    try {
      const body = message.body.beginParse();
      if (body.loadUint(32) !== 0x504c4143) continue;
      const foundQueryId = body.loadUintBig(64).toString();
      const foundMarketId = body.loadUintBig(256).toString(16).padStart(64, '0');
      const foundSelection = body.loadUint(8);
      const foundOddsBps = body.loadUint(32);
      const foundWallet = body.loadAddress().toString({ urlSafe: true, bounceable: false });
      const foundStake = body.loadCoins().toString();
      if (foundQueryId !== String(queryId) || foundMarketId.toLowerCase() !== String(marketId).replace(/^0x/, '').toLowerCase() || foundSelection !== Number(selection) || foundOddsBps !== Number(oddsBps) || foundWallet !== wallet || foundStake !== String(stakeNano)) continue;
      return { txHash: tx.hash().toString('hex'), queryId: foundQueryId, valueNano: message.info.value.coins.toString() };
    } catch { /* unrelated transaction body */ }
  }
  throw Object.assign(new Error('BET_TRANSACTION_NOT_FOUND_OR_NOT_FINAL'), { status: 409 });
}

export async function findClaimTransaction({ walletAddress, queryId }) {
  if (!config.escrowContractAddress) throw Object.assign(new Error('WAGERING_DISABLED_UNTIL_DEPLOYMENT_AND_RESERVES'), { status: 503 });
  const wallet = parseTonAddress(walletAddress);
  const transactions = await tonClient.getTransactions(Address.parse(config.escrowContractAddress), { limit: 100 });
  for (const tx of transactions) {
    const phase = tx.description;
    if (!phase || !('computePhase' in phase) || phase.computePhase.type !== 'vm' || !phase.computePhase.success || phase.aborted || (phase.type === 'generic' && phase.actionPhase && !phase.actionPhase.success)) continue;
    const message = tx.inMessage;
    if (!message || message.info.type !== 'internal' || message.info.src.toString({ urlSafe: true, bounceable: false }) !== wallet) continue;
    try {
      const body = message.body.beginParse();
      if (body.loadUint(32) !== 0x434c414d || body.loadUintBig(64).toString() !== String(queryId)) continue;
      return { txHash: tx.hash().toString('hex'), queryId: String(queryId) };
    } catch { /* unrelated transaction body */ }
  }
  throw Object.assign(new Error('CLAIM_TRANSACTION_NOT_FOUND_OR_NOT_FINAL'), { status: 409 });
}

export async function findAdminContractMessage({ op, marketId, expected, result }) {
  if (!config.escrowContractAddress || !config.adminWalletAddress) throw Object.assign(new Error('ESCROW_OR_ADMIN_WALLET_NOT_CONFIGURED'), { status: 503 });
  const admin = parseTonAddress(config.adminWalletAddress);
  const transactions = await tonClient.getTransactions(Address.parse(config.escrowContractAddress), { limit: 100 });
  for (const tx of transactions) {
    const phase = tx.description;
    if (!phase || !('computePhase' in phase) || phase.computePhase.type !== 'vm' || !phase.computePhase.success || phase.aborted || (phase.type === 'generic' && phase.actionPhase && !phase.actionPhase.success)) continue;
    const message = tx.inMessage;
    if (!message || message.info.type !== 'internal' || message.info.src.toString({ urlSafe: true, bounceable: false }) !== admin) continue;
    try {
      const body = message.body.beginParse();
      if (body.loadUint(32) !== op) continue;
      const foundMarketId = body.loadUintBig(256).toString(16).padStart(64, '0');
      if (foundMarketId.toLowerCase() !== marketId.replace(/^0x/, '').toLowerCase()) continue;
      if (op === 0x4d4b544f) {
        const values = { outcomeCount: body.loadUint(8), closesAt: Number(body.loadUintBig(64)), homeOdds: body.loadUint(32), drawOdds: body.loadUint(32), awayOdds: body.loadUint(32) };
        if (Object.entries(expected).some(([key, value]) => values[key] !== value)) continue;
        return { txHash: tx.hash().toString('hex') };
      }
      if (op === 0x52534c54 && body.loadUint(8) === result) return { txHash: tx.hash().toString('hex') };
    } catch { /* unrelated contract transaction */ }
  }
  throw Object.assign(new Error('ADMIN_TRANSACTION_NOT_FOUND_OR_NOT_FINAL'), { status: 409 });
}
