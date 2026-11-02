import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
const sports = (process.env.ODDS_SPORTS || 'basketball_nba,soccer_epl,americanfootball_nfl').split(',').map(x => x.trim()).filter(Boolean);

async function getOdds(sport) {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { configured:false, data:[], message:'Add ODDS_API_KEY to your server environment to load live markets.' };
  if (!sports.includes(sport)) throw Object.assign(new Error('Sport is not enabled.'), { status:400 });
  const url = new URL(`${(process.env.ODDS_API_BASE || 'https://api.the-odds-api.com/v4').replace(/\/$/, '')}/sports/${encodeURIComponent(sport)}/odds`);
  url.searchParams.set('apiKey', key); url.searchParams.set('regions','us'); url.searchParams.set('markets','h2h'); url.searchParams.set('oddsFormat','decimal');
  const response = await fetch(url, { signal:AbortSignal.timeout(12000) });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw Object.assign(new Error(data.message || 'Odds provider request failed.'), { status:502 });
  return { configured:true, data, remaining:response.headers.get('x-requests-remaining') };
}

http.createServer(async (req,res) => {
  const headers = { 'Content-Security-Policy':"default-src 'self'; connect-src 'self' https:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'", 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin' };
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/config') {
      res.writeHead(200,{...headers,'Content-Type':'application/json','Cache-Control':'no-store'});
      return res.end(JSON.stringify({ sports, contractAddress:process.env.BETTING_CONTRACT_ADDRESS || '', rpcUrl:process.env.RPC_URL || '' }));
    }
    if (url.pathname === '/api/odds') {
      const result = await getOdds(url.searchParams.get('sport') || sports[0]);
      res.writeHead(200,{...headers,'Content-Type':'application/json','Cache-Control':'public, max-age=20, stale-while-revalidate=40'});
      return res.end(JSON.stringify(result));
    }
    const path = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const safePath = normalize(join(root, path));
    if (!safePath.startsWith(root)) throw Object.assign(new Error('Not found'), {status:404});
    const body = await readFile(safePath);
    res.writeHead(200,{...headers,'Content-Type':mime[extname(safePath)] || 'application/octet-stream'}); res.end(body);
  } catch (error) {
    res.writeHead(error.status || 500,{...headers,'Content-Type':'application/json'});
    res.end(JSON.stringify({ error:error.message || 'Server error' }));
  }
}).listen(port, () => console.log(`Fairplay listening at http://localhost:${port}`));
