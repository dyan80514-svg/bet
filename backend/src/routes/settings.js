import { Router } from 'express';
import { prisma } from '../db.js';
import { getOddsStatus } from '../services/oddsService.js';

const router = Router();
router.get('/', async (_req, res, next) => {
  try {
    const entries = await prisma.appSettings.findMany({ where: { key: { in: ['odds_sources', 'responsible_gambling'] } } });
    res.json({ oddsSources: JSON.parse(entries.find(x => x.key === 'odds_sources')?.value || '["draftkings","fanduel","actionnetwork","espn"]'), sourceStatus: getOddsStatus(), apiKeyRequired: false, responsibleGambling: JSON.parse(entries.find(x => x.key === 'responsible_gambling')?.value || '{"minimumAge":18,"selfExclusionAvailable":true}') });
  } catch (error) { next(error); }
});
export default router;
