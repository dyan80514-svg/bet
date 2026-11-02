import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { prisma } from './db.js';
import { startOddsScheduler } from './services/oddsService.js';
import { syncSettlements } from './services/settlementService.js';
import { checkReserve } from './services/reserveService.js';
import games from './routes/games.js';
import odds from './routes/odds.js';
import wallet from './routes/wallet.js';
import bets from './routes/bets.js';
import admin from './routes/admin.js';
import settings from './routes/settings.js';
import health from './routes/health.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'", 'https:', 'wss:'], frameSrc: ['https:'], objectSrc: ["'none'"], baseUri: ["'self'"] } } }));
app.use(cors({ origin: config.frontendOrigin.split(',').map(s => s.trim()), credentials: false, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '32kb', strict: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
app.get('/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true, database: 'up', time: new Date().toISOString() }); }
  catch { res.status(503).json({ ok: false, database: 'down' }); }
});
app.use('/api/health', health);
app.use('/api/games', games);
app.use('/api/odds', odds);
app.use('/api/wallet', wallet);
app.use('/api/bets', bets);
app.use('/api/admin', admin);
app.use('/api/settings', settings);
app.get('/api/config', async (_req, res, next) => {
  try { const reserve = await checkReserve(); res.set('Cache-Control', 'no-store').json({ network: config.tonNetwork, tonNetworkId: config.tonNetwork === 'mainnet' ? '-239' : '-3', manifestUrl: config.tonconnectManifestUrl, escrowAddress: config.escrowContractAddress || null, adminWalletAddress: config.adminWalletAddress || null, minimumStakeNano: '100000000', apiKeyRequired: false, bettingEnabled: reserve.enabled, disabledReason: reserve.enabled ? null : !reserve.oddsReady ? 'Odds feed not configured or stale' : 'Wagering unavailable - deployment/reserves/odds feed not configured', reserve }); }
  catch (error) { next(error); }
});
app.get('/tonconnect-manifest.json', (_req, res) => {
  if (!config.publicUrl.startsWith('https://') && config.nodeEnv === 'production') return res.status(503).json({ error: 'PUBLIC_URL must use HTTPS in production.' });
  const origin = (config.publicUrl || config.frontendOrigin.split(',')[0]).replace(/\/$/, '');
  res.set('Access-Control-Allow-Origin', '*').set('Cache-Control', 'public, max-age=300').json({ url: origin, name: 'Fairplay TON', iconUrl: `${origin}/icon.png` });
});
app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', path: req.path }));
app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : error.name === 'ZodError' ? 400 : 500;
  if (status >= 500) console.error('Request failed:', error.message);
  res.status(status).json({ error: status === 500 ? 'INTERNAL_SERVER_ERROR' : error.name === 'ZodError' ? 'INVALID_REQUEST' : error.message, ...(error.name === 'ZodError' ? { details: error.issues.map(i => ({ path: i.path, message: i.message })) } : {}) });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`TON betting API listening on :${config.port}; network=${config.tonNetwork}; odds API key required=false`);
  startOddsScheduler();
  setInterval(() => syncSettlements().catch(e => console.error('Settlement sync failed:', e.message)), 30_000).unref();
});
async function shutdown() { server.close(); await prisma.$disconnect(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
