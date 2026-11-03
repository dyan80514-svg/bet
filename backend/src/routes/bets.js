import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { checkReserve } from '../services/reserveService.js';
import { findEscrowTransaction, parseTonAddress } from '../services/tonWalletService.js';
import { getOrCreateUserWithVoucher } from '../services/voucherService.js';

const router = Router();

// Rate limit: 3 req/sec per IP + wallet
const betRateLimiter = rateLimit({
  windowMs: 1000,
  limit: 3,
  keyGenerator: (req) => `${req.ip}_${req.body?.walletAddress || ''}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS_RATE_LIMIT_3_PER_SEC' },
});

const selections = z.enum(['home', 'draw', 'away']);

const placeBetSchema = z.object({
  walletAddress: z.string(),
  gameId: z.string().length(64),
  selection: selections,
  stakeNano: z.string().regex(/^\d+$/).max(30),
  queryId: z.string().regex(/^[1-9]\d{0,19}$/),
  stakeSource: z.enum(['wallet', 'voucher']).default('wallet'),
});

router.post('/place', betRateLimiter, async (req, res, next) => {
  try {
    const input = placeBetSchema.parse(req.body);
    const walletAddress = parseTonAddress(input.walletAddress);

    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game) return res.status(404).json({ error: 'GAME_NOT_FOUND' });
    if (game.status !== 'upcoming' || game.commenceTime.getTime() <= Date.now()) {
      return res.status(409).json({ error: 'MARKET_CLOSED' });
    }

    const oddsData = JSON.parse(game.oddsJson || '{}');
    const price = oddsData?.odds?.[input.selection];
    if (!Number.isFinite(price) || price <= 1) {
      return res.status(409).json({ error: 'SELECTION_UNAVAILABLE' });
    }

    const oddsBps = Math.round(price * 10000);
    const stakeNano = BigInt(input.stakeNano);
    const minStakeNano = 100_000_000n; // 0.1 TON

    if (stakeNano < minStakeNano) {
      return res.status(400).json({ error: 'MINIMUM_STAKE_IS_0_1_TON' });
    }

    const user = await getOrCreateUserWithVoucher(walletAddress);
    if (!user.ageVerified || !user.termsAccepted) {
      return res.status(403).json({ error: 'AGE_AND_TERMS_VERIFICATION_REQUIRED' });
    }
    if (user.selfExcludedAt) {
      return res.status(403).json({ error: 'ACCOUNT_SELF_EXCLUDED' });
    }
    if (user.depositLimit && stakeNano > BigInt(user.depositLimit)) {
      return res.status(403).json({ error: 'BET_EXCEEDS_RESPONSIBLE_GAMBLING_LIMIT' });
    }

    const potentialNano = (stakeNano * BigInt(oddsBps)) / 10000n;

    if (input.stakeSource === 'voucher') {
      const voucherBal = BigInt(user.voucherBalanceNano || '0');
      if (voucherBal < stakeNano) {
        return res.status(400).json({ error: 'INSUFFICIENT_VOUCHER_BALANCE' });
      }

      // Deduct voucher balance and save bet
      const remainingVoucher = (voucherBal - stakeNano).toString();
      const bet = await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { walletAddress },
          data: { voucherBalanceNano: remainingVoucher },
        });

        return tx.bet.create({
          data: {
            walletAddress,
            gameId: game.id,
            selection: input.selection,
            decimalOdds: String(price),
            stakeNano: stakeNano.toString(),
            potentialNano: potentialNano.toString(),
            chainBetId: input.queryId,
            txHash: `voucher_bet_${input.queryId}_${Date.now()}`,
            stakeSource: 'voucher',
            status: 'pending',
          },
        });
      });

      return res.status(201).json({ bet, verified: true, stakeSource: 'voucher' });
    }

    // Real on-chain TON bet: MUST verify on-chain escrow transaction via TonCenter
    const selectionIdx = ['home', 'draw', 'away'].indexOf(input.selection);
    const verified = await findEscrowTransaction({
      walletAddress,
      marketId: input.gameId,
      queryId: input.queryId,
      selection: selectionIdx,
      oddsBps,
      stakeNano: stakeNano.toString(),
    });

    const bet = await prisma.bet.create({
      data: {
        walletAddress,
        gameId: game.id,
        selection: input.selection,
        decimalOdds: String(price),
        stakeNano: stakeNano.toString(),
        potentialNano: potentialNano.toString(),
        chainBetId: input.queryId,
        txHash: verified.txHash,
        stakeSource: 'wallet',
        status: 'pending',
      },
    });

    res.status(201).json({ bet, verifiedOnchain: true, txHash: verified.txHash });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'DUPLICATE_QUERY_ID_ALREADY_USED' });
    }
    next(error);
  }
});

router.get('/mine/:address', async (req, res, next) => {
  try {
    const walletAddress = parseTonAddress(req.params.address);
    const bets = await prisma.bet.findMany({
      where: { walletAddress },
      include: { game: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ bets });
  } catch (error) {
    next(error);
  }
});

export default router;
