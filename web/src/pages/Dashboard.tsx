import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { currentUser } from '../auth'
import { Chip, SampleNote, toast } from '../components/ui'
import { addAudit, ago, DAY, dOnly, inr, lastSeen, planOf, statusOf, update, useStore } from '../store'

interface Health { ok: boolean; database: 'ok' | 'down' | 'not configured' }

export function Dashboard() {
  const { shops, audit } = useStore()
  const nav = useNavigate()
  const user = currentUser()!
  const [health, setHealth] = useState<Health | 'offline' | null>(null)
  useEffect(() => { fetch('/api/health').then((r) => r.json() as Promise<Health>).then(setHealth, () => setHealth('offline')) }, [])
  const server = health === null ? 'Checking the server…' : health === 'offline' ? 'Server not reachable' : health.database === 'ok' ? 'Server and database connected' : health.database === 'down' ? 'Server up, database down' : 'Server up, no database configured'
  const serverTone = health !== null && health !== 'offline' && health.database === 'ok' ? 'good' : health === null ? 'grey' : 'warn'

  const T = Date.now()
  const active = shops.filter((s) => ['Active', 'Expiring'].includes(statusOf(s)[0])).length
  const trials = shops.filter((s) => statusOf(s)[0] === 'Trial').length
  const expiring = shops.filter((s) => s.status !== 'suspended' && s.expiry > T && s.expiry - T < 30 * DAY)
  const offline = shops.filter((s) => s.devices.length && T - lastSeen(s)! > 7 * DAY && s.status !== 'suspended')
  const msgs = shops.reduce((a, s) => a + (s.wa.used ?? 0), 0)
  const yearRev = shops.filter((s) => s.status === 'active' && s.expiry > T).reduce((a, s) => a + planOf(s).year, 0)
  const go = (filter: string) => (e: React.MouseEvent) => { e.preventDefault(); nav('/shops', { state: { filter } }) }

  return (
    <>
      <div className="head">
        <div><h1>Good day, {user.name.split(' ')[0]}</h1><div className="muted">{shops.length} shops on MARS POS</div></div>
        <div className="row mid"><Chip tone={serverTone}>{server}</Chip><Link className="btn p" to="/onboard">+ Onboard a shop</Link></div>
      </div>
      <div className="kpis">
        <a className="kpi" href="/shops" onClick={go('active')}><b>{active}</b><span>Active shops</span></a>
        <a className="kpi" href="/shops" onClick={go('trial')}><b>{trials}</b><span>On trial</span></a>
        <a className="kpi" href="/shops" onClick={go('expiring')}><b style={{ color: 'var(--warn)' }}>{expiring.length}</b><span>Expiring in 30 days</span></a>
        <a className="kpi" href="/shops" onClick={go('offline')}><b style={{ color: 'var(--bad)' }}>{offline.length}</b><span>Not online for 7+ days</span></a>
        <Link className="kpi" to="/whatsapp"><b>{msgs.toLocaleString('en-IN')}</b><span>WhatsApp messages this month</span></Link>
        <div className="kpi"><b>{inr(yearRev)}</b><span>Yearly plan value (paid shops)</span></div>
      </div>
      <div className="cols">
        <div className="panel"><h2>Renew soon</h2>
          {expiring.length ? (
            <div className="tw"><table><thead><tr><th>Shop</th><th>Plan</th><th>Expires</th><th /></tr></thead><tbody>
              {expiring.map((s) => (
                <tr key={s.id}><td><Link to={`/shops/${s.id}`}>{s.name}</Link></td><td>{planOf(s).n}</td>
                  <td>{dOnly(s.expiry)} <Chip tone={statusOf(s)[1]}>{Math.ceil((s.expiry - T) / DAY)} days</Chip></td>
                  <td><button type="button" className="btn sm" onClick={() => { update((st) => { const x = st.shops.find((y) => y.id === s.id)!; x.expiry = Math.max(x.expiry, Date.now()) + 365 * DAY; x.status = 'active'; addAudit(st, user.name, 'Licence renewed', s.id, '1 year') }); toast(`${s.name} renewed for 1 year`) }}>Renew 1 year</button></td></tr>
              ))}
            </tbody></table></div>
          ) : <div className="empty">Nothing expiring in 30 days.</div>}
        </div>
        <div className="panel"><h2>Not online for 7+ days</h2>
          <p className="muted" style={{ margin: 0 }}>Call these shops: licence checks and WhatsApp stop while the PC is offline.</p>
          {offline.length ? (
            <div className="tw"><table><thead><tr><th>Shop</th><th>Last seen</th><th>Phone</th></tr></thead><tbody>
              {offline.map((s) => <tr key={s.id}><td><Link to={`/shops/${s.id}`}>{s.name}</Link></td><td>{ago(lastSeen(s)!)}</td><td className="mono">{s.mobile}</td></tr>)}
            </tbody></table></div>
          ) : <div className="empty">All shops checked in this week.</div>}
        </div>
      </div>
      <div className="panel"><h2>Recent changes</h2>
        <div className="tw"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Shop</th><th>Details</th></tr></thead><tbody>
          {audit.slice(0, 6).map((a, i) => <tr key={i}><td>{ago(a.at)}</td><td>{a.by}</td><td>{a.action}</td><td>{a.shop && <Link to={`/shops/${a.shop}`}>{shops.find((s) => s.id === a.shop)?.name}</Link>}</td><td>{a.details}</td></tr>)}
        </tbody></table></div>
      </div>
      <SampleNote />
    </>
  )
}
