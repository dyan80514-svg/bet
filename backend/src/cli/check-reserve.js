import { checkReserve } from '../services/reserveService.js';
import { prisma } from '../db.js';

try {
  const result = await checkReserve();
  console.log(JSON.stringify({ bettingEnabled: result.enabled, contractConfigured: Boolean(result.contractAddress), reserveFunded: result.funded, oddsFeedReady: result.oddsReady, balanceNano: result.balanceNano, liabilitiesNano: result.liabilitiesNano, minimumNano: result.minimumNano, contractAddress: result.contractAddress }, null, 2));
  if (!result.enabled) process.exitCode = 1;
} catch (error) { console.error('Reserve check failed:', error.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
