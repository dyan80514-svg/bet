const $ = (id) => document.getElementById(id);
const state = { config:null, sports:[], sport:'', events:[], slip:[], account:null, chainId:null, balance:null, refreshTimer:null };
const fmtTime = (date) => { const d = new Date(date); return isNaN(d) ? 'UPCOMING' : d.toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' }).toUpperCase(); };
const safe = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sportName = (id) => ({basketball_nba:'NBA',soccer_epl:'PREMIER LEAGUE',americanfootball_nfl:'NFL'}[id] || id.replaceAll('_',' ').toUpperCase());
const slug = (s='') => s.split(' ').map(x=>x[0]||'').slice(0,2).join('').toUpperCase();

function showNotice(text, show=true) { $('noticeText').textContent = text; $('notice').classList.toggle('show',show); }
function optionsFromEvent(event) {
  const book = event.bookmakers?.[0]; const market = book?.markets?.find(m=>m.key==='h2h');
  const outcomes = market?.outcomes || [];
  return event.teams.map(team => ({ name:team, price:outcomes.find(o=>o.name===team)?.price })).filter(o=>Number.isFinite(o.price));
}
async function loadOdds() {
  if (!state.sport) return;
  try {
    const response = await fetch(`/api/odds?sport=${encodeURIComponent(state.sport)}`);
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not fetch markets.');
    state.events = result.data || []; renderMarkets(); $('updatedAt').textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    $('marketCount').textContent = state.events.length ? `· ${state.events.length}` : '';
    if (!result.configured) showNotice(result.message);
    else if (!state.events.length) showNotice(`No ${sportName(state.sport)} markets are available right now.`,false);
    else showNotice(`Live odds · ${result.remaining ?? '—'} provider requests remaining`,false);
  } catch (err) { showNotice(err.message); $('markets').innerHTML='<div class="empty-market">Markets could not be loaded. Check the provider key and server logs.</div>'; }
}
function renderSports() {
  $('sportsFilter').innerHTML = state.sports.map(s => `<button class="sport-tab ${s===state.sport?'active':''}" data-sport="${safe(s)}">${safe(sportName(s))}</button>`).join('');
  $('sportsFilter').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.sport=b.dataset.sport; renderSports(); loadOdds();});
}
function renderMarkets() {
  if (!state.events.length) { $('markets').innerHTML='<div class="empty-market">No markets to show for this sport.</div>'; return; }
  $('markets').innerHTML = state.events.map(event => {
    const options=optionsFromEvent(event); if(options.length<2)return '';
    const teams=event.teams || options.map(x=>x.name);
    const picks=options.map((o,i)=>`<button class="odd-btn ${state.slip.some(x=>x.eventId===event.id&&x.name===o.name)?'selected':''}" data-event="${safe(event.id)}" data-name="${safe(o.name)}" data-odd="${o.price}" data-home="${safe(teams[0])}" data-away="${safe(teams[1])}" data-league="${safe(event.sport_title||sportName(state.sport))}"><span>${safe(o.name)}</span><b>${Number(o.price).toFixed(2)}</b></button>`).join('');
    return `<article class="event-card"><div class="event-head"><span class="league-icon">◉</span><span class="event-league">${safe(event.sport_title||sportName(state.sport))}</span><span class="event-time">${fmtTime(event.commence_time)}</span></div><div class="event-body"><div class="teams">${teams.map(t=>`<div class="team"><span class="team-mark">${safe(slug(t))}</span>${safe(t)}</div>`).join('')}</div><div class="odds">${picks}</div></div></article>`;
  }).join('') || '<div class="empty-market">No supported head-to-head markets available.</div>';
  $('markets').querySelectorAll('.odd-btn').forEach(btn=>btn.onclick=()=>togglePick(btn.dataset));
}
function togglePick(d) {
  const exists=state.slip.findIndex(x=>x.eventId===d.event&&x.name===d.name);
  if(exists>=0)state.slip.splice(exists,1);
  else { state.slip=state.slip.filter(x=>x.eventId!==d.event); state.slip.push({eventId:d.event,name:d.name,odd:Number(d.odd),home:d.home,away:d.away,league:d.league}); }
  renderMarkets();renderSlip();
}
function renderSlip() {
  $('slipCount').textContent=state.slip.length; $('betCount').textContent=state.slip.length;
  if(!state.slip.length) $('slipItems').innerHTML='<div class="empty-slip"><div>＋</div><b>Your picks go here</b><span>Select an outcome to add it to your slip.</span></div>';
  else $('slipItems').innerHTML=state.slip.map((p,i)=>`<div class="slip-item"><button class="slip-remove" data-i="${i}">×</button><div class="slip-match">${safe(p.league)} · ${safe(p.home)} v ${safe(p.away)}</div><div class="slip-pick">${safe(p.name)}</div><div class="slip-market">Match winner</div><span class="slip-odd">${p.odd.toFixed(2)}</span></div>`).join('');
  $('slipItems').querySelectorAll('.slip-remove').forEach(b=>b.onclick=()=>{state.slip.splice(Number(b.dataset.i),1);renderSlip();renderMarkets();});
  updateTotals();
}
function updateTotals() {
  const stake=Math.max(0,Number($('stakeInput').value)||0);const sum=state.slip.reduce((n,p)=>n+stake,0);const ret=state.slip.reduce((n,p)=>n+stake*p.odd,0);
  $('totalStake').textContent=`${sum.toFixed(3)} ETH`; $('potentialReturn').textContent=`${ret.toFixed(3)} ETH`;
  // Wager submission stays disabled until a deployed contract has a matching
  // chain integration; never imply that a click has locked a user's funds.
  $('placeBtn').disabled=true;
  $('placeBtn').innerHTML=state.account?'Onchain wagering not enabled':'Connect wallet to bet <span>↗</span>';
}
async function connectWallet() {
  if(!window.ethereum){showNotice('No browser wallet detected. Install a wallet such as MetaMask to connect.');return;}
  try {
    const [account]=await window.ethereum.request({method:'eth_requestAccounts'});state.account=account;
    state.chainId=await window.ethereum.request({method:'eth_chainId'}); $('connectBtn').textContent=`${account.slice(0,6)}…${account.slice(-4)}`;
    $('walletAddress').textContent=`${account.slice(0,8)}…${account.slice(-6)}`;$('networkName').textContent=`${networkName(state.chainId)}`;$('networkName').parentElement.classList.add('connected');
    await refreshBalance();updateTotals();
  } catch(e){showNotice(e.message||'Wallet connection was declined.');}
}
function networkName(id){return ({'0x1':'Ethereum','0xaa36a7':'Sepolia','0x89':'Polygon','0x2105':'Base','0x14a34':'Base Sepolia'})[id]||`Chain ${parseInt(id,16)}`;}
async function refreshBalance(){if(!state.account||!window.ethereum)return;try{const hex=await window.ethereum.request({method:'eth_getBalance',params:[state.account,'latest']});state.balance=BigInt(hex);const eth=Number(state.balance)/1e18;$('walletBalance').textContent=`${eth.toFixed(5)} ETH`;}catch{$('walletBalance').textContent='Unable to read wallet balance';}}
async function initialize(){
  try {state.config=await fetch('/api/config').then(r=>r.json());state.sports=state.config.sports||[];state.sport=state.sports[0]||'';renderSports();await loadOdds();state.refreshTimer=setInterval(loadOdds,30000);}
  catch(e){showNotice('Could not load app configuration.');}
  if(window.ethereum){window.ethereum.on?.('accountsChanged',accounts=>{if(!accounts.length){state.account=null;$('connectBtn').textContent='Connect wallet ↗';$('walletBalance').textContent='Connect a wallet to view balance';updateTotals();}else connectWallet();});window.ethereum.on?.('chainChanged',id=>{state.chainId=id;$('networkName').textContent=networkName(id);refreshBalance();});}
}
$('connectBtn').onclick=connectWallet;$('refreshBalance').onclick=refreshBalance;$('dismissNotice').onclick=()=>showNotice('',false);$('stakeInput').oninput=updateTotals;$('clearSlip').onclick=()=>{state.slip=[];renderSlip();renderMarkets();};$('myBetsNav').onclick=()=>showNotice('Your confirmed onchain bets are visible in your wallet activity and the market contract.');
renderSlip();initialize();
