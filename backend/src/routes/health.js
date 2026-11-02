import { Router } from 'express';
import { prisma } from '../db.js';
import { checkReserve } from '../services/reserveService.js';

const router = Router();
router.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const reserve = await checkReserve();
    res.json({ ok: true, database: 'up', wageringEnabled: reserve.enabled, time: new Date().toISOString() });
  } catch (error) { res.status(503).json({ ok: false, error: error.message }); }
});
export default router;
