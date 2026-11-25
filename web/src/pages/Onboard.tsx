import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STATES } from '../data/sample'
import { Field, PageHead } from '../components/ui'

const MOBILE_RE = /^[6-9]\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const digits = (v: string, n: number) => v.replace(/\D/g, '').slice(0, n)
const MOBILE_MSG = 'Mobile number: 10 digits starting with 6, 7, 8 or 9.'

type Verify = 'idle' | 'sent' | 'done'

/** One verified contact: type it, press Send code, type the 6-digit code, Verify. Sample mode accepts any 6 digits. */
function Verified({ id, label, value, onValue, valid, error, hint, mask, state, setState }: {
  id: string; label: string; value: string; onValue: (v: string) => void; valid: boolean; error?: string; hint?: string; mask: (v: string) => string
  state: Verify; setState: (s: Verify) => void
}) {
  const [code, setCode] = useState('')
  return (
    <div className="stack tight">
      <Field label={label} id={id} error={error} hint={hint}>
        <div className="row">
          <input id={id} className="grow" value={value} disabled={state === 'done'} inputMode={id === 'mobile' ? 'numeric' : 'email'} onChange={(e) => { onValue(mask(e.target.value)); setState('idle') }} aria-invalid={!!error} />
          {state === 'done' ? <span className="pill ok">✓ Verified</span> : <button type="button" className="btn" disabled={!valid} onClick={() => setState('sent')}>{state === 'sent' ? 'Resend code' : 'Send code'}</button>}
        </div>
      </Field>
      {state === 'sent' && (
        <div className="row">
          <input aria-label="6-digit code" className="code" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(digits(e.target.value, 6))} />
          <button type="button" className="btn" disabled={code.length !== 6} onClick={() => { setState('done'); setCode('') }}>Verify</button>
        </div>
      )}
    </div>
  )
}

export function Onboard() {
  const [f, setF] = useState({ name: '', mobile: '', email: '', password: '', shop: '', contact: '', desc: '', gst: '', address: '', city: '', state: STATES[0]!, pin: '', plan: 'Starter', backup: 'Cloud backup', counters: '1', days: '365' })
  const [mv, setMv] = useState<Verify>('idle')
  const [ev, setEv] = useState<Verify>('idle')
  const [created, setCreated] = useState(false)
  const [tried, setTried] = useState(false)
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }))
  const gst = f.gst.toUpperCase()

  const err: Record<string, string | undefined> = {
    name: !f.name.trim() ? 'Type the owner’s full name.' : undefined,
    mobile: f.mobile && !MOBILE_RE.test(f.mobile) ? MOBILE_MSG : undefined,
    email: f.email && !EMAIL_RE.test(f.email) ? 'Type a valid email address.' : undefined,
    password: f.password && f.password.length < 10 ? 'Use at least 10 characters.' : undefined,
    shop: !f.shop.trim() ? 'Type the shop name.' : undefined,
    contact: f.contact && !MOBILE_RE.test(f.contact) ? MOBILE_MSG : undefined,
    gst: gst && !GST_RE.test(gst) ? 'The GST number is not valid. It has 15 characters, like 24AAAAA1111A1Z5.'
      : gst && GST_RE.test(gst) && gst.slice(0, 2) !== f.state.slice(0, 2) ? `The GST number starts with ${gst.slice(0, 2)}, which is not the State chosen below.` : undefined,
    address: !f.address.trim() ? 'Type the shop address.' : undefined,
    city: !f.city.trim() ? 'Type the city.' : undefined,
    pin: f.pin.length !== 6 ? 'Pincode has 6 digits.' : undefined
  }
  const required = ['name', 'mobile', 'email', 'password', 'shop', 'contact', 'address', 'city', 'pin'] as const
  const missing = required.some((k) => !f[k])
  const ready = mv === 'done' && ev === 'done' && !missing && !Object.values(err).some(Boolean)
  const show = (k: string) => (tried || f[k as keyof typeof f] !== '' ? err[k] : undefined)

  if (created) {
    return (
      <>
        <PageHead title="Onboard a shop" sub="The owner is set up." />
        <section className="card success">
          <h2>Shop created. Activation key sent on WhatsApp.</h2>
          <p>Sent to +91 {f.mobile.slice(0, 2)}•••••{f.mobile.slice(-3)}. The owner enters it, with the same mobile number, in the app.</p>
          <div className="keybox mono">MARS-7K2Q-9XFD-4LPA</div>
          <div className="row"><Link className="btn primary" to="/shops/raj-fashion">Open shop</Link><button className="btn" type="button" onClick={() => { setCreated(false); setMv('idle'); setEv('idle'); setTried(false); setF({ ...f, name: '', mobile: '', email: '', password: '', shop: '', contact: '', desc: '', gst: '', address: '', city: '', pin: '' }) }}>Onboard another</button></div>
          <div className="hint">Sample data: no shop was saved and no message was sent.</div>
        </section>
      </>
    )
  }

  return (
    <>
      <PageHead title="Onboard a shop" sub="Fill this with the owner (or send them the link). Mobile and email must be verified before the activation key can be created." />
      <div className="two form">
        <div className="stack">
          <section className="card stack">
            <h2><span className="num">1</span>Owner</h2>
            <div className="row"><div className="avatar big" aria-hidden="true">{f.name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}</div>
              <div><button type="button" className="btn small">Upload profile photo</button><div className="hint">JPG or PNG, up to 2 MB. Optional.</div></div></div>
            <Field label="Full name *" id="name" error={show('name')}><input id="name" value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field>
            <Verified id="mobile" label="Mobile number *" value={f.mobile} onValue={set('mobile')} mask={(v) => digits(v, 10)} valid={MOBILE_RE.test(f.mobile)} error={show('mobile')} state={mv} setState={setMv} />
            <Verified id="email" label="Email *" value={f.email} onValue={set('email')} mask={(v) => v.trim()} valid={EMAIL_RE.test(f.email)} error={show('email')} hint="This address receives the forgot-PIN link. It is never shown in the app." state={ev} setState={setEv} />
            <Field label="Portal password *" id="password" error={show('password')} hint="At least 10 characters. For the owner’s portal login only, not the 4-digit app PIN."><input id="password" type="password" value={f.password} onChange={(e) => set('password')(e.target.value)} /></Field>
          </section>

          <section className="card stack">
            <h2><span className="num">2</span>Shop</h2>
            <Field label="Shop name *" id="shop" error={show('shop')}><input id="shop" value={f.shop} onChange={(e) => set('shop')(e.target.value)} /></Field>
            <Field label="Shop contact number *" id="contact" error={show('contact')} hint={MOBILE_MSG}><input id="contact" inputMode="numeric" value={f.contact} onChange={(e) => set('contact')(digits(e.target.value, 10))} /></Field>
            <Field label="Shop description" id="desc"><textarea id="desc" rows={3} value={f.desc} onChange={(e) => set('desc')(e.target.value)} /></Field>
            <Field label="GST number" id="gst" error={err['gst']} hint="Optional. The first two digits are the state code (24 = Gujarat); the State below must match."><input id="gst" maxLength={15} value={gst} onChange={(e) => set('gst')(e.target.value.replace(/[^0-9a-zA-Z]/g, ''))} /></Field>
          </section>

          <section className="card stack">
            <h2><span className="num">3</span>Shop address</h2>
            <Field label="Address *" id="address" error={show('address')}><input id="address" value={f.address} onChange={(e) => set('address')(e.target.value)} /></Field>
            <div className="grid3">
              <Field label="City *" id="city" error={show('city')}><input id="city" value={f.city} onChange={(e) => set('city')(e.target.value)} /></Field>
              <Field label="State *" id="state"><select id="state" value={f.state} onChange={(e) => set('state')(e.target.value)}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="Pincode *" id="pin" error={show('pin')}><input id="pin" inputMode="numeric" value={f.pin} onChange={(e) => set('pin')(digits(e.target.value, 6))} /></Field>
            </div>
          </section>

          <section className="card stack">
            <h2><span className="num">4</span>Plan and licence</h2>
            <div className="grid4">
              <Field label="Plan" id="plan"><select id="plan" value={f.plan} onChange={(e) => set('plan')(e.target.value)}><option>Starter</option><option>Growth</option></select></Field>
              <Field label="Backup mode" id="backup"><select id="backup" value={f.backup} onChange={(e) => set('backup')(e.target.value)}><option>Cloud backup</option><option>Local-only</option></select></Field>
              <Field label="Counters" id="counters"><input id="counters" inputMode="numeric" value={f.counters} onChange={(e) => set('counters')(digits(e.target.value, 2))} /></Field>
              <Field label="Valid for (days)" id="days"><input id="days" inputMode="numeric" value={f.days} onChange={(e) => set('days')(digits(e.target.value, 4))} /></Field>
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card stack sticky">
            <h2>Before you submit</h2>
            <ul className="checks">
              <li className={mv === 'done' ? 'yes' : 'no'}>{mv === 'done' ? '✓' : '•'} Mobile verified</li>
              <li className={ev === 'done' ? 'yes' : 'no'}>{ev === 'done' ? '✓' : '•'} Email verified</li>
              {err['gst'] && <li className="warn">! GST number needs fixing (optional field)</li>}
              {tried && missing && <li className="warn">! Fill in every field marked *</li>}
            </ul>
            <button type="button" className="btn primary wide" disabled={mv !== 'done' || ev !== 'done'} onClick={() => { setTried(true); if (ready) setCreated(true) }}>Create shop and send key</button>
            {(mv !== 'done' || ev !== 'done') && <div className="hint">Verify the mobile and the email first.</div>}
            <h3>What happens next</h3>
            <ol className="next">
              <li>The shop and owner are saved. The activation key is created.</li>
              <li>The key is sent to the owner’s WhatsApp.</li>
              <li>The owner installs the app and enters the key and the same mobile number.</li>
              <li>The app opens Settings → Shop with these details filled in, ready to edit.</li>
            </ol>
            <div className="hint">Sample mode: any 6-digit code verifies, and nothing is saved or sent.</div>
          </section>
        </aside>
      </div>
    </>
  )
}
