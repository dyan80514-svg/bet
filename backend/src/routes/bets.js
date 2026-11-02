import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { checkReserve, wageringGateMessage } from '../services/reserveService.js';
import { findClaimTransaction, findEscrowTransaction, parseTonAddress } from '../services/tonWalletService.js';
import { syncSettlements } from '../services/settlementService.js';
import { getLiveOdds } from '../services/oddsService.js';
import { validateBettingEnabled } from '../middleware/auth.js';

const router = Router();
const selections = z.enum(['home', 'draw', 'away']);
const placeSchema = z.object({ walletAddress: z.string(), gameId: z.string().length(64), selection: selections, stakeNano: z.string().regex(/^\d+$/).max(30), queryId: z.string().regex(/^[1-9]\d{0,19}$/) });
router.post('/place', validateBettingEnabled(checkReserve), async (req, res, next) => {
  try {
    const input = placeSchema.parse(req.body);
    const walletAddress = parseTonAddress(input.walletAddress);
    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game) return res.status(404).json({ error: 'GAME_NOT_FOUND' });
    if (!game.marketOpen || !game.postedOddsJson) return res.status(409).json({ error: 'ONCHAIN_MARKET_NOT_OPEN' });
    if (game.status !== 'upcoming' || game.commenceTime.getTime() <= Date.now()) return res.status(409).json({ error: 'MARKET_CLOSED' });
    if (Date.now() - game.lastUpdate.getTime() > 90000) return res.status(409).json({ error: 'ODDS_STALE_REFRESH_BEFORE_BETTING' });
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user?.ageVerified || user.kycStatus !== 'verified') return res.status(403).json({ error: 'AGE_AND_KYC_VERIFICATION_REQUIRED' });
    if (user.selfExcludedAt) return res.status(403).json({ error: 'ACCOUNT_SELF_EXCLUDED' });
    const odds = JSON.parse(game.postedOddsJson);
    const price = odds[input.selection];
    if (!Number.isFinite(price) || price <= 1) return res.status(409).json({ error: 'SELECTION_UNAVAILABLE' });
    const oddsBps = Math.round(price * 10000);
    const stakeNano = BigInt(input.stakeNano);
    if (stakeNano < 100000000n) return res.status(400).json({ error: 'MINIMUM_STAKE_IS_0_1_TON' });
    if (user.depositLimit && stakeNano > BigInt(user.depositLimit)) return res.status(403).json({ error: 'BET_EXCEEDS_RESPONSIBLE_GAMBLING_LIMIT' });
    const marketId = input.gameId;
    const verified = await findEscrowTransaction({ walletAddress, marketId, queryId: input.queryId, selection: ['home', 'draw', 'away'].indexOf(input.selection), oddsBps, stakeNano: stakeNano.toString() });
    const potentialNano = stakeNano * BigInt(oddsBps) / 10000n;
    const bet = await prisma.$transaction(async tx => {
      await tx.user.upsert({ where: { walletAddress }, create: { walletAddress }, update: {} });
      return tx.bet.create({ data: { walletAddress, gameId: game.id, selection: input.selection, decimalOdds: String(price), stakeNano: stakeNano.toString(), potentialNano: potentialNano.toString(), chainBetId: input.queryId, txHash: verified.txHash, status: 'pending' } });
    });
    res.status(201).json({ bet, verifiedOnchain: true, contractAddress: config.escrowContractAddress });
  } catch (error) { next(error); }
});
router.post('/claim/verify', async (req, res, next) => {
  try {
    const input = z.object({ walletAddress: z.string(), queryId: z.string().regex(/^[1-9]\d{0,19}$/) }).parse(req.body);
    const walletAddress = parseTonAddress(input.walletAddress);
    const bet = await prisma.bet.findUnique({ where: { chainBetId: input.queryId } });
    if (!bet || bet.walletAddress !== walletAddress) return res.status(404).json({ error: 'BET_NOT_FOUND' });
    const result = await findClaimTransaction({ walletAddress, queryId: input.queryId });
    await prisma.bet.update({ where: { id: bet.id }, data: { status: 'settled', resultTxHash: result.txHash, settledAt: new Date() } });
    res.json({ verifiedOnchain: true, txHash: result.txHash });
  } catch (error) { next(error); }
});
router.get('/mine/:address', async (req, res, next) => {
  try {
    const walletAddress = parseTonAddress(req.params.address);
    await syncSettlements();
    const bets = await prisma.bet.findMany({ where: { walletAddress }, include: { game: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ bets: bets.map(({ game, ...bet }) => ({ ...bet, game: { id: game.id, sport: game.sport, league: game.league, homeTeam: game.homeTeam, awayTeam: game.awayTeam, commenceTime: game.commenceTime }, queryId: bet.chainBetId })) });
  } catch (error) { next(error); }
});
router.get('/config', async (_req, res, next) => {
  try { const status = await checkReserve(); res.json({ bettingEnabled: status.enabled, message: wageringGateMessage(status) || 'Wagering enabled', status }); }
  catch (error) { next(error); }
});
export default router;
