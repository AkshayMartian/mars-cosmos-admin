import { useState } from 'react'
import { Link } from 'react-router-dom'
import { currentUser } from '../auth'
import { Chip, Field, Modal, SampleNote, toast } from '../components/ui'
import { ADDONS, addAudit, addonName, dOnly, dt, inr, PLANS, uid, update, useStore, type State } from '../store'

export function Plans() {
  const { shops } = useStore()
  return (
    <>
      <div className="head"><h1>Plans &amp; add-ons</h1></div>
      <div className="panel"><h2>Plans</h2>
        <div className="tw"><table><thead><tr><th>Plan</th><th className="r">Price / year</th><th className="r">Counters</th><th>Included</th><th className="r">Shops</th></tr></thead><tbody>
          {PLANS.map((p) => <tr key={p.k}><td><b>{p.n}</b></td><td className="r num">{inr(p.year)}</td><td className="r num">{p.counters}</td><td>{p.inc.map(addonName).join(', ')}</td><td className="r num">{shops.filter((s) => s.plan === p.k).length}</td></tr>)}
        </tbody></table></div>
      </div>
      <div className="panel"><h2>Add-ons</h2>
        <div className="tw"><table><thead><tr><th>Add-on</th><th>What it does</th><th className="r">Price / month</th><th>Internet</th><th className="r">Shops using</th></tr></thead><tbody>
          {ADDONS.map((a) => <tr key={a.k}><td><b>{a.n}</b></td><td>{a.d}</td><td className="r num">{a.price ? inr(a.price) : 'Free'}</td><td>{a.net ? 'Needed' : 'Not needed'}</td><td className="r num">{shops.filter((s) => s.addons.includes(a.k)).length}</td></tr>)}
        </tbody></table></div>
        <p className="sample">Example prices. The final prices are set by the Admin; WhatsApp add-ons include Meta’s per-message cost.</p>
      </div>
    </>
  )
}

export function Releases() {
  const { releases, shops } = useStore()
  const [open, setOpen] = useState(false)
  const latest = releases[0]!.v
  const counts: Record<string, number> = {}
  shops.forEach((s) => s.devices.forEach((d) => { counts[d.ver] = (counts[d.ver] ?? 0) + 1 }))
  return (
    <>
      <div className="head"><h1>App releases</h1><button type="button" className="btn p" onClick={() => setOpen(true)}>+ New release</button></div>
      <div className="kpis">{Object.entries(counts).sort().reverse().map(([v, n]) => <div className="kpi" key={v}><b>{n}</b><span>PCs on {v}{v === latest ? ' (latest)' : ''}</span></div>)}</div>
      <div className="panel">
        <div className="tw"><table><thead><tr><th>Version</th><th>Date</th><th>What changed</th><th>Sent to</th></tr></thead><tbody>
          {releases.map((r) => <tr key={r.v}><td className="mono"><b>{r.v}</b></td><td>{dOnly(r.date)}</td><td>{r.notes}</td><td>{r.rollout}</td></tr>)}
        </tbody></table></div>
        <p className="muted" style={{ margin: 0 }}>The shop’s app checks for a new version once a day and shows “Update available”. Send a release to a few shops first, then to all.</p>
      </div>
      <SampleNote />
      {open && <ReleaseModal onClose={() => setOpen(false)} />}
    </>
  )
}

function ReleaseModal({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState('1.0.3')
  const [notes, setNotes] = useState('')
  const [rollout, setRollout] = useState('Pilot shop only')
  const by = currentUser()?.name ?? '—'
  return (
    <Modal onClose={onClose}>
      <h2>New app release</h2>
      <Field label="Version" id="r-v"><input id="r-v" type="text" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <div className="f"><label htmlFor="r-n">What changed</label><textarea id="r-n" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="f"><label htmlFor="r-r">Send to</label><select id="r-r" value={rollout} onChange={(e) => setRollout(e.target.value)}><option>Pilot shop only</option><option>10% of shops</option><option>All shops</option></select></div>
      <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn p" onClick={() => { if (!v.trim()) return; update((s) => { s.releases.unshift({ v: v.trim(), date: Date.now(), notes, rollout }); addAudit(s, by, 'App released', null, v.trim()) }); toast('Release ' + v.trim() + ' published'); onClose() }}>Publish release</button></div>
    </Modal>
  )
}

export function Payments() {
  const { invoices, shops } = useStore()
  const by = currentUser()?.name ?? '—'
  return (
    <>
      <div className="head"><div><h1>Payments</h1><div className="muted">Can come after the main screens.</div></div></div>
      <div className="panel"><div className="tw"><table><thead><tr><th>Invoice</th><th>Shop</th><th className="r">Amount</th><th>Date</th><th>Status</th><th /></tr></thead><tbody>
        {invoices.map((i) => (
          <tr key={i.id}><td className="mono">{i.no}</td><td>{shops.find((s) => s.id === i.shop)?.name}</td><td className="r num">{inr(i.amount)}</td><td>{dOnly(i.date)}</td>
            <td>{i.paid ? <Chip tone="good">Paid</Chip> : i.due < Date.now() ? <Chip tone="bad">Overdue</Chip> : <Chip tone="warn">Due</Chip>}</td>
            <td>{!i.paid && <button type="button" className="btn sm" onClick={() => { update((s: State) => { s.invoices.find((x) => x.id === i.id)!.paid = true; addAudit(s, by, 'Invoice paid', i.shop, i.no) }); toast(i.no + ' marked paid') }}>Mark paid</button>}</td></tr>
        ))}
      </tbody></table></div></div>
      <SampleNote />
    </>
  )
}

export function Team() {
  const { team } = useStore()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', email: '', role: 'Support' as 'Admin' | 'Support' | 'Sales' })
  const by = currentUser()?.name ?? '—'
  return (
    <>
      <div className="head"><h1>Team</h1><button type="button" className="btn p" onClick={() => setOpen(true)}>+ Add team member</button></div>
      <div className="panel">
        <div className="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>
          {team.map((u) => <tr key={u.id}><td>{u.name}</td><td className="mono">{u.email}</td><td>{u.role}</td><td><Chip tone={u.active ? 'good' : 'grey'}>{u.active ? 'Active' : 'Off'}</Chip></td></tr>)}
        </tbody></table></div>
        <div className="tw"><table><thead><tr><th>Role</th><th>Can do</th></tr></thead><tbody>
          <tr><td><b>Admin</b></td><td>Everything, including plans, prices, team and app releases</td></tr>
          <tr><td><b>Support</b></td><td>See shops, devices, activation keys, release PC, notes, WhatsApp logs</td></tr>
          <tr><td><b>Sales</b></td><td>Onboard shops, trials, renew, send activation keys</td></tr>
        </tbody></table></div>
      </div>
      <SampleNote />
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h2>Add team member</h2>
          <div className="row"><Field label="Name" id="u-n"><input id="u-n" type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Email" id="u-e"><input id="u-e" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
          <div className="f"><label htmlFor="u-r">Role</label><select id="u-r" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as typeof f.role })}><option>Support</option><option>Sales</option><option>Admin</option></select></div>
          <div className="mfoot"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn p" onClick={() => { const n = f.name.trim(), e = f.email.trim().toLowerCase(); if (!n || !e) return; update((s) => { s.team.push({ id: uid('u'), name: n, email: e, role: f.role, active: true }); addAudit(s, by, 'Team member added', null, n) }); toast('Added'); setOpen(false); setF({ name: '', email: '', role: 'Support' }) }}>Add</button></div>
        </Modal>
      )}
    </>
  )
}

export function Audit() {
  const { audit, shops } = useStore()
  const [q, setQ] = useState('')
  const name = (id: string | null) => shops.find((s) => s.id === id)?.name ?? ''
  const list = audit.filter((a) => !q || `${a.by} ${a.action} ${a.details} ${name(a.shop)}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <div className="head"><h1>Audit log</h1></div>
      <div className="panel"><div className="f"><label htmlFor="aq">Search</label><input id="aq" type="text" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="tw"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Shop</th><th>Details</th></tr></thead><tbody>
          {list.map((a, i) => <tr key={i}><td>{dt(a.at)}</td><td>{a.by}</td><td>{a.action}</td><td>{a.shop && <Link to={`/shops/${a.shop}`}>{name(a.shop)}</Link>}</td><td>{a.details}</td></tr>)}
        </tbody></table></div>
      </div>
    </>
  )
}
