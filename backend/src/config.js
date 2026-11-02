import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  tonNetwork: process.env.TON_NETWORK || 'mainnet',
  toncenterUrl: (process.env.TONCENTER_URL || 'https://toncenter.com/api/v2').replace(/\/$/, ''),
  toncenterApiKey: process.env.TONCENTER_API_KEY || '',
  publicUrl: process.env.PUBLIC_URL || '',
  tonconnectManifestUrl: `${(process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '')}/tonconnect-manifest.json`,
  escrowContractAddress: process.env.ESCROW_CONTRACT_ADDRESS || '',
  adminWalletAddress: process.env.ADMIN_WALLET_ADDRESS || '',
  minReserveNano: BigInt(Math.floor(Number(process.env.MIN_RESERVE_TON || 10) * 1e9)),
  oddsRefreshSeconds: Math.max(30, Number(process.env.ODDS_REFRESH_SECONDS || 30)),
  oddsSports: (process.env.ODDS_SPORTS || 'nfl,nba,mlb,nhl,soccer').split(',').map(x => x.trim()).filter(Boolean),
  adminApiToken: process.env.ADMIN_API_TOKEN || '',
};
