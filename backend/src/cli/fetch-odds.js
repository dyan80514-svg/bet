import { getLiveOdds } from '../services/oddsService.js';
import { prisma } from '../db.js';

try {
  const games = await getLiveOdds({ force: true });
  console.log(JSON.stringify({ fetchedGames: games.length, games: games.slice(0, 5).map(({ id, sport, homeTeam, awayTeam, odds, bookmakers }) => ({ id, sport, homeTeam, awayTeam, odds, bookmakers })) }, null, 2));
} finally { await prisma.$disconnect(); }
