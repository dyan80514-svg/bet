import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getLiveOdds, getOddsStatus } from '../services/oddsService.js';

const router = Router();
router.get('/live', async (req, res, next) => {
  try {
    const sport = z.string().max(30).optional().parse(req.query.sport);
    const games = await getLiveOdds();
    const ids = games.map(g => g.id);
    const states = await prisma.game.findMany({ where: { id: { in: ids } }, select: { id: true, marketOpen: true, postedOddsJson: true, marketCloseTime: true, result: true } });
    const byId = new Map(states.map(s => [s.id, s]));
    res.json({ games: games.filter(g => !sport || g.sport === sport).map(g => ({ ...g, ...byId.get(g.id), postedOdds: byId.get(g.id)?.postedOddsJson ? JSON.parse(byId.get(g.id).postedOddsJson) : null, outcomeCount: byId.get(g.id)?.postedOddsJson && JSON.parse(byId.get(g.id).postedOddsJson).draw ? 3 : 2, commenceTime: new Date(g.commenceTime).toISOString(), lastUpdate: new Date(g.lastUpdate).toISOString(), bettingAvailable: !g.stale && Date.now() - new Date(g.lastUpdate).getTime() < 90000 && Object.values(g.odds).some(Boolean) })), stale: games.every(g => g.stale) });
  } catch (error) { next(error); }
});
router.get('/cached', async (_req, res, next) => {
  try {
    const items = await prisma.game.findMany({ where: { commenceTime: { gt: new Date(Date.now() - 8 * 60 * 60 * 1000) } }, orderBy: { commenceTime: 'asc' }, take: 300 });
    res.json({ games: items.map(g => ({ ...g, odds: JSON.parse(g.oddsJson).odds, bookmakers: JSON.parse(g.oddsJson).bookmakers })) });
  } catch (error) { next(error); }
});
router.get('/status', (_req, res) => res.json({ sources: getOddsStatus(), label: 'Live odds - No API key - Direct from public sports feeds', disclaimer: 'Direct sportsbook endpoints are undocumented and may change, rate-limit, or restrict access. ESPN provides score/status data, not book odds.' }));
export default router;
