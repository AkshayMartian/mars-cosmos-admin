import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ACTIVITY, SHOPS } from '../data/sample'
import { Pill, SampleBadge } from '../components/ui'

const TABS = ['Overview', 'Licence', 'Devices', 'Activity'] as const

export function ShopDetail() {
  const { id } = useParams()
  const shop = SHOPS.find((s) => s.id === id)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [showKey, setShowKey] = useState(false)
  const [msg, setMsg] = useState('')
  if (!shop) return <div className="card empty">No shop with that address. <Link to="/shops">Back to Shops</Link></div>
  const full = shop.id === 'raj-fashion' // the design only has a full record for this shop
  const initials = shop.name.split(' ').map((w) => w[0]).join('').slice(0, 2)
  const say = (m: string) => setMsg(m + ' (sample data: nothing was sent)')

  return (
    <>
      <div className="crumb"><Link to="/shops">Shops</Link> › {shop.name}</div>
      <header className="head">
        <div className="row">
          <div className="avatar" aria-hidden="true">{initials}</div>
          <div>
            <h1>{shop.name}</h1>
            <div className="sub">{shop.city}{full ? ', Gujarat · GST 24AAAAA1111A1Z5' : ''}</div>
          </div>
          <Pill tone={shop.licenceTone}>Licence: {shop.licence.toLowerCase()}</Pill>
        </div>
        <div className="row"><SampleBadge /><button className="btn" type="button" onClick={() => say('Shop suspended')}>Suspend shop</button><button className="btn primary" type="button" onClick={() => say('Renewal started')}>Renew licence</button></div>
      </header>
      {msg && <div className="flash" role="status">{msg}</div>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Overview' && (
        <div className="two">
          <section className="card stack">
            <h2>Shop and owner</h2>
            <dl>
              <dt>Owner</dt><dd>{shop.owner}</dd>
              <dt>Owner mobile</dt><dd>{full ? '98250 00210' : shop.mobile} <span className="ok-text">✓ verified</span></dd>
              <dt>Owner email</dt><dd>{full ? 'ra•••••@rajfashion.in' : '—'} <span className="ok-text">✓ verified</span></dd>
              <dt>Shop contact</dt><dd>{full ? '98250 00010' : '—'}</dd>
              <dt>Address</dt><dd>{full ? 'Shop 4, Titanium City Center, CG Road, Ahmedabad, Gujarat 380009' : shop.city}</dd>
              <dt>Description</dt><dd>{full ? 'Menswear and accessories on CG Road since 2009.' : '—'}</dd>
            </dl>
            <div className="hint">The email is shown masked here too. Only the reset email uses it.</div>
          </section>
          <div className="stack">
            <section className="card stack">
              <div className="row between"><h2>Activation key</h2><Pill tone={shop.appTone}>{shop.app}</Pill></div>
              <div className="keybox mono">{showKey ? 'MARS-7K2Q-9XFD-4LPA' : 'MARS-7K2Q-••••-••••'}</div>
              <div className="row">
                <button className="btn small" type="button" onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide key' : 'Show key'}</button>
                <button className="btn small" type="button" onClick={() => say('Key resent on WhatsApp')}>Resend on WhatsApp</button>
                <button className="btn small danger" type="button" onClick={() => say('Key revoked')}>Revoke</button>
              </div>
              <div className="hint">{full ? 'Sent on WhatsApp 12 Nov, delivered. Activated 12 Nov, 11:20.' : 'Not activated yet.'}</div>
            </section>
            <LicenceCard shop={shop} />
          </div>
        </div>
      )}
      {tab === 'Licence' && <LicenceCard shop={shop} />}
      {tab === 'Devices' && (
        <section className="card stack">
          <h2>Devices</h2>
          <div className="scroll">
            <table>
              <thead><tr>{['PC ID', 'Activated', 'Last check', 'Status', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {full ? <tr><td className="mono">124D-9CE2-664F</td><td>12 Nov 2026</td><td>2 hours ago</td><td><Pill tone="ok">In use</Pill></td><td><button className="btn small" type="button" onClick={() => say('PC released')}>Release PC</button></td></tr>
                  : <tr><td colSpan={5} className="muted">No PC has used this key yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="hint">Release PC frees the key so the owner can activate a new or repaired PC. Cloud plan: the data downloads back after activation.</div>
        </section>
      )}
      {tab === 'Activity' && (
        <section className="card stack">
          <h2>Activity</h2>
          {full ? <ul className="timeline">{ACTIVITY.map(([t, d]) => <li key={t + d}><span className="muted">{t}</span><span>{d}</span></li>)}</ul> : <div className="muted">Nothing yet.</div>}
        </section>
      )}
    </>
  )
}

function LicenceCard({ shop }: { shop: (typeof SHOPS)[number] }) {
  const full = shop.id === 'raj-fashion'
  return (
    <section className="card stack">
      <h2>Licence</h2>
      <dl>
        <dt>Plan</dt><dd>{shop.plan} · {shop.backup === 'Cloud' ? 'Cloud backup' : 'Local-only'}</dd>
        <dt>Counters</dt><dd>{full ? '1' : '—'}</dd>
        <dt>Valid till</dt><dd>{full ? '30 Nov 2026 (5 days)' : '—'}</dd>
        <dt>Last check by the app</dt><dd>{shop.lastSeen}</dd>
      </dl>
      <div className="hint">When it ends, the app locks until renewed. The shop&apos;s data stays on its PC.</div>
    </section>
  )
}
