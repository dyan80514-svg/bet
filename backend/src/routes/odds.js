import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getLiveOdds, getOddsStatus } from '../services/oddsService.js';

const router = Router();
const refreshLimit = rateLimit({ windowMs: 60_000, limit: 2, standardHeaders: true, legacyHeaders: false });
router.get('/status', (_req, res) => res.json({ sources: getOddsStatus(), apiKeyRequired: false }));
router.post('/refresh', refreshLimit, async (_req, res, next) => {
  try { const games = await getLiveOdds({ force: true }); res.json({ updated: games.length, sources: getOddsStatus() }); }
  catch (error) { next(error); }
});
export default router;
