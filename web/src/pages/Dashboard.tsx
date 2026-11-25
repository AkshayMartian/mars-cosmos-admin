import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface Health { ok: boolean; database: 'ok' | 'down' | 'not configured' }

/** No numbers are made up here: the cards show a dash until the server can count real shops. */
const KPIS = ['Active shops', 'Waiting to activate', 'Licences ending in 14 days', 'PIN reset requests (7 days)']

export function Dashboard() {
  const [health, setHealth] = useState<Health | 'offline' | null>(null)
  useEffect(() => {
    fetch('/api/health').then((r) => r.json() as Promise<Health>).then(setHealth, () => setHealth('offline'))
  }, [])

  const server = health === null ? 'Checking the server…' : health === 'offline' ? 'Server not reachable' : health.database === 'ok' ? 'Server and database connected' : health.database === 'down' ? 'Server up, database down' : 'Server up, no database configured'
  const tone = health !== null && health !== 'offline' && health.database === 'ok' ? 'ok' : health === null ? 'mute' : 'warn'

  return (
    <>
      <header className="head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Shops waiting on you, licences running out, and recent activity.</div>
        </div>
        <div className="row">
          <span className={`pill ${tone}`} role="status">{server}</span>
          <Link className="btn primary" to="/onboard">+ Onboard a shop</Link>
        </div>
      </header>

      <section className="kpis" aria-label="Key numbers">
        {KPIS.map((k) => (
          <div className="card" key={k}>
            <div className="k">{k}</div>
            <div className="v">—</div>
          </div>
        ))}
      </section>

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
