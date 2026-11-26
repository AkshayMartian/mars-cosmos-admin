import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { get } from '../api'
import { can, currentUser } from '../auth'
import { Chip } from '../components/ui'
import { ago, dOnly, inr } from '../store'

interface DashboardData {
  total: number; active: number; pending: number; suspended: number; expired: number
  yearValue: number
  renewSoon: Array<{ tenantId: string; name: string; plan: string; expires: string; daysLeft: number }>
  offline: Array<{ tenantId: string; name: string; lastSeen: string; mobile: string }>
  recent: Array<{ at: string; by: string; action: string; shop: string | null; details: string }>
}

const phone = (m: string): string => (m.length === 10 ? `${m.slice(0, 5)} ${m.slice(5)}` : m)

export function Dashboard() {
  const user = currentUser()!
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    get<DashboardData>('/v1/admin/dashboard').then(setData, (e: Error) => setError(e.message))
  }, [])

  const n = (v: number | undefined): string => (data ? String(v) : '…')

  return (
    <>
      <div className="head">
        <div><h1>Good day, {user.name.split(' ')[0]}</h1><div className="muted">{data ? `${data.total} ${data.total === 1 ? 'shop' : 'shops'} on MARS POS` : 'Loading…'}</div></div>
        {can('onboard') && <Link className="btn p" to="/onboard">+ Onboard a shop</Link>}
      </div>
      {error && <div className="empty" role="alert">Could not load the dashboard: {error}</div>}
      <div className="kpis">
        <div className="kpi"><b>{n(data?.active)}</b><span>Active shops</span></div>
        <div className="kpi"><b>{n(data?.pending)}</b><span>Waiting for activation</span></div>
        <div className="kpi"><b style={{ color: 'var(--warn)' }}>{n(data?.renewSoon.length)}</b><span>Expiring in 30 days</span></div>
        <div className="kpi"><b style={{ color: 'var(--bad)' }}>{n(data?.offline.length)}</b><span>Not online for 7+ days</span></div>
        <div className="kpi"><b style={{ color: 'var(--bad)' }}>{data ? data.expired + data.suspended : '…'}</b><span>Expired or suspended</span></div>
        <div className="kpi"><b>{data ? inr(data.yearValue) : '…'}</b><span>Yearly plan value (active shops)</span></div>
      </div>
      <div className="cols">
        <div className="panel"><h2>Renew soon</h2>
          {data?.renewSoon.length ? (
            <div className="tw"><table><thead><tr><th>Shop</th><th>Plan</th><th>Expires</th></tr></thead><tbody>
              {data.renewSoon.map((s) => (
                <tr key={s.tenantId}><td><Link to={`/shops/${s.tenantId}`}>{s.name}</Link></td><td>{s.plan}</td>
                  <td>{dOnly(new Date(s.expires).getTime())} <Chip tone="warn">{s.daysLeft} {s.daysLeft === 1 ? 'day' : 'days'}</Chip></td></tr>
              ))}
            </tbody></table></div>
          ) : <div className="empty">{data ? 'Nothing expiring in 30 days.' : 'Loading…'}</div>}
        </div>
        <div className="panel"><h2>Not online for 7+ days</h2>
          <p className="muted" style={{ margin: 0 }}>Call these shops: licence checks and WhatsApp stop while the PC is offline.</p>
          {data?.offline.length ? (
            <div className="tw"><table><thead><tr><th>Shop</th><th>Last seen</th><th>Phone</th></tr></thead><tbody>
              {data.offline.map((s) => <tr key={s.tenantId}><td><Link to={`/shops/${s.tenantId}`}>{s.name}</Link></td><td>{ago(new Date(s.lastSeen).getTime())}</td><td className="mono">{phone(s.mobile)}</td></tr>)}
            </tbody></table></div>
          ) : <div className="empty">{data ? 'All shops checked in this week.' : 'Loading…'}</div>}
        </div>
      </div>
      <div className="panel"><h2>Recent changes</h2>
        {data?.recent.length ? (
          <div className="tw"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Shop</th><th>Details</th></tr></thead><tbody>
            {data.recent.map((a, i) => <tr key={i}><td>{ago(new Date(a.at).getTime())}</td><td>{a.by}</td><td>{a.action}</td><td>{a.shop ?? '—'}</td><td>{a.details}</td></tr>)}
          </tbody></table></div>
        ) : <div className="empty">{data ? 'No changes yet.' : 'Loading…'}</div>}
      </div>
    </>
  )
}
