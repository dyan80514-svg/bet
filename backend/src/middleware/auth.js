import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export function requireAdmin(req, res, next) {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!config.adminApiToken || token.length !== config.adminApiToken.length || !timingSafeEqual(Buffer.from(token), Buffer.from(config.adminApiToken))) return res.status(401).json({ error: 'ADMIN_AUTH_REQUIRED' });
  req.adminActor = 'admin-token';
  next();
}

export function validateBettingEnabled(checkReserve) {
  return async (req, res, next) => {
    try {
      const status = await checkReserve();
      if (!status.enabled) return res.status(503).json({ error: !status.oddsReady ? 'ODDS_FEED_NOT_CONFIGURED_OR_STALE' : 'WAGERING_DISABLED_UNTIL_DEPLOYMENT_AND_RESERVES', status });
      req.reserveStatus = status;
      next();
    } catch (error) { next(error); }
  };
}
