export default function ReserveBanner({ config }) {
  if (config?.bettingEnabled) return null;
  return <div className="reserve-banner"><span className="status-dot" />Wagering unavailable - deployment/reserves/odds feed not configured {config?.disabledReason ? <small>{config.disabledReason}</small> : null}</div>;
}
