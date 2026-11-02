export default function OddsButton({ outcome, price, disabled, active, onClick }) {
  return <button className={`odds-button ${active ? 'selected' : ''}`} disabled={disabled || !Number.isFinite(price)} onClick={onClick}><span>{outcome}</span><strong>{Number.isFinite(price) ? price.toFixed(2) : '—'}</strong></button>;
}
