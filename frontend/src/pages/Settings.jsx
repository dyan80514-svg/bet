import { useEffect, useState } from 'react';
import { api, json } from '../api.js';

export default function Settings() {
  const [data, setData] = useState(null), [selected, setSelected] = useState([]), [message, setMessage] = useState('');
  useEffect(() => { api('/settings').then(row => { setData(row); setSelected(row.oddsSources); }).catch(e => setMessage(e.message)); }, []);
  function toggle(name) { setSelected(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]); }
  return <section className="narrow-page"><div className="section-head"><div><small>FEED AND RESPONSIBLE GAMBLING</small><h2>Settings</h2></div></div><div className="settings-card"><h3>Public odds sources</h3><p>No odds provider API key is required or stored. Public sports feeds can change or deny access.</p>{['draftkings', 'fanduel', 'actionnetwork', 'espn'].map(name => <label className="source-option" key={name}><input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)} />{name}<span>{data?.sourceStatus?.[name]?.ok ? 'connected' : data?.sourceStatus?.[name]?.error || 'not checked'}</span></label>)}<p className="muted">Feed preferences are saved by an administrator. A source without confirmed decimal odds will never enable a market.</p></div><div className="settings-card"><h3>Responsible play</h3><p>18+ only. KYC and local legal eligibility must be verified by the operator before a wallet can wager. Use the self-exclusion and limits on your Wallet page; exclusions require administrator review to lift.</p><span>Minimum age {data?.responsibleGambling?.minimumAge || 18}</span></div>{message && <div className="inline-alert">{message}</div>}</section>;
}
