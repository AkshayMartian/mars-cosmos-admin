import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ATTENTION, RECENT, SHOPS } from '../data/sample'
import { OnboardLink, PageHead, Pill } from '../components/ui'

interface Health { ok: boolean; database: 'ok' | 'down' | 'not configured' }

const KPIS = [
  { k: 'Active shops', v: '24', note: '3 joined this month', tone: 'ok' },
  { k: 'Waiting to activate', v: '5', note: '2 for more than 3 days', tone: 'warn' },
  { k: 'Licences ending in 14 days', v: '3', note: '1 ends this week', tone: 'bad' },
  { k: 'PIN reset requests (7 days)', v: '2', note: 'Both completed', tone: 'mute' }
] as const

export function Dashboard() {
  const [health, setHealth] = useState<Health | 'offline' | null>(null)
  useEffect(() => {
    fetch('/api/health').then((r) => r.json() as Promise<Health>).then(setHealth, () => setHealth('offline'))
  }, [])
  const server = health === null ? 'Checking the server…' : health === 'offline' ? 'Server not reachable' : health.database === 'ok' ? 'Server and database connected' : health.database === 'down' ? 'Server up, database down' : 'Server up, no database configured'
  const tone = health !== null && health !== 'offline' && health.database === 'ok' ? 'ok' : health === null ? 'mute' : 'warn'
  const shopId = (name: string) => SHOPS.find((s) => s.name === name)?.id ?? ''

  return (
    <>
      <PageHead title="Dashboard" sub="Shops waiting on you, licences running out, and recent activity.">
        <span className={`pill ${tone}`} role="status">{server}</span>
        <OnboardLink />
      </PageHead>

      <section className="kpis" aria-label="Key numbers">
        {KPIS.map((c) => (
          <div className="card" key={c.k}>
            <div className="k">{c.k}</div>
            <div className="v">{c.v}</div>
            <div className={`kn ${c.tone}`}>{c.note}</div>
          </div>
        ))}
      </section>

      <div className="split">
        <section className="card stack tight" aria-label="Needs attention">
          <h2>Needs attention</h2>
          {ATTENTION.map((a) => (
            <div className="attn" key={a.shop}>
              <div><b>{a.shop}</b><div className="muted small">{a.text}</div></div>
              <Link className="btn small" to={`/shops/${shopId(a.shop)}`}>{a.action}</Link>
            </div>
          ))}
        </section>
        <section className="card stack" aria-label="Recent onboarding">
          <div className="row between"><h2>Recent onboarding</h2><Link to="/shops">All shops</Link></div>
          <div className="scroll">
            <table>
              <thead><tr><th>Shop</th><th>Owner</th><th>City</th><th>Status</th></tr></thead>
              <tbody>{RECENT.map((r) => <tr key={r.shop}><td><b>{r.shop}</b></td><td>{r.owner}</td><td>{r.city}</td><td><Pill tone={r.tone}>{r.status}</Pill></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="flow" aria-label="How a shop goes live">
        <div className="flowhead">How a shop goes live</div>
        <div className="step"><b>1 · Form</b><span>Owner and shop details, mobile and email verified.</span></div>
        <div className="step"><b>2 · Key</b><span>Activation key is created and sent on WhatsApp.</span></div>
        <div className="step"><b>3 · Activate</b><span>Owner enters key and mobile in the app.</span></div>
        <div className="step"><b>4 · Shop settings</b><span>App opens Settings → Shop, already filled in.</span></div>
      </section>
    </>
  )
}
