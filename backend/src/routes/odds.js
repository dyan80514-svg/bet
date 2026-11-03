import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getLiveOdds, getOddsStatus } from '../services/oddsService.js';

const router = Router();
const refreshLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.get('/live', async (_req, res, next) => {
  try {
    const games = await getLiveOdds();
    res.json({
      success: true,
      count: games.length,
      games: games.map(g => ({
        id: g.id,
        sport: g.sport,
        league: g.league,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        commenceTime: g.commenceTime,
        status: g.status,
        odds: g.odds,
        bookmakers: g.bookmakers,
        stale: Boolean(g.stale),
        lastUpdate: g.lastUpdate,
      })),
      sources: getOddsStatus(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/status', (_req, res) => res.json({ sources: getOddsStatus(), apiKeyRequired: false }));

router.post('/refresh', refreshLimit, async (_req, res, next) => {
  try {
    const games = await getLiveOdds({ force: true });
    res.json({ updated: games.length, sources: getOddsStatus() });
  } catch (error) {
    next(error);
  }
});

export default router;
