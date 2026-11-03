import { Router } from 'express';
import { z } from 'zod';
import { getAddressBalance, parseTonAddress } from '../services/tonWalletService.js';
import { getOrCreateUserWithVoucher, checkAndCreditDeposits, getNgnPerTon } from '../services/voucherService.js';
import { prisma } from '../db.js';

const router = Router();

router.get('/summary/:address', async (req, res, next) => {
  try {
    const walletAddress = parseTonAddress(req.params.address);
    // Check deposits on-chain in real-time
    await checkAndCreditDeposits(walletAddress);
    
    const [onchain, user, ngnRate] = await Promise.all([
      getAddressBalance(walletAddress),
      getOrCreateUserWithVoucher(walletAddress),
      getNgnPerTon(),
    ]);

    res.json({
      address: walletAddress,
      tonBalance: onchain.ton,
      tonNano: onchain.nano,
      voucherNano: user.voucherBalanceNano || '0',
      voucherTon: (Number(user.voucherBalanceNano || '0') / 1e9).toFixed(4),
      bonusNano: user.bonusBalanceNano || '0',
      bonusTon: (Number(user.bonusBalanceNano || '0') / 1e9).toFixed(4),
      temporaryNano: user.temporaryBalanceNano || '0',
      temporaryTon: (Number(user.temporaryBalanceNano || '0') / 1e9).toFixed(4),
      ageVerified: user.ageVerified,
      termsAccepted: user.termsAccepted,
      ngnPerTon: ngnRate,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/accept-terms', async (req, res, next) => {
  try {
    const input = z.object({ walletAddress: z.string(), ageVerified: z.boolean() }).parse(req.body);
    const walletAddress = parseTonAddress(input.walletAddress);
    const user = await prisma.user.upsert({
      where: { walletAddress },
      create: {
        walletAddress,
        ageVerified: input.ageVerified,
        termsAccepted: true,
        kycStatus: 'verified',
      },
      update: {
        ageVerified: input.ageVerified,
        termsAccepted: true,
      },
    });
    res.json({ ok: true, ageVerified: user.ageVerified, termsAccepted: user.termsAccepted });
  } catch (error) {
    next(error);
  }
});

router.post('/withdraw-temporary', async (req, res, next) => {
  try {
    const input = z.object({
      walletAddress: z.string(),
      amountNano: z.string().regex(/^\d+$/),
    }).parse(req.body);

    const walletAddress = parseTonAddress(input.walletAddress);
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    const currentTemp = BigInt(user.temporaryBalanceNano || '0');
    const withdrawAmount = BigInt(input.amountNano);

    if (withdrawAmount <= 0n || withdrawAmount > currentTemp) {
      return res.status(400).json({ error: 'INSUFFICIENT_TEMPORARY_BALANCE' });
    }

    const updated = await prisma.$transaction([
      prisma.user.update({
        where: { walletAddress },
        data: { temporaryBalanceNano: (currentTemp - withdrawAmount).toString() },
      }),
      prisma.transaction.create({
        data: {
          walletAddress,
          txHash: `withdraw_temp_${Date.now()}`,
          kind: 'withdrawal',
          amountNano: withdrawAmount.toString(),
          status: 'confirmed',
        },
      }),
    ]);

    res.json({
      ok: true,
      withdrawnNano: withdrawAmount.toString(),
      remainingTemporaryNano: updated[0].temporaryBalanceNano,
      recipient: walletAddress,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/self-exclusion', async (req, res, next) => {
  try {
    const input = z.object({
      walletAddress: z.string(),
      exclude: z.boolean(),
      limitNano: z.string().regex(/^\d+$/).optional(),
    }).parse(req.body);
    const walletAddress = parseTonAddress(input.walletAddress);
    const updated = await prisma.user.update({
      where: { walletAddress },
      data: {
        selfExcludedAt: input.exclude ? new Date() : null,
        depositLimit: input.limitNano ?? null,
      },
    });
    res.json({
      walletAddress,
      selfExcluded: Boolean(updated.selfExcludedAt),
      limitNano: updated.depositLimit,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
