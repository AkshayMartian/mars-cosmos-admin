import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { get } from '../api'
import { Chip, Tabs } from '../components/ui'
import { ago, dOnly, type Tone } from '../store'

type Status = 'Active' | 'Expiring' | 'Expired' | 'Suspended' | 'Waiting'
interface ShopRow {
  tenantId: string; name: string; plan: string; planName: string; city: string; owner: string; mobile: string
  expires: string | null; daysLeft: number | null; pcs: number; lastSeen: string | null; offline: boolean; status: Status; createdAt: string | null
}

const FILTERS: Array<[string, string]> = [['all', 'All'], ['active', 'Active'], ['waiting', 'Waiting for activation'], ['expiring', 'Expiring'], ['expired', 'Expired'], ['suspended', 'Suspended'], ['offline', 'Offline 7+ days']]
const TONE: Record<Status, Tone> = { Active: 'good', Expiring: 'warn', Expired: 'bad', Suspended: 'bad', Waiting: 'blue' }
const LABEL: Record<Status, string> = { Active: 'Active', Expiring: 'Expiring', Expired: 'Expired', Suspended: 'Suspended', Waiting: 'Waiting for activation' }
const phone = (m: string): string => (m.length === 10 ? `${m.slice(0, 5)} ${m.slice(5)}` : m)

function keep(s: ShopRow, filter: string): boolean {
  switch (filter) {
    case 'active': return s.status === 'Active' || s.status === 'Expiring'
    case 'waiting': return s.status === 'Waiting'
    case 'expiring': return s.status === 'Expiring'
    case 'expired': return s.status === 'Expired'
    case 'suspended': return s.status === 'Suspended'
    case 'offline': return s.offline
    default: return true
  }
}

export function Shops() {
  const loc = useLocation()
  const [filter, setFilter] = useState<string>((loc.state as { filter?: string } | null)?.filter ?? 'all')
  const [q, setQ] = useState('')
  const [shops, setShops] = useState<ShopRow[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { get<{ shops: ShopRow[] }>('/v1/admin/shops').then((r) => setShops(r.shops), (e: Error) => setError(e.message)) }, [])

  const needle = q.trim().toLowerCase()
  const list = (shops ?? []).filter((s) => keep(s, filter) && (!needle || `${s.name} ${s.owner} ${s.mobile} ${s.city}`.toLowerCase().includes(needle)))
  return (
    <>
      <div className="head"><h1>Shops</h1><Link className="btn p" to="/onboard">+ Onboard a shop</Link></div>
      <div className="panel">
        <div className="f"><label htmlFor="sq">Search shop, owner, mobile or city</label><input id="sq" type="text" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Tabs tabs={FILTERS} value={filter} onChange={setFilter} />
        {error ? <div className="empty" role="alert">Could not load the shops: {error}</div>
          : shops === null ? <div className="empty">Loading…</div>
          : list.length ? (
            <div className="tw"><table><thead><tr><th>Shop</th><th>Owner</th><th>City</th><th>Plan</th><th className="r">PCs</th><th>Expires</th><th>Last seen</th><th>Status</th></tr></thead><tbody>
              {list.map((s) => (
                <tr key={s.tenantId}>
                  <td><b>{s.name}</b></td><td>{s.owner}<div className="muted mono">{phone(s.mobile)}</div></td><td>{s.city}</td><td>{s.planName}</td>
                  <td className="r num">{s.pcs}</td>
                  <td>{s.expires ? dOnly(new Date(s.expires).getTime()) : <span className="muted">—</span>}</td>
                  <td>{s.lastSeen ? ago(new Date(s.lastSeen).getTime()) : <span className="muted">Not activated</span>}</td>
                  <td><Chip tone={TONE[s.status]}>{LABEL[s.status]}</Chip></td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <div className="empty">{shops.length ? 'No shops match.' : 'No shops yet. Onboard the first one.'}</div>}
      </div>
    </>
  )
}
