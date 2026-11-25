import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { currentUser } from '../auth'
import { Chip, copyText, Field, Modal, SampleNote, Tabs, toast } from '../components/ui'
import { ADDONS, addAudit, addonName, ago, DAY, dOnly, dt, inr, lastSeen, newKey, PLANS, planOf, statusOf, update, useStore, type Shop, type State } from '../store'

type Tab = 'overview' | 'licence' | 'devices' | 'key' | 'addons' | 'wa' | 'notes'
type Confirm = { title: string; text: string; ok: string; act: (s: State, shop: Shop) => void }

export function ShopDetail() {
  const { id } = useParams()
  const { shops, logs, releases } = useStore()
  const s = shops.find((x) => x.id === id)
  const [tab, setTab] = useState<Tab>('overview')
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [editing, setEditing] = useState(false)
  const [plan, setPlan] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const by = currentUser()?.name ?? '—'

  if (!s) return <div className="empty">Shop not found. <Link to="/shops">Back to shops</Link></div>
  const st = statusOf(s); const p = planOf(s); const T = Date.now()
  const change = (fn: (shop: Shop, state: State) => void) => update((state) => fn(state.shops.find((x) => x.id === s.id)!, state))
  const maxPcs = p.counters + (s.addons.includes('extra_counter') ? 1 : 0)

  const tabs: Array<[Tab, string]> = [['overview', 'Overview'], ['licence', 'Licence'], ['devices', `Devices (${s.devices.length})`], ['key', 'Activation key'], ['addons', 'Add-ons'], ['wa', 'WhatsApp'], ['notes', 'Notes']]

  const renew = (months: number) => { change((x, state) => { x.expiry = Math.max(x.expiry, Date.now()) + months * 30.4 * DAY; if (x.status !== 'suspended') x.status = 'active'; addAudit(state, by, 'Licence renewed', x.id, months + ' months') }); toast('Licence renewed') }

  let body: React.ReactNode = null
  if (tab === 'overview') body = (
    <>
      <div className="cols">
        <dl className="kv"><dt>Shop</dt><dd><b>{s.name}</b></dd><dt>Owner</dt><dd>{s.owner}</dd><dt>Mobile</dt><dd className="mono">{s.mobile}</dd><dt>City</dt><dd>{s.city}</dd><dt>GSTIN</dt><dd className="mono">{s.gstin || '—'}</dd><dt>Shop ID</dt><dd className="mono">{s.id}</dd><dt>Customer since</dt><dd>{dOnly(s.start)}</dd></dl>
        <dl className="kv"><dt>Plan</dt><dd>{p.n} · {inr(p.year)}/year</dd><dt>Status</dt><dd><Chip tone={st[1]}>{st[0]}</Chip></dd><dt>Expires</dt><dd>{dOnly(s.expiry)}</dd><dt>Counters</dt><dd>{s.devices.length} of {maxPcs} used</dd><dt>Add-ons</dt><dd>{s.addons.map(addonName).join(', ') || '—'}</dd><dt>Last seen</dt><dd>{lastSeen(s) ? ago(lastSeen(s)!) : 'Not activated yet'}</dd><dt>App version</dt><dd>{[...new Set(s.devices.map((d) => d.ver))].join(', ') || '—'}</dd></dl>
      </div>
      <div><button type="button" className="btn" onClick={() => setEditing(true)}>Edit details</button></div>
    </>
  )
  if (tab === 'licence') body = (
    <>
      {st[0] === 'Expired' && <div className="banner">Licence expired. The shop’s app is read-only: they can see and reprint bills but cannot make new ones. No data is deleted.</div>}
      {st[0] === 'Suspended' && <div className="banner">Suspended. The app becomes read-only at its next licence check.</div>}
      <dl className="kv"><dt>Plan</dt><dd>{p.n} ({p.counters} counter{p.counters > 1 ? 's' : ''}, includes {p.inc.map(addonName).join(', ')})</dd><dt>Started</dt><dd>{dOnly(s.start)}</dd><dt>Expires</dt><dd><b>{dOnly(s.expiry)}</b></dd><dt>Status</dt><dd><Chip tone={st[1]}>{st[0]}</Chip></dd></dl>
      <div className="row"><div className="f" style={{ maxWidth: 220 }}><label htmlFor="pl">Change plan</label><select id="pl" value={plan ?? s.plan} onChange={(e) => setPlan(e.target.value)}>{PLANS.map((x) => <option key={x.k} value={x.k}>{x.n} · {inr(x.year)}/yr</option>)}</select></div>
        <button type="button" className="btn" onClick={() => { const k = plan ?? s.plan; if (k === s.plan) return; const np = PLANS.find((x) => x.k === k)!; change((x, state) => { x.plan = k; np.inc.forEach((a) => { if (!x.addons.includes(a)) x.addons.push(a) }); addAudit(state, by, 'Plan changed', x.id, np.n) }); toast('Plan changed to ' + np.n) }}>Save plan</button></div>
      <div className="row">
        <button type="button" className="btn p" onClick={() => renew(12)}>Renew 1 year</button>
        <button type="button" className="btn" onClick={() => renew(6)}>Renew 6 months</button>
        {s.status === 'trial' && <button type="button" className="btn" onClick={() => { change((x, state) => { x.status = 'active'; x.expiry = Date.now() + 365 * DAY; addAudit(state, by, 'Trial converted', x.id, planOf(x).n) }); toast('Now a paid shop for 1 year') }}>Convert trial to paid</button>}
        {s.status === 'suspended'
          ? <button type="button" className="btn" onClick={() => { change((x, state) => { x.status = 'active'; addAudit(state, by, 'Shop resumed', x.id, '') }); toast('Resumed') }}>Resume</button>
          : <button type="button" className="btn danger" onClick={() => setConfirm({ title: `Suspend ${s.name}?`, text: 'At its next licence check the app becomes read-only. Their data is not deleted. You can resume any time.', ok: 'Suspend', act: (state, x) => { x.status = 'suspended'; addAudit(state, by, 'Shop suspended', x.id, '') } })}>Suspend</button>}
      </div>
      <p className="muted" style={{ margin: 0 }}>The shop’s app picks up changes at its next daily check (or when staff press “Check licence” in Settings → Licence). Offline shops keep working until the expiry date.</p>
    </>
  )
  if (tab === 'devices') body = s.devices.length ? (
    <>
      <div className="tw"><table><thead><tr><th>PC name</th><th>Counter</th><th>App version</th><th>Activated</th><th>Last seen</th><th /></tr></thead><tbody>
        {s.devices.map((d) => (
          <tr key={d.id}><td className="mono">{d.pc}</td><td>{d.counter}</td><td>{d.ver}{d.ver !== releases[0]!.v && <> <Chip tone="warn">Update</Chip></>}</td><td>{dOnly(d.activated)}</td><td>{ago(d.seen)}</td>
            <td><button type="button" className="btn sm danger" onClick={() => setConfirm({ title: `Release ${d.pc}?`, text: 'This PC stops working with this shop at its next check. The activation key can then activate a new PC.', ok: 'Release PC', act: (state, x) => { x.devices = x.devices.filter((y) => y.id !== d.id); addAudit(state, by, 'Released PC', x.id, d.pc) } })}>Release PC</button></td></tr>
        ))}
      </tbody></table></div>
      <p className="muted" style={{ margin: 0 }}>Release a PC when the shop changes or formats its computer. The same activation key then works on the new PC, and data comes back from their backup.</p>
    </>
  ) : <div className="empty">No PC activated yet. Send the activation key to the owner.</div>
  if (tab === 'key') {
    const k = s.key; const expired = k.expires < T
    const msg = `Hi ${s.owner}, welcome to MARS POS! Install the app, then enter this key and your mobile number on the first screen: ${k.code} (valid till ${dOnly(k.expires)}).`
    body = (
      <>
        <div className="token" aria-label="Activation key">{k.code}</div>
        <dl className="kv"><dt>Created</dt><dd>{dOnly(k.created)}</dd><dt>Valid till</dt><dd>{dOnly(k.expires)} {expired ? <Chip tone="bad">Expired</Chip> : <Chip tone="good">Valid</Chip>}</dd><dt>PCs allowed</dt><dd>{maxPcs} ({s.devices.length} used)</dd></dl>
        <div className="row"><button type="button" className="btn p" onClick={() => copyText(k.code)}>Copy key</button><button type="button" className="btn" onClick={() => copyText(msg)}>Copy WhatsApp message</button>
          <button type="button" className="btn" onClick={() => { change((x, state) => { x.key = { code: newKey(), created: Date.now(), used: false, expires: Date.now() + 7 * DAY }; addAudit(state, by, 'New activation key', x.id, 'Old key cancelled') }); toast('New key made') }}>Make new key</button></div>
        <div className="panel" style={{ background: 'var(--sunk)', border: 0 }}><b>Message to send the owner</b><span>{msg}</span></div>
        <p className="muted" style={{ margin: 0 }}>A new key cancels the old one. Already activated PCs keep working. Sample data: new shops from “Onboard a shop” get a real key from the server.</p>
      </>
    )
  }
  if (tab === 'addons') body = (
    <>
      {ADDONS.map((a) => {
        const inc = p.inc.includes(a.k); const on = s.addons.includes(a.k)
        return (
          <div className="addon" key={a.k}>
            <div><b>{a.n}</b> {inc ? <Chip tone="grey">In plan</Chip> : <Chip tone="blue">{a.price ? inr(a.price) + '/month' : 'Free'}</Chip>} {a.net && <Chip tone="grey">Needs internet</Chip>}<div className="muted">{a.d}</div></div>
            <label className="switch" aria-label={a.n}><input type="checkbox" checked={on} onChange={(e) => {
              const turnOn = e.target.checked
              if (turnOn && a.k.startsWith('whatsapp') && s.wa.status !== 'live') { setTab('wa'); toast('Set up WhatsApp for this shop first'); return }
              change((x, state) => { x.addons = turnOn ? [...x.addons, a.k] : x.addons.filter((y) => y !== a.k); addAudit(state, by, turnOn ? 'Add-on on' : 'Add-on off', x.id, a.n) })
              toast(`${a.n} ${turnOn ? 'on' : 'off'}. The app updates at its next check.`)
            }} /><span /></label>
          </div>
        )
      })}
      <p className="muted" style={{ margin: 0 }}>Turned-off add-ons disappear from the shop’s app after its next licence check. Their data stays.</p>
    </>
  )
  if (tab === 'wa') body = <WaTab s={s} logs={logs.filter((l) => l.shop === s.id).slice(0, 6)} change={change} by={by} />
  if (tab === 'notes') body = (
    <>
      <div className="f"><label htmlFor="nt">Add a note</label><textarea id="nt" rows={3} placeholder="Called owner, printer paper issue fixed…" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div><button type="button" className="btn p" onClick={() => { const t = note.trim(); if (!t) return; change((x) => { x.notes.unshift({ at: Date.now(), by, text: t }) }); setNote('') }}>Save note</button></div>
      {s.notes.length ? s.notes.map((n, i) => <div className="note" key={i}><div className="muted">{dt(n.at)} · {n.by}</div>{n.text}</div>) : <div className="empty">No notes yet.</div>}
    </>
  )

  return (
    <>
      <div><Link to="/shops" className="muted">← All shops</Link></div>
      <div className="head"><div><h1>{s.name}</h1><div className="muted">{s.city} · {p.n} plan · <Chip tone={st[1]}>{st[0]}</Chip></div></div></div>
      <div className="panel"><Tabs tabs={tabs} value={tab} onChange={setTab} />{body}</div>
      <SampleNote />
      {editing && <EditShop s={s} by={by} onClose={() => setEditing(false)} />}
      {confirm && (
        <Modal onClose={() => setConfirm(null)}>
          <h2>{confirm.title}</h2><p style={{ margin: 0 }}>{confirm.text}</p>
          <div className="mfoot"><button type="button" className="btn" onClick={() => setConfirm(null)}>Keep</button>
            <button type="button" className="btn danger" onClick={() => { const c = confirm; update((state) => c.act(state, state.shops.find((x) => x.id === s.id)!)); setConfirm(null); toast('Done') }}>{confirm.ok}</button></div>
        </Modal>
      )}
    </>
  )
}

function WaTab({ s, logs, change, by }: { s: Shop; logs: ReturnType<typeof useStore>['logs']; change: (fn: (x: Shop, state: State) => void) => void; by: string }) {
  const w = s.wa
  const [number, setNumber] = useState('+91 ' + s.mobile)
  const [bsp, setBsp] = useState('Gupshup')
  const sm = { none: ['Not set up', 'grey'], pending: ['Waiting for Meta approval', 'warn'], live: ['Live', 'good'] } as const
  return (
    <>
      <dl className="kv"><dt>Status</dt><dd><Chip tone={sm[w.status][1]}>{sm[w.status][0]}</Chip></dd>{w.status !== 'none' && <><dt>Number</dt><dd className="mono">{w.number}</dd><dt>Partner (BSP)</dt><dd>{w.bsp}</dd></>}</dl>
      {w.status === 'live' && (
        <>
          <div><div className="row mid" style={{ justifyContent: 'space-between' }}><b>Messages this month</b><span className="num">{w.used} of {w.limit}</span></div><div className="meter" role="img" aria-label={`${w.used} of ${w.limit} used`}><i style={{ width: `${Math.min(100, ((w.used ?? 0) / (w.limit ?? 1)) * 100)}%` }} /></div></div>
          <div className="tw"><table><thead><tr><th>Time</th><th>Customer</th><th>Message</th><th>Status</th></tr></thead><tbody>
            {logs.map((l, i) => <tr key={i}><td>{dt(l.at)}</td><td>{l.cust} <span className="muted mono">{l.to}</span></td><td className="mono">{l.tpl}</td><td><Chip tone={l.status === 'Failed' ? 'bad' : 'good'}>{l.status}</Chip></td></tr>)}
          </tbody></table></div>
        </>
      )}
      {w.status === 'none' && (
        <>
          <div className="row"><div className="f"><label htmlFor="wn">Shop WhatsApp number</label><input id="wn" type="text" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
            <div className="f" style={{ maxWidth: 200 }}><label htmlFor="wb">Partner</label><select id="wb" value={bsp} onChange={(e) => setBsp(e.target.value)}><option>Gupshup</option><option>360dialog</option></select></div>
            <button type="button" className="btn p" onClick={() => { change((x, state) => { x.wa = { status: 'pending', number, bsp, used: 0, limit: 1000 }; addAudit(state, by, 'WhatsApp setup started', x.id, bsp) }); toast('Setup started. Waiting for Meta.') }}>Start WhatsApp setup</button></div>
          <p className="muted" style={{ margin: 0 }}>Needs the shop’s Meta business verification. Turn on the WhatsApp add-ons after it goes live.</p>
        </>
      )}
      {w.status === 'pending' && <div className="row"><button type="button" className="btn p" onClick={() => { change((x, state) => { x.wa.status = 'live'; addAudit(state, by, 'WhatsApp live', x.id, x.wa.number ?? '') }); toast('WhatsApp is live. Turn on the WhatsApp add-ons.') }}>Mark as live (Meta approved)</button></div>}
    </>
  )
}

function EditShop({ s, by, onClose }: { s: Shop; by: string; onClose: () => void }) {
  const [f, setF] = useState({ name: s.name, city: s.city, owner: s.owner, mobile: s.mobile, email: s.email, gstin: s.gstin })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }))
  const save = () => {
    const g = { ...f, name: f.name.trim(), city: f.city.trim(), owner: f.owner.trim(), mobile: f.mobile.trim(), gstin: f.gstin.trim().toUpperCase() }
    if (!g.name || !g.city || !g.owner || !g.mobile) return setErr('Fill shop name, city, owner and mobile.')
    if (g.mobile.replace(/\D/g, '').length !== 10) return setErr('Mobile must be 10 digits.')
    if (g.gstin && g.gstin.length !== 15) return setErr('GSTIN must be 15 characters.')
    update((state) => { Object.assign(state.shops.find((x) => x.id === s.id)!, g); addAudit(state, by, 'Shop edited', s.id, g.name) })
    toast('Saved'); onClose()
  }
  return (
    <Modal onClose={onClose}>
      <h2>Edit shop</h2>
      <div className="row"><Field label="Shop name *" id="m-n"><input id="m-n" type="text" value={f.name} onChange={set('name')} /></Field><Field label="City *" id="m-c"><input id="m-c" type="text" value={f.city} onChange={set('city')} /></Field></div>
      <div className="row"><Field label="Owner name *" id="m-o"><input id="m-o" type="text" value={f.owner} onChange={set('owner')} /></Field><Field label="Owner mobile *" id="m-m"><input id="m-m" type="text" inputMode="numeric" value={f.mobile} onChange={set('mobile')} /></Field></div>
      <div className="row"><Field label="Email" id="m-e"><input id="m-e" type="email" value={f.email} onChange={set('email')} /></Field><Field label="GSTIN" id="m-g"><input id="m-g" type="text" maxLength={15} value={f.gstin} onChange={set('gstin')} /></Field></div>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn p" onClick={save}>Save</button></div>
    </Modal>
  )
}
