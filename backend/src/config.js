import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { Address } from '@ton/core';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

function validateAddress(addr, fieldName) {
  if (!addr) {
    throw new Error(`FATAL CONFIGURATION ERROR: ${fieldName} must be set. Real wagering requires a valid TON Mainnet address.`);
  }
  try {
    return Address.parse(addr).toString({ urlSafe: true, bounceable: false });
  } catch {
    throw new Error(`FATAL CONFIGURATION ERROR: ${fieldName} is not a valid TON address: "${addr}"`);
  }
}

function validateSecret(val, fieldName) {
  if (!val || typeof val !== 'string') {
    throw new Error(`FATAL CONFIGURATION ERROR: ${fieldName} must be set.`);
  }
  if (val.length < 32 || val.includes('replace-with') || val.includes('default') || val === 'secret') {
    throw new Error(`FATAL CONFIGURATION ERROR: ${fieldName} must be a secure random string of at least 32 characters.`);
  }
  return val;
}

const nodeEnv = process.env.NODE_ENV || 'production';
const databaseUrl = process.env.DATABASE_URL || '';

if (nodeEnv === 'production' && (!databaseUrl || databaseUrl.startsWith('file:') || databaseUrl.startsWith('sqlite:'))) {
  throw new Error('FATAL CONFIGURATION ERROR: Production mode requires PostgreSQL DATABASE_URL. SQLite is prohibited for production wagering.');
}

const minReserveTon = Math.max(50, Number(process.env.MIN_RESERVE_TON || 50));
const escrowAddr = process.env.ESCROW_CONTRACT_ADDRESS || '';
const adminWallet = process.env.ADMIN_MAINNET_WALLET || process.env.ADMIN_WALLET_ADDRESS || '';

// Fail-to-start validation for production
const adminApiToken = validateSecret(process.env.ADMIN_API_TOKEN, 'ADMIN_API_TOKEN');
const jwtSecret = validateSecret(process.env.JWT_SECRET, 'JWT_SECRET');

// Validate Escrow contract & Admin wallet
const escrowContractAddress = validateAddress(escrowAddr, 'ESCROW_CONTRACT_ADDRESS');
const adminWalletAddress = validateAddress(adminWallet, 'ADMIN_MAINNET_WALLET');

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:8080,http://localhost:5173',
  tonNetwork: 'mainnet', // TON Mainnet ONLY
  toncenterUrl: (process.env.TON_API_URL || process.env.TONCENTER_URL || 'https://toncenter.com/api/v2').replace(/\/$/, ''),
  toncenterApiKey: process.env.TONCENTER_MAINNET_API_KEY || process.env.TONCENTER_API_KEY || '',
  publicUrl: process.env.PUBLIC_URL || '',
  tonconnectManifestUrl: `${(process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '')}/tonconnect-manifest.json`,
  escrowContractAddress,
  adminWalletAddress,
  stonfiRouterAddress: process.env.STONFI_ROUTER_ADDRESS || 'EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt',
  minReserveNano: BigInt(minReserveTon) * 1_000_000_000n,
  minReserveTon,
  oddsRefreshSeconds: Math.max(15, Number(process.env.ODDS_REFRESH_SECONDS || 15)),
  oddsSports: (process.env.ODDS_SPORTS || 'nba,nfl,mlb,nhl,soccer').split(',').map(x => x.trim()).filter(Boolean),
  adminApiToken,
  jwtSecret,
};
