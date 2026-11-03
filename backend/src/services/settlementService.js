import { Address, beginCell, toNano } from '@ton/core';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { tonClient, parseTonAddress } from './tonWalletService.js';
import { createHash } from 'node:crypto';

export function marketIdForGame(id) {
  return createHash('sha256').update(String(id)).digest('hex');
}

export async function syncSettlements() {
  // 1. Check all pending bets
  const pendingBets = await prisma.bet.findMany({
    where: { status: 'pending' },
    include: { game: true, user: true },
    take: 100,
  });

  if (!pendingBets.length) return { checked: 0 };

  let settledCount = 0;

  for (const bet of pendingBets) {
    const game = bet.game;
    // Check if game has ended and result is known
    if (game.status === 'ended' && game.result) {
      const isWinner = bet.selection.toLowerCase() === game.result.toLowerCase();
      if (isWinner) {
        // WINNING BET!
        const potential = BigInt(bet.potentialNano);
        const currentTemp = BigInt(bet.user.temporaryBalanceNano || '0');
        const updatedTemp = (currentTemp + potential).toString();

        await prisma.$transaction([
          prisma.user.update({
            where: { walletAddress: bet.walletAddress },
            data: { temporaryBalanceNano: updatedTemp },
          }),
          prisma.bet.update({
            where: { id: bet.id },
            data: {
              status: 'won',
              settledAt: new Date(),
            },
          }),
          prisma.transaction.create({
            data: {
              walletAddress: bet.walletAddress,
              txHash: `win_${bet.id}_${Date.now()}`,
              kind: 'win',
              amountNano: bet.potentialNano,
              status: 'confirmed',
            },
          }),
        ]);
        settledCount++;
      } else {
        // LOSING BET!
        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            status: 'lost',
            settledAt: new Date(),
          },
        });
        settledCount++;
      }
    } else if (config.escrowContractAddress) {
      // Check on-chain escrow state if contract is deployed
      try {
        const result = await tonClient.runMethod(
          Address.parse(config.escrowContractAddress),
          'settlementResult',
          [{ type: 'int', value: BigInt(bet.chainBetId || '0') }]
        );
        const state = Number(result.stack.readBigNumber());
        // 0=pending, 1=won, 2=lost, 3=void, 4=claimed
        if (state === 1) {
          const potential = BigInt(bet.potentialNano);
          const currentTemp = BigInt(bet.user.temporaryBalanceNano || '0');
          const updatedTemp = (currentTemp + potential).toString();
          await prisma.$transaction([
            prisma.user.update({
              where: { walletAddress: bet.walletAddress },
              data: { temporaryBalanceNano: updatedTemp },
            }),
            prisma.bet.update({
              where: { id: bet.id },
              data: { status: 'won', settledAt: new Date() },
            }),
          ]);
          settledCount++;
        } else if (state === 2) {
          await prisma.bet.update({
            where: { id: bet.id },
            data: { status: 'lost', settledAt: new Date() },
          });
          settledCount++;
        }
      } catch (err) {
        // Escrow getter not available yet
      }
    }
  }

  return { checked: pendingBets.length, settled: settledCount };
}
