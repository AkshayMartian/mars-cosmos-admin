import { useState } from 'react'
import { Link } from 'react-router-dom'
import { currentUser } from '../auth'
import { Chip, Field, Modal, SampleNote, toast } from '../components/ui'
import { addAudit, dt, uid, update, useStore, type Tone } from '../store'

export function WhatsApp() {
  const { shops, templates, logs } = useStore()
  const [shop, setShop] = useState('all')
  const [open, setOpen] = useState(false)
  const rows = logs.filter((l) => shop === 'all' || l.shop === shop)
  const tone: Record<string, Tone> = { Approved: 'good', Pending: 'warn', Rejected: 'bad' }
  const withWa = shops.filter((s) => s.wa.status !== 'none')
  return (
    <>
      <div className="head"><h1>WhatsApp</h1></div>
      <div className="kpis">{withWa.map((s) => <Link className="kpi" key={s.id} to={`/shops/${s.id}`}><b>{s.wa.used ?? 0}</b><span>{s.name} · {s.wa.status === 'live' ? 'live' : 'waiting for Meta'}</span></Link>)}</div>
      <div className="panel">
        <div className="head"><h2>Message templates</h2><button type="button" className="btn" onClick={() => setOpen(true)}>+ New template</button></div>
        <p className="muted" style={{ margin: 0 }}>Meta must approve each template before shops can send it. Utility = bills and ready messages. Marketing = offers (costs more, needs the “offers” consent tick).</p>
        <div className="tw"><table><thead><tr><th>Name</th><th>Type</th><th>Text</th><th>Meta status</th></tr></thead><tbody>
          {templates.map((t) => <tr key={t.id}><td className="mono">{t.name}</td><td>{t.cat}</td><td>{t.body}</td><td><Chip tone={tone[t.status]!}>{t.status}</Chip></td></tr>)}
        </tbody></table></div>
      </div>
      <div className="panel">
        <div className="row mid" style={{ justifyContent: 'space-between' }}><h2>Message log</h2>
          <div className="f" style={{ maxWidth: 240 }}><label htmlFor="ls">Shop</label><select id="ls" value={shop} onChange={(e) => setShop(e.target.value)}><option value="all">All shops</option>{withWa.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>
        {rows.length ? (
          <div className="tw"><table><thead><tr><th>Time</th><th>Shop</th><th>To</th><th>Template</th><th>Status</th></tr></thead><tbody>
            {rows.map((l, i) => <tr key={i}><td>{dt(l.at)}</td><td>{shops.find((s) => s.id === l.shop)?.name}</td><td>{l.cust} <span className="muted mono">{l.to}</span></td><td className="mono">{l.tpl}</td><td><Chip tone={l.status === 'Failed' ? 'bad' : 'good'}>{l.status}</Chip></td></tr>)}
          </tbody></table></div>
        ) : <div className="empty">No messages yet.</div>}
      </div>
      <SampleNote />
      {open && <TemplateModal onClose={() => setOpen(false)} />}
    </>
  )
}

function TemplateModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('day_end_summary')
  const [cat, setCat] = useState('Utility')
  const [body, setBody] = useState('Hi {{1}}, today’s sales at {{2}}: ₹{{3}} from {{4}} bills.')
  const by = currentUser()?.name ?? '—'
  return (
    <Modal onClose={onClose}>
      <h2>New WhatsApp template</h2>
      <div className="row"><Field label="Name" id="t-n"><input id="t-n" type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="f"><label htmlFor="t-c">Type</label><select id="t-c" value={cat} onChange={(e) => setCat(e.target.value)}><option>Utility</option><option>Marketing</option></select></div></div>
      <div className="f"><label htmlFor="t-b">Text ({'{{1}}, {{2}} …'} are filled per message)</label><textarea id="t-b" rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn p" onClick={() => { if (!name.trim()) return; update((s) => { s.templates.push({ id: uid('t'), name: name.trim(), cat, status: 'Pending', body }); addAudit(s, by, 'Template sent to Meta', null, name.trim()) }); toast('Sent to Meta for approval'); onClose() }}>Send to Meta for approval</button></div>
    </Modal>
  )
}
