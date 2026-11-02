import { Router } from 'express';
import { z } from 'zod';
import { getAddressBalance, parseTonAddress } from '../services/tonWalletService.js';
import { prisma } from '../db.js';

const router = Router();
router.get('/balance/:address', async (req, res, next) => {
  try { res.json(await getAddressBalance(req.params.address)); }
  catch (error) { next(error); }
});
router.get('/positions/:address', async (req, res, next) => {
  try {
    const walletAddress = parseTonAddress(req.params.address);
    const bets = await prisma.bet.findMany({ where: { walletAddress }, include: { game: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ bets: bets.map(b => ({ ...b, odds: JSON.parse(b.game.oddsJson).odds, game: { ...b.game, oddsJson: undefined } })) });
  } catch (error) { next(error); }
});
router.post('/self-exclusion', async (req, res, next) => {
  try {
    const input = z.object({ walletAddress: z.string(), exclude: z.boolean(), limitNano: z.string().regex(/^\d+$/).optional() }).parse(req.body);
    const walletAddress = parseTonAddress(input.walletAddress);
    const user = await prisma.user.upsert({ where: { walletAddress }, create: { walletAddress, ageVerified: false }, update: {} });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { selfExcludedAt: input.exclude ? new Date() : null, depositLimit: input.limitNano ?? null } });
    res.json({ walletAddress, selfExcluded: Boolean(updated.selfExcludedAt), limitNano: updated.depositLimit });
  } catch (error) { next(error); }
});
export default router;
