import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Chip, SampleNote, Tabs } from '../components/ui'
import { ago, DAY, dOnly, lastSeen, planOf, statusOf, useStore } from '../store'

const FILTERS: Array<[string, string]> = [['all', 'All'], ['active', 'Active'], ['trial', 'Trial'], ['expiring', 'Expiring'], ['expired', 'Expired'], ['suspended', 'Suspended'], ['offline', 'Offline 7+ days']]

export function Shops() {
  const { shops } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [filter, setFilter] = useState<string>((loc.state as { filter?: string } | null)?.filter ?? 'all')
  const [q, setQ] = useState('')
  const T = Date.now()
  const list = shops.filter((s) => {
    const st = statusOf(s)[0]
    if (filter === 'active' && !['Active', 'Expiring'].includes(st)) return false
    if (filter === 'trial' && st !== 'Trial') return false
    if (filter === 'expiring' && !(s.status !== 'suspended' && s.expiry > T && s.expiry - T < 30 * DAY)) return false
    if (filter === 'expired' && st !== 'Expired') return false
    if (filter === 'suspended' && st !== 'Suspended') return false
    if (filter === 'offline' && !(s.devices.length && T - lastSeen(s)! > 7 * DAY)) return false
    return !q || `${s.name} ${s.owner} ${s.mobile} ${s.city}`.toLowerCase().includes(q.toLowerCase())
  })
  return (
    <>
      <div className="head"><h1>Shops</h1><Link className="btn p" to="/onboard">+ Onboard a shop</Link></div>
      <div className="panel">
        <div className="f"><label htmlFor="sq">Search shop, owner, mobile or city</label><input id="sq" type="text" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Tabs tabs={FILTERS} value={filter} onChange={setFilter} />
        {list.length ? (
          <div className="tw"><table><thead><tr><th>Shop</th><th>Owner</th><th>City</th><th>Plan</th><th className="r">Add-ons</th><th>Expires</th><th>Last seen</th><th>Status</th></tr></thead><tbody>
            {list.map((s) => {
              const st = statusOf(s); const ls = lastSeen(s)
              return (
                <tr key={s.id} className="click" onClick={() => nav(`/shops/${s.id}`)}>
                  <td><b>{s.name}</b></td><td>{s.owner}<div className="muted mono">{s.mobile}</div></td><td>{s.city}</td><td>{planOf(s).n}</td>
                  <td className="r num">{s.addons.length}</td><td>{dOnly(s.expiry)}</td><td>{ls ? ago(ls) : <span className="muted">Not activated</span>}</td><td><Chip tone={st[1]}>{st[0]}</Chip></td>
                </tr>
              )
            })}
          </tbody></table></div>
        ) : <div className="empty">No shops match.</div>}
      </div>
      <SampleNote />
    </>
  )
}
