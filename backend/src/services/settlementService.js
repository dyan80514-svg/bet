import { Address } from '@ton/core';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { tonClient } from './tonWalletService.js';
import { createHash } from 'node:crypto';

export function marketIdForGame(id) { return createHash('sha256').update(String(id)).digest('hex'); }

export async function syncSettlements() {
  if (!config.escrowContractAddress) return { checked: 0 };
  const positions = await prisma.bet.findMany({ where: { status: { not: 'settled' } }, take: 500, orderBy: { createdAt: 'asc' } });
  let checked = 0;
  for (const bet of positions) {
    try {
      const result = await tonClient.runMethod(Address.parse(config.escrowContractAddress), 'settlementResult', [{ type: 'int', value: BigInt(bet.chainBetId || '0') }]);
      const state = Number(result.stack.readBigNumber());
      const status = ({ 0: 'pending', 1: 'won_unclaimed', 2: 'lost_unclaimed', 3: 'void_unclaimed', 4: 'settled' })[state];
      if (status && status !== bet.status) {
        await prisma.bet.update({ where: { id: bet.id }, data: { status, settledAt: status === 'settled' ? new Date() : undefined } });
        checked++;
      }
    } catch (error) { console.warn(`Settlement sync failed for ${bet.id}:`, error.message); }
  }
  return { checked };
}
