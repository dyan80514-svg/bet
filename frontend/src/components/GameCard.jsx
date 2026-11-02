import OddsButton from './OddsButton.jsx';

export default function GameCard({ game, bettingEnabled, selection, onPick }) {
  const prices = game.marketOpen ? game.postedOdds || JSON.parse(game.postedOddsJson || '{}') : game.odds || {};
  const canSelect = bettingEnabled && game.marketOpen && game.bettingAvailable !== false && game.status === 'upcoming';
  const choices = [['home', game.homeTeam], ...(prices.draw ? [['draw', 'Draw']] : []), ['away', game.awayTeam]];
  return <article className="game-card">
    <div className="game-card-head"><span className="sport-chip">{game.league || game.sport}</span><span className={`game-state ${game.stale ? 'stale' : ''}`}>{game.stale ? 'STALE FEED' : game.status?.toUpperCase()}</span><time>{new Date(game.commenceTime).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div>
    <div className="game-title"><div><i>{game.awayTeam?.split(/\s+/).map(s => s[0]).slice(0, 2).join('')}</i><b>{game.awayTeam}</b></div><span>AT</span><div><i>{game.homeTeam?.split(/\s+/).map(s => s[0]).slice(0, 2).join('')}</i><b>{game.homeTeam}</b></div></div>
    <div className="odds-row">{choices.map(([key, label]) => <OddsButton key={key} outcome={label} price={prices[key]} disabled={!canSelect} active={selection?.game.id === game.id && selection?.outcome === key} onClick={() => onPick(game, key, prices[key])} />)}</div>
    <div className="game-card-foot"><span>{game.bookmakers?.join(' · ') || 'Public odds source'}</span><span>{game.marketOpen ? 'ONCHAIN MARKET OPEN' : 'MARKET NOT OPENED ONCHAIN'}</span></div>
  </article>;
}
