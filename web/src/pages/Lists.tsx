import { useEffect, useState } from 'react'
import { get, post, put } from '../api'
import { Link } from 'react-router-dom'
import { currentUser } from '../auth'
import { Chip, Field, Modal, PasswordInput, SampleNote, toast } from '../components/ui'
import { ADDONS, addAudit, addonName, ago, dOnly, dt, inr, PLANS, uid, update, useStore, type State } from '../store'

interface PlanRow { key: string; name: string; yearPrice: number; counters: number; includes: string[] }

export function Plans() {
  const { shops } = useStore()
  const isAdmin = currentUser()?.role === 'Admin'
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<{ key: string; price: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [nf, setNf] = useState({ name: '', price: '', counters: '1', includes: [] as string[] })
  const [nErr, setNErr] = useState<{ name?: string; price?: string; counters?: string; server?: string }>({})
  const openAdd = () => { setNf({ name: '', price: '', counters: '1', includes: [] }); setNErr({}); setAdding(true) }
  const addPlan = async () => {
    const e: typeof nErr = {}
    const name = nf.name.trim()
    if (name.length < 2) e.name = 'The plan name needs at least 2 characters.'
    else if (plans?.some((p) => p.name.toLowerCase() === name.toLowerCase())) e.name = 'A plan with this name already exists.'
    if (nf.price === '') e.price = 'Type the price in whole rupees.'
    if (!(Number(nf.counters) >= 1 && Number(nf.counters) <= 50)) e.counters = 'Counters: a number from 1 to 50.'
    setNErr(e)
    if (e.name || e.price || e.counters) return
    setSaving(true)
    try {
      const r = await post<{ plans: PlanRow[] }>('/v1/admin/plans', { name, yearPrice: Number(nf.price), counters: Number(nf.counters), includes: nf.includes })
      setPlans(r.plans); setAdding(false); toast(`Plan “${name}” added.`)
    } catch (err) { setNErr({ server: err instanceof Error ? err.message : 'Could not add the plan.' }) } finally { setSaving(false) }
  }
  useEffect(() => {
    get<{ plans: PlanRow[] }>('/v1/admin/plans').then((r) => setPlans(r.plans), (e: Error) => setError(e.message))
    get<{ shops: Array<{ plan: string }> }>('/v1/admin/shops').then((r) => setCounts(r.shops.reduce<Record<string, number>>((a, s) => ({ ...a, [s.plan]: (a[s.plan] ?? 0) + 1 }), {})), () => undefined)
  }, [])
  const save = async () => {
    if (!editing) return
    const price = Number(editing.price)
    if (!Number.isInteger(price) || price < 0) return toast('Type the price in whole rupees.')
    setSaving(true)
    try {
      const r = await put<{ plans: PlanRow[] }>(`/v1/admin/plans/${editing.key}`, { yearPrice: price })
      setPlans(r.plans); setEditing(null); toast('Price saved.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save.') } finally { setSaving(false) }
  }
  return (
    <>
      <div className="head"><h1>Plans &amp; add-ons</h1>{isAdmin && <button type="button" className="btn p" onClick={openAdd}>+ New plan</button>}</div>
      {adding && (
        <Modal onClose={() => setAdding(false)}>
          <form className="stackv" onSubmit={(e) => { e.preventDefault(); void addPlan() }}>
            <h2>New plan</h2>
            <Field label="Plan name" id="np-name" error={nErr.name}><input id="np-name" value={nf.name} maxLength={40} autoFocus onChange={(e) => setNf({ ...nf, name: e.target.value })} aria-invalid={!!nErr.name} /></Field>
            <div className="row">
              <Field label="Price per year (₹)" id="np-price" error={nErr.price}><input id="np-price" inputMode="numeric" value={nf.price} onChange={(e) => setNf({ ...nf, price: e.target.value.replace(/\D/g, '').slice(0, 8) })} aria-invalid={!!nErr.price} /></Field>
              <Field label="Counters" id="np-counters" error={nErr.counters}><input id="np-counters" inputMode="numeric" value={nf.counters} onChange={(e) => setNf({ ...nf, counters: e.target.value.replace(/\D/g, '').slice(0, 2) })} aria-invalid={!!nErr.counters} /></Field>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="muted" style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Included add-ons</legend>
              {ADDONS.map((a) => (
                <label key={a.k} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                  <input type="checkbox" style={{ width: 18, height: 18 }} checked={nf.includes.includes(a.k)} onChange={(e) => setNf({ ...nf, includes: e.target.checked ? [...nf.includes, a.k] : nf.includes.filter((k) => k !== a.k) })} />{a.n}
                </label>
              ))}
            </fieldset>
            {nErr.server && <div className="err" role="alert">{nErr.server}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
              <button type="submit" className="btn p" disabled={saving}>{saving ? 'Adding…' : 'Add plan'}</button>
            </div>
          </form>
        </Modal>
      )}
      <div className="panel"><h2>Plans</h2>
        {error ? <div className="empty" role="alert">Could not load the plans: {error}</div> : !plans ? <div className="empty">Loading…</div> : (
          <div className="tw"><table><thead><tr><th>Plan</th><th className="r">Price / year</th><th className="r">Counters</th><th>Included</th><th className="r">Shops</th>{isAdmin && <th />}</tr></thead><tbody>
            {plans.map((p) => (
              <tr key={p.key}><td><b>{p.name}</b></td>
                <td className="r num">{editing?.key === p.key
                  ? <input aria-label={`${p.name} price per year`} type="text" inputMode="numeric" style={{ width: 110, textAlign: 'right' }} value={editing.price} autoFocus
                      onChange={(e) => setEditing({ key: p.key, price: e.target.value.replace(/\D/g, '') })} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(null) }} />
                  : inr(p.yearPrice)}</td>
                <td className="r num">{p.counters}</td><td>{p.includes.map(addonName).join(', ')}</td><td className="r num">{counts[p.key] ?? 0}</td>
                {isAdmin && <td className="r">{editing?.key === p.key
                  ? <><button type="button" className="btn sm p" disabled={saving} onClick={() => void save()}>Save</button> <button type="button" className="btn sm" onClick={() => setEditing(null)}>Cancel</button></>
                  : <button type="button" className="btn sm" onClick={() => setEditing({ key: p.key, price: String(p.yearPrice) })}>Change price</button>}</td>}
              </tr>
            ))}
          </tbody></table></div>
        )}
        <p className="muted" style={{ margin: 0 }}>Prices are kept in the database. The dashboard’s yearly plan value uses them.{isAdmin ? '' : ' Only an Admin can change them.'}</p>
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

interface Member { name: string; email: string; role: 'Admin' | 'Support' | 'Sales'; active: boolean; lastLoginAt: string | null }
type Role = Member['role']
const BLANK_MEMBER = { name: '', email: '', role: 'Support' as Role, password: '' }

export function Team() {
  const me = currentUser()
  const isAdmin = me?.role === 'Admin'
  const [team, setTeam] = useState<Member[] | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState(BLANK_MEMBER)
  const [editing, setEditing] = useState<{ m: Member; role: Role; password: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { get<{ team: Member[] }>('/v1/admin/team').then((r) => setTeam(r.team), (e: Error) => setError(e.message)) }, [])

  const run = async (fn: () => Promise<{ team: Member[] }>, done: string, close: () => void) => {
    setBusy(true)
    try { const r = await fn(); setTeam(r.team); toast(done); close() } catch (e) { toast(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }
  const add = () => {
    if (!f.name.trim() || !f.email.trim() || !f.password) return toast('Fill in name, email and a password.')
    void run(() => post('/v1/admin/team', { ...f, name: f.name.trim(), email: f.email.trim() }), 'Team member added. Give them their password.', () => { setAdding(false); setF(BLANK_MEMBER) })
  }
  const change = (m: Member, body: Record<string, unknown>, done: string) =>
    run(() => put(`/v1/admin/team/${encodeURIComponent(m.email)}`, body), done, () => setEditing(null))
  const saveEdit = () => {
    if (!editing) return
    const body: Record<string, unknown> = {}
    if (editing.role !== editing.m.role) body['role'] = editing.role
    if (editing.password) body['password'] = editing.password
    if (!Object.keys(body).length) return setEditing(null)
    void change(editing.m, body, 'Saved.')
  }

  return (
    <>
      <div className="head"><h1>Team</h1>{isAdmin && <button type="button" className="btn p" onClick={() => setAdding(true)}>+ Add team member</button>}</div>
      <div className="panel">
        {error ? <div className="empty" role="alert">Could not load the team: {error}</div> : !team ? <div className="empty">Loading…</div> : (
          <div className="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Status</th>{isAdmin && <th />}</tr></thead><tbody>
            {team.map((u) => {
              const self = u.email === me?.email
              return (
                <tr key={u.email}><td>{u.name}{self && <span className="muted"> (you)</span>}</td><td className="mono">{u.email}</td><td>{u.role}</td>
                  <td>{u.lastLoginAt ? ago(new Date(u.lastLoginAt).getTime()) : <span className="muted">Never</span>}</td>
                  <td><Chip tone={u.active ? 'good' : 'grey'}>{u.active ? 'Active' : 'Off'}</Chip></td>
                  {isAdmin && <td className="r">
                    <button type="button" className="btn sm" onClick={() => setEditing({ m: u, role: u.role, password: '' })}>Edit</button>{' '}
                    {!self && <button type="button" className="btn sm" disabled={busy} onClick={() => void change(u, { active: !u.active }, u.active ? `${u.name} switched off.` : `${u.name} switched on.`)}>{u.active ? 'Switch off' : 'Switch on'}</button>}
                  </td>}
                </tr>
              )
            })}
          </tbody></table></div>
        )}
        <div className="tw"><table><thead><tr><th>Role</th><th>Can do</th></tr></thead><tbody>
          <tr><td><b>Admin</b></td><td>Everything, including plans, prices, team and app releases</td></tr>
          <tr><td><b>Support</b></td><td>See shops, devices, activation keys, release PC, notes, WhatsApp logs</td></tr>
          <tr><td><b>Sales</b></td><td>Onboard shops, trials, renew, send activation keys</td></tr>
        </tbody></table></div>
        {!isAdmin && <p className="muted" style={{ margin: 0 }}>Only an Admin can add or change team members.</p>}
      </div>
      {adding && (
        <Modal onClose={() => setAdding(false)}>
          <h2>Add team member</h2>
          <div className="row start"><Field label="Name" id="u-n"><input id="u-n" type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Email" id="u-e"><input id="u-e" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
          <div className="row start">
            <div className="f"><label htmlFor="u-r">Role</label><select id="u-r" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}><option>Support</option><option>Sales</option><option>Admin</option></select></div>
            <Field label="Password" id="u-p" hint="At least 8 characters. Share it with them privately."><PasswordInput id="u-p" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          </div>
          <div className="mfoot"><button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" className="btn p" disabled={busy} onClick={add}>Add</button></div>
        </Modal>
      )}
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h2>Edit {editing.m.name}</h2>
          <div className="f"><label htmlFor="e-r">Role</label><select id="e-r" value={editing.role} disabled={editing.m.email === me?.email} onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}><option>Support</option><option>Sales</option><option>Admin</option></select></div>
          <Field label="New password" id="e-p" hint="Leave empty to keep the current password."><PasswordInput id="e-p" autoComplete="new-password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></Field>
          <div className="mfoot"><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="btn p" disabled={busy} onClick={saveEdit}>Save</button></div>
        </Modal>
      )}
    </>
  )
}

interface AuditEntry { id: string; at: string; by: string; action: string; shop: string | null; details: string }

export function Audit() {
  const [q, setQ] = useState('')
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const query = (before?: string) => `/v1/admin/audit?${new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(before ? { before } : {}) })}`

  // search as you type, after a short pause; an older answer never replaces a newer one
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      get<{ entries: AuditEntry[]; more: boolean }>(query()).then((r) => { if (live) { setEntries(r.entries); setMore(r.more); setError('') } }, (e: Error) => { if (live) setError(e.message) })
    }, q ? 300 : 0)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  const loadMore = async () => {
    if (!entries?.length) return
    setLoadingMore(true)
    try {
      const r = await get<{ entries: AuditEntry[]; more: boolean }>(query(entries[entries.length - 1]!.at))
      setEntries([...entries, ...r.entries]); setMore(r.more)
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not load more.') } finally { setLoadingMore(false) }
  }

  return (
    <>
      <div className="head"><h1>Audit log</h1></div>
      <div className="panel"><div className="f"><label htmlFor="aq">Search who, action or shop</label><input id="aq" type="text" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {error ? <div className="empty" role="alert">Could not load the audit log: {error}</div>
          : entries === null ? <div className="empty">Loading…</div>
          : entries.length ? (
            <>
              <div className="tw"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Shop</th><th>Details</th></tr></thead><tbody>
                {entries.map((a) => <tr key={a.id}><td>{dt(new Date(a.at).getTime())}</td><td>{a.by}</td><td>{a.action}</td><td>{a.shop ?? '—'}</td><td>{a.details}</td></tr>)}
              </tbody></table></div>
              {more && <div className="mfoot" style={{ justifyContent: 'center' }}><button type="button" className="btn" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Show older'}</button></div>}
            </>
          ) : <div className="empty">{q.trim() ? 'Nothing matches.' : 'No changes recorded yet.'}</div>}
      </div>
    </>
  )
}
