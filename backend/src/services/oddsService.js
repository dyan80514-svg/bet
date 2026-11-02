import { createHash } from 'node:crypto';
import cron from 'node-cron';
import { config } from '../config.js';
import { prisma } from '../db.js';

const LEAGUES = { nfl: { id: 88808, espn: 'football/nfl' }, nba: { id: 42648, espn: 'basketball/nba' }, mlb: { id: 84240, espn: 'baseball/mlb' }, nhl: { id: 42133, espn: 'hockey/nhl' } };
const cache = new Map();
const sourceStatus = new Map(['draftkings', 'fanduel', 'actionnetwork', 'espn'].map(s => [s, { ok: false, updatedAt: null, error: 'not fetched', games: 0 }]));
let refreshing = null;
const stamp = () => new Date().toISOString();
const americanToDecimal = raw => {
  const value = Number(String(raw ?? '').replace(/[+\s]/g, ''));
  if (!Number.isFinite(value) || value === 0) return null;
  return value > 0 ? 1 + value / 100 : 1 + 100 / Math.abs(value);
};
const parsePrice = o => {
  const dec = Number(o?.decimalOdds ?? o?.decimal ?? o?.priceDecimal);
  if (Number.isFinite(dec) && dec > 1 && dec <= 100) return dec;
  return americanToDecimal(o?.americanOdds ?? o?.american ?? o?.price ?? o?.odds);
};
const matchKey = g => createHash('sha256').update(`${g.sport}|${g.awayTeam.toLowerCase()}|${g.homeTeam.toLowerCase()}|${Math.floor(new Date(g.commenceTime).getTime() / 60000)}`).digest('hex');
function baseGame({ source, sourceId, sport, league, awayTeam, homeTeam, commenceTime }) {
  const date = new Date(commenceTime);
  if (!awayTeam || !homeTeam || Number.isNaN(date.getTime())) return null;
  return { id: matchKey({ sport, awayTeam, homeTeam, commenceTime: date }), sourceId: String(sourceId), source, sport, league: league || sport.toUpperCase(), homeTeam: String(homeTeam).trim(), awayTeam: String(awayTeam).trim(), commenceTime: date, status: date.getTime() <= Date.now() ? 'live' : 'upcoming', odds: { home: null, draw: null, away: null, over: null, under: null }, bookmaker: source, lastUpdate: new Date() };
}
async function getJson(url, source, headers = {}) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; FairplayOdds/1.0)', ...headers }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`${source} HTTP ${response.status}`);
      return await response.json();
    } catch (e) { last = e; if (attempt === 0) await new Promise(r => setTimeout(r, 400)); }
  }
  throw last;
}
function mapDraftKings(data, sport) {
  const events = new Map((data.events || []).map(e => [String(e.id), e]));
  const markets = data.markets || [], selections = data.selections || [], byEvent = new Map();
  for (const market of markets) {
    const event = events.get(String(market.eventId));
    if (!event || !String(event.name || '').includes(' @ ')) continue;
    const [awayTeam, homeTeam] = event.name.split(' @ ', 2);
    const g = baseGame({ source: 'draftkings', sourceId: event.id, sport, league: sport.toUpperCase(), awayTeam, homeTeam, commenceTime: event.startEventDate });
    if (!g) continue;
    const target = byEvent.get(g.id) || g;
    const rows = selections.filter(s => String(s.marketId) === String(market.id));
    const marketName = String(market.name || '').toLowerCase();
    for (const row of rows) {
      const label = String(row.label || '').toLowerCase(), price = parsePrice(row.displayOdds || row);
      if (!price) continue;
      if (marketName.includes('moneyline')) {
        if (label.includes(homeTeam.toLowerCase())) target.odds.home = price;
        else if (label.includes(awayTeam.toLowerCase())) target.odds.away = price;
        else if (label === 'draw') target.odds.draw = price;
      } else if (marketName === 'total') {
        if (label.includes('over')) target.odds.over = price;
        if (label.includes('under')) target.odds.under = price;
      }
    }
    byEvent.set(g.id, target);
  }
  return [...byEvent.values()].filter(g => g.odds.home || g.odds.away || g.odds.draw || g.odds.over || g.odds.under);
}
function mapFanDuel(data, sport) {
  const attachments = data.attachments || {}, events = attachments.events || {}, markets = attachments.markets || {};
  const out = new Map();
  for (const market of Object.values(markets)) {
    const event = events[String(market.eventId)];
    if (!event || !String(event.name || '').includes(' @ ')) continue;
    const [awayRaw, homeRaw] = event.name.split(' @ ', 2), awayTeam = awayRaw.split(' (')[0], homeTeam = homeRaw.split(' (')[0];
    const g = baseGame({ source: 'fanduel', sourceId: market.eventId, sport, league: sport.toUpperCase(), awayTeam, homeTeam, commenceTime: event.openDate });
    if (!g) continue;
    const target = out.get(g.id) || g, name = String(market.marketName || '').toLowerCase();
    for (const runner of market.runners || []) {
      const label = String(runner.runnerName || '').toLowerCase(), price = parsePrice(runner.winRunnerOdds?.americanDisplayOdds || runner.winRunnerOdds || runner);
      if (!price) continue;
      if (name.includes('moneyline')) {
        if (label.includes(homeTeam.toLowerCase())) target.odds.home = price;
        else if (label.includes(awayTeam.toLowerCase())) target.odds.away = price;
        else if (label === 'draw') target.odds.draw = price;
      } else if (name.includes('total')) {
        if (label.includes('over')) target.odds.over = price;
        if (label.includes('under')) target.odds.under = price;
      }
    }
    out.set(g.id, target);
  }
  return [...out.values()].filter(g => Object.values(g.odds).some(Boolean));
}
function mapActionNetwork(data, sport) {
  const games = Array.isArray(data) ? data : data.games || data.events || data.scoreboard || [];
  return games.flatMap(raw => {
    const comp = raw.competitions?.[0] || raw.competition || raw;
    const sides = comp.competitors || raw.teams || [];
    const home = sides.find(t => t.home_away === 'home' || t.is_home === true || Number(t.id) === Number(raw.home_team_id)) || sides[0];
    const away = sides.find(t => t.home_away === 'away' || t.is_home === false || Number(t.id) === Number(raw.away_team_id)) || sides[1];
    const g = baseGame({ source: 'actionnetwork', sourceId: raw.id || comp.id, sport, league: raw.league_name || sport.toUpperCase(), awayTeam: away?.full_name || away?.name || away?.team_name, homeTeam: home?.full_name || home?.name || home?.team_name, commenceTime: raw.start_time || raw.start_date || raw.start_time || comp.start_time });
    if (!g) return [];
    const prices = raw.latest_odds?.game || raw.odds || comp.odds || raw.lines || {};
    g.odds.home = parsePrice({ american: prices.ml_home ?? prices.home_odds ?? prices.home });
    g.odds.away = parsePrice({ american: prices.ml_away ?? prices.away_odds ?? prices.away });
    g.odds.draw = parsePrice({ american: prices.ml_draw ?? prices.draw_odds ?? prices.draw });
    g.odds.over = parsePrice({ american: prices.over_odds ?? prices.over });
    g.odds.under = parsePrice({ american: prices.under_odds ?? prices.under });
    if (raw.status === 'complete' || raw.real_status === 'closed') g.status = 'ended';
    else if (/live|in.progress/i.test(String(raw.status || raw.real_status || ''))) g.status = 'live';
    return Object.values(g.odds).some(Boolean) ? [g] : [];
  });
}
function mapEspn(data, sport) {
  return (data.events || []).flatMap(event => {
    const comp = event.competitions?.[0], sides = comp?.competitors || [];
    const away = sides.find(x => x.homeAway === 'away'), home = sides.find(x => x.homeAway === 'home');
    const g = baseGame({ source: 'espn', sourceId: event.id, sport, league: event.league?.name || sport.toUpperCase(), awayTeam: away?.team?.displayName, homeTeam: home?.team?.displayName, commenceTime: event.date });
    if (!g) return [];
    g.status = event.status?.type?.completed ? 'ended' : event.status?.type?.state === 'in' ? 'live' : 'upcoming';
    return [g]; // ESPN scoreboard is status data; it is never presented as an odds source.
  });
}
async function fetchDraftKings(sport) {
  const league = LEAGUES[sport]; if (!league) return [];
  const url = `https://sportsbook-nash.draftkings.com/api/sportscontent/dkusnj/v1/leagues/${league.id}/categories/493`;
  return mapDraftKings(await getJson(url, 'DraftKings'), sport);
}
async function fetchFanDuel(sport) {
  const url = new URL('https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page');
  url.search = new URLSearchParams({ page: 'CUSTOM', customPageId: sport });
  return mapFanDuel(await getJson(url, 'FanDuel'), sport);
}
async function fetchActionNetwork(sport) {
  const url = `https://api.actionnetwork.com/web/v1/scoreboard/${encodeURIComponent(sport)}`;
  return mapActionNetwork(await getJson(url, 'Action Network'), sport);
}
async function fetchEspn(sport) {
  const league = LEAGUES[sport]; if (!league) return [];
  return mapEspn(await getJson(`https://site.api.espn.com/apis/site/v2/sports/${league.espn}/scoreboard`, 'ESPN'), sport);
}
const sourceFetchers = { draftkings: fetchDraftKings, fanduel: fetchFanDuel, actionnetwork: fetchActionNetwork, espn: fetchEspn };

export async function getLiveOdds({ force = false } = {}) {
  if (!force && refreshing) return refreshing;
  if (!force && cache.size && Date.now() - Math.max(...[...cache.values()].map(x => +x.lastUpdate)) < config.oddsRefreshSeconds * 1000) return [...cache.values()];
  refreshing = (async () => {
    const successful = [];
    const enabledSetting = await prisma.appSettings.findUnique({ where: { key: 'odds_sources' } }).catch(() => null);
    const enabled = enabledSetting ? new Set(JSON.parse(enabledSetting.value)) : new Set(Object.keys(sourceFetchers));
    for (const [name, fetcher] of Object.entries(sourceFetchers)) {
      if (!enabled.has(name)) continue;
      const rows = [];
      const sports = config.oddsSports.filter(s => !['soccer'].includes(s) || name === 'actionnetwork');
      for (const sport of sports) {
        try { rows.push(...await fetcher(sport)); }
        catch (e) { sourceStatus.set(name, { ...sourceStatus.get(name), ok: false, error: String(e.message || e).slice(0, 180), attemptedAt: stamp() }); }
      }
      if (rows.length || !sourceStatus.get(name).attemptedAt) sourceStatus.set(name, { ok: rows.length > 0, error: rows.length ? null : 'No supported odds returned', updatedAt: rows.length ? stamp() : null, attemptedAt: stamp(), games: rows.length });
      successful.push(...rows);
    }
    const merged = new Map();
    for (const row of successful) {
      const id = row.id;
      const prev = merged.get(id);
      if (!prev) { merged.set(id, { ...row, odds: { ...row.odds }, bookmakers: [row.bookmaker] }); continue; }
      for (const key of Object.keys(row.odds)) if (row.odds[key] && (!prev.odds[key] || row.odds[key] > prev.odds[key])) prev.odds[key] = row.odds[key];
      if (!prev.bookmakers.includes(row.bookmaker)) prev.bookmakers.push(row.bookmaker);
      if (row.source === 'espn') prev.status = row.status;
    }
    for (const cached of cache.values()) cached.stale = true;
    for (const game of merged.values()) {
      game.lastUpdate = new Date();
      game.stale = false;
      cache.set(game.id, game);
      await prisma.game.upsert({ where: { id: game.id }, create: { ...game, sourceId: game.id, source: game.bookmakers.join(','), oddsJson: JSON.stringify({ odds: game.odds, bookmakers: game.bookmakers }) }, update: { sport: game.sport, league: game.league, homeTeam: game.homeTeam, awayTeam: game.awayTeam, commenceTime: game.commenceTime, status: game.status, oddsJson: JSON.stringify({ odds: game.odds, bookmakers: game.bookmakers }), lastUpdate: game.lastUpdate } });
    }
    if (!merged.size) {
      for (const cached of cache.values()) cached.stale = true;
      const persisted = await prisma.game.findMany({ where: { oddsJson: { not: '{}' } }, orderBy: { lastUpdate: 'desc' }, take: 300 });
      for (const item of persisted) if (!cache.has(item.id)) cache.set(item.id, { ...item, ...JSON.parse(item.oddsJson), odds: JSON.parse(item.oddsJson).odds, bookmakers: JSON.parse(item.oddsJson).bookmakers, lastUpdate: item.lastUpdate, stale: true });
    }
    return [...cache.values()].sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
  })();
  try { return await refreshing; } finally { refreshing = null; }
}

export function getOddsStatus() { return Object.fromEntries(sourceStatus); }
export function startOddsScheduler() {
  const seconds = config.oddsRefreshSeconds;
  const expr = seconds === 30 ? '*/30 * * * * *' : '*/1 * * * *';
  cron.schedule(expr, () => getLiveOdds({ force: true }).catch(e => console.error('Odds refresh failed:', e.message)));
  getLiveOdds({ force: true }).catch(e => console.error('Initial odds refresh failed:', e.message));
}

export const oddsAdapters = { fetchDraftKings, fetchFanDuel, fetchActionNetwork, fetchEspn };
