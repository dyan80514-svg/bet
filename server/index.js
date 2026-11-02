import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
const sports = (process.env.ODDS_SPORTS || 'basketball_nba,soccer_epl,americanfootball_nfl').split(',').map(x => x.trim()).filter(Boolean);
const tokens = (process.env.BETTING_TOKENS || `USDC:${process.env.TOKEN_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'}:6`).split(',').map(part=>{const [symbol,address,decimals='6']=part.trim().split(':');return {symbol,address,decimals:Number(decimals)}}).filter(t=>/^0x[0-9a-fA-F]{40}$/.test(t.address)&&Number.isInteger(t.decimals)&&t.decimals>=0&&t.decimals<=18);

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
  const headers = { 'Content-Security-Policy':"default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; worker-src 'self' blob:; frame-src https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'", 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin' };
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/config') {
      res.writeHead(200,{...headers,'Content-Type':'application/json','Cache-Control':'no-store'});
      return res.end(JSON.stringify({ sports, contractAddress:process.env.BETTING_CONTRACT_ADDRESS || '', tokens, chainId:Number(process.env.CHAIN_ID || 8453), chainName:process.env.CHAIN_NAME || 'Base', publicUrl:process.env.PUBLIC_URL || '' }));
    }
    if (url.pathname === '/tonconnect-manifest.json') {
      const publicUrl=(process.env.PUBLIC_URL||'').replace(/\/$/,'');
      if(!publicUrl || !publicUrl.startsWith('https://')) throw Object.assign(new Error('Set HTTPS PUBLIC_URL before connecting TON wallets.'),{status:503});
      res.writeHead(200,{...headers,'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=300'});
      return res.end(JSON.stringify({url:publicUrl,name:'Fairplay',iconUrl:`${publicUrl}/icon.png`}));
    }
    if (url.pathname === '/api/odds') {
      const result = await getOdds(url.searchParams.get('sport') || sports[0]);
      res.writeHead(200,{...headers,'Content-Type':'application/json','Cache-Control':'public, max-age=20, stale-while-revalidate=40'});
      return res.end(JSON.stringify(result));
    }
    let path = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if(path==='/ston-swap.js') path='/dist/ston-swap.js';
    if (path.startsWith('/.') || path.includes('/.env') || (path.startsWith('/node_modules/') && path !== '/node_modules/ethers/dist/ethers.js')) throw Object.assign(new Error('Not found'), {status:404});
    const safePath = normalize(join(root, path));
    const relPath = relative(root, safePath);
    if (isAbsolute(relPath) || relPath === '..' || relPath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) throw Object.assign(new Error('Not found'), {status:404});
    const body = await readFile(safePath);
    res.writeHead(200,{...headers,'Content-Type':mime[extname(safePath)] || 'application/octet-stream'}); res.end(body);
  } catch (error) {
    res.writeHead(error.status || 500,{...headers,'Content-Type':'application/json'});
    res.end(JSON.stringify({ error:error.message || 'Server error' }));
  }
}).listen(port, () => console.log(`Fairplay listening at http://localhost:${port}`));
