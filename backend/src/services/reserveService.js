import { Address } from '@ton/core';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { getContractBalance, tonClient } from './tonWalletService.js';
import { getOddsStatus } from './oddsService.js';

export async function checkReserve() {
  const balance = await getContractBalance();
  let liabilities = 0n;
  let chainReadOk = false;
  if (balance.configured) {
    try {
      const result = await tonClient.runMethod(Address.parse(config.escrowContractAddress), 'reserved');
      liabilities = result.stack.readBigNumber();
      chainReadOk = true;
    } catch (error) { console.warn('Could not read escrow liability getter:', error.message); }
  }
  const balanceNano = BigInt(balance.nano || '0');
  const funded = Boolean(balance.configured && chainReadOk && config.tonNetwork === 'mainnet' && balanceNano >= liabilities + config.minReserveNano);
  const allStatus = getOddsStatus();
  const sourceStatuses = ['draftkings', 'fanduel', 'actionnetwork'].map(name => allStatus[name]);
  const oddsReady = sourceStatuses.some(s => s.ok && s.updatedAt && Date.now() - new Date(s.updatedAt).getTime() < 120000);
  const enabled = funded && oddsReady;
  await prisma.reserve.upsert({ where: { id: 'ton-mainnet' }, create: { id: 'ton-mainnet', contractAddress: balance.address, balanceNano: balanceNano.toString(), liabilitiesNano: liabilities.toString(), minimumNano: config.minReserveNano.toString(), funded, checkedAt: new Date() }, update: { contractAddress: balance.address, balanceNano: balanceNano.toString(), liabilitiesNano: liabilities.toString(), minimumNano: config.minReserveNano.toString(), funded, checkedAt: new Date() } });
  return { enabled, funded, chainReadOk, network: config.tonNetwork, contractAddress: balance.address, balanceNano: balanceNano.toString(), liabilitiesNano: liabilities.toString(), minimumNano: config.minReserveNano.toString(), oddsReady };
}

export function wageringGateMessage(status) {
  if (!config.escrowContractAddress) return 'WAGERING_DISABLED_UNTIL_DEPLOYMENT_AND_RESERVES';
  if (!status.funded) return 'WAGERING_DISABLED_UNTIL_DEPLOYMENT_AND_RESERVES';
  if (!status.oddsReady) return 'ODDS_FEED_UNAVAILABLE';
  return null;
}
