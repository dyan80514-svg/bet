import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { checkReserve } from '../services/reserveService.js';
import { config } from '../config.js';
import { getOddsStatus } from '../services/oddsService.js';
import { findAdminContractMessage, parseTonAddress } from '../services/tonWalletService.js';
import { syncSettlements } from '../services/settlementService.js';
import { createHash } from 'node:crypto';

const router = Router();
const hashGameId = id => createHash('sha256').update(String(id)).digest('hex');
router.post('/market/open', async (req, res, next) => {
  try {
    const input = z.object({ gameId: z.string().length(64), closesAt: z.number().int().positive() }).parse(req.body);
    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game || game.commenceTime.getTime() <= Date.now()) return res.status(404).json({ error: 'FUTURE_GAME_NOT_FOUND' });
    if (Math.floor(game.commenceTime.getTime() / 1000) !== input.closesAt) return res.status(400).json({ error: 'CLOSE_TIME_MUST_MATCH_SCHEDULED_START' });
    const odds = JSON.parse(game.oddsJson).odds;
    if (!Number.isFinite(odds.home) || !Number.isFinite(odds.away)) return res.status(409).json({ error: 'HOME_AND_AWAY_ODDS_REQUIRED' });
    const outcomeCount = Number.isFinite(odds.draw) ? 3 : 2;
    const posted = { home: Math.round(odds.home * 10000) / 10000, ...(outcomeCount === 3 ? { draw: Math.round(odds.draw * 10000) / 10000 } : {}), away: Math.round(odds.away * 10000) / 10000 };
    const expected = { outcomeCount, closesAt: input.closesAt, homeOdds: Math.round(posted.home * 10000), drawOdds: Math.round((posted.draw || 1) * 10000), awayOdds: Math.round(posted.away * 10000) };
    const chainTx = await findAdminContractMessage({ op: 0x4d4b544f, marketId: hashGameId(game.id), expected });
    await prisma.game.update({ where: { id: game.id }, data: { marketOpen: true, marketCloseTime: new Date(input.closesAt * 1000), postedOddsJson: JSON.stringify(posted) } });
    await prisma.auditLog.create({ data: { actor: config.adminWalletAddress, action: 'market.open', subject: game.id, metadata: JSON.stringify({ txHash: chainTx.txHash, posted }) } });
    res.json({ opened: true, txHash: chainTx.txHash, marketId: hashGameId(game.id), postedOdds: posted });
  } catch (error) { next(error); }
});
router.post('/results', async (req, res, next) => {
  try {
    const input = z.object({ gameId: z.string().length(64), result: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(255)]) }).parse(req.body);
    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game?.marketOpen) return res.status(404).json({ error: 'ONCHAIN_MARKET_NOT_REGISTERED' });
    const count = JSON.parse(game.postedOddsJson).draw ? 3 : 2;
    if (input.result !== 255 && input.result >= count) return res.status(400).json({ error: 'RESULT_INDEX_NOT_IN_MARKET' });
    const chainTx = await findAdminContractMessage({ op: 0x52534c54, marketId: hashGameId(game.id), result: input.result });
    await prisma.game.update({ where: { id: game.id }, data: { result: String(input.result), status: 'ended' } });
    await prisma.auditLog.create({ data: { actor: config.adminWalletAddress, action: 'market.resolve', subject: game.id, metadata: JSON.stringify({ txHash: chainTx.txHash, result: input.result }) } });
    await syncSettlements();
    res.json({ resolved: true, txHash: chainTx.txHash, result: input.result });
  } catch (error) { next(error); }
});
router.use(requireAdmin);
router.get('/status', async (_req, res, next) => {
  try { res.json({ reserve: await checkReserve(), oddsSources: getOddsStatus(), escrowAddress: config.escrowContractAddress || null, adminWalletAddress: config.adminWalletAddress || null }); }
  catch (error) { next(error); }
});
router.get('/games', async (_req, res, next) => {
  try { res.json({ games: await prisma.game.findMany({ orderBy: { commenceTime: 'asc' }, take: 300 }) }); }
  catch (error) { next(error); }
});
router.post('/kyc/verify', async (req, res, next) => {
  try {
    const input = z.object({ walletAddress: z.string(), ageVerified: z.literal(true), providerReference: z.string().min(6).max(100) }).parse(req.body);
    const walletAddress = parseTonAddress(input.walletAddress);
    const user = await prisma.user.upsert({ where: { walletAddress }, create: { walletAddress, ageVerified: true, kycStatus: 'verified' }, update: { ageVerified: true, kycStatus: 'verified' } });
    await prisma.auditLog.create({ data: { actor: req.adminActor, action: 'kyc.verify', subject: walletAddress, metadata: JSON.stringify({ providerReference: input.providerReference }) } });
    res.json({ walletAddress: user.walletAddress, ageVerified: true, kycStatus: 'verified' });
  } catch (error) { next(error); }
});
router.post('/settings/odds-sources', async (req, res, next) => {
  try {
    const input = z.object({ sources: z.array(z.enum(['draftkings', 'fanduel', 'actionnetwork', 'espn'])).min(1).max(4) }).parse(req.body);
    await prisma.appSettings.upsert({ where: { key: 'odds_sources' }, create: { key: 'odds_sources', value: JSON.stringify([...new Set(input.sources)]) }, update: { value: JSON.stringify([...new Set(input.sources)]) } });
    await prisma.auditLog.create({ data: { actor: req.adminActor, action: 'settings.odds-sources', metadata: JSON.stringify(input) } });
    res.json({ saved: true, sources: [...new Set(input.sources)] });
  } catch (error) { next(error); }
});
router.get('/audit', async (req, res, next) => {
  try { const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }); res.json({ entries }); }
  catch (error) { next(error); }
});
export default router;
