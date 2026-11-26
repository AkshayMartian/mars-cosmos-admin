import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, get, post } from '../api'
import { Chip, copyText, Field, PasswordInput } from '../components/ui'
import { inr, PLANS } from '../store'

const MOBILE_RE = /^[6-9]\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const digits = (v: string, n: number) => v.replace(/\D/g, '').slice(0, n)
const MOBILE_MSG = 'Mobile number: 10 digits starting with 6, 7, 8 or 9.'

/** [GST state code, name] */
const STATES: Array<[string, string]> = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'],
  ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'],
  ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'],
  ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh']
]

type Verify = 'idle' | 'sent' | 'done'

/** One verified contact: type it, press Send code, type the 6-digit code, Verify. The server sends the code and checks it. */
function Verified({ id, label, value, onValue, valid, error, hint, mask, state, setState }: {
  id: 'email'; label: string; value: string; onValue: (v: string) => void; valid: boolean; error?: string | undefined; hint?: string; mask: (v: string) => string
  state: Verify; setState: (s: Verify) => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const run = async (path: string, body: object, ok: () => void) => {
    setBusy(true); setMsg('')
    try { await post(path, body); ok() } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Something went wrong. Try again.') } finally { setBusy(false) }
  }
  return (
    <div className="stackv">
      <Field label={label} id={id} error={error} {...(hint ? { hint } : {})}>
        <div className="row mid">
          <input id={id} type="text" style={{ flex: 1 }} value={value} disabled={state === 'done'} inputMode="email" onChange={(e) => { onValue(mask(e.target.value)); setState('idle'); setMsg('') }} aria-invalid={!!error} />
          {state === 'done' ? <Chip tone="good">✓ Verified</Chip> : <button type="button" className="btn" disabled={!valid || busy} onClick={() => void run('/v1/onboarding/otp', { channel: id, target: value }, () => { setCode(''); setState('sent') })}>{state === 'sent' ? 'Resend code' : 'Send code'}</button>}
        </div>
      </Field>
      {state === 'sent' && (
        <div className="row mid">
          <input aria-label="6-digit code" type="text" className="code" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(digits(e.target.value, 6))} />
          <button type="button" className="btn" disabled={code.length !== 6 || busy} onClick={() => void run('/v1/onboarding/verify', { channel: id, target: value, code }, () => { setState('done'); setCode('') })}>Verify</button>
          <span className="hint">Sent by email.</span>
        </div>
      )}
      {msg && <div className="err" role="alert">{msg}</div>}
    </div>
  )
}

const BLANK = { name: '', mobile: '', email: '', password: '', shop: '', contact: '', desc: '', gst: '', address: '', city: '', state: '24', pin: '', plan: 'smart', backup: 'cloud', counters: '1', days: '365' }

export function Onboard() {
  const [f, setF] = useState(BLANK)
  // plans and prices from the database; the built-in list is only a fallback while it loads or if the server cannot answer
  const [plans, setPlans] = useState(PLANS.map((p) => ({ key: p.k, name: p.n, yearPrice: p.year })))
  useEffect(() => { get<{ plans: Array<{ key: string; name: string; yearPrice: number }> }>('/v1/admin/plans').then((r) => setPlans(r.plans), () => undefined) }, [])
  const [ev, setEv] = useState<Verify>('idle')
  const [created, setCreated] = useState<{ key: string; whatsapp: { status: 'sent' | 'failed'; error?: string }; mobile: string; shop: string } | null>(null)
  const [tried, setTried] = useState(false)
  const [photo, setPhoto] = useState('')
  const [photoErr, setPhotoErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [serverErr, setServerErr] = useState<Record<string, string>>({})
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }))
  const gst = f.gst.toUpperCase()

  const err: Record<string, string | undefined> = {
    name: !f.name.trim() ? 'Type the owner’s full name.' : undefined,
    mobile: f.mobile && !MOBILE_RE.test(f.mobile) ? MOBILE_MSG : undefined,
    email: f.email && !EMAIL_RE.test(f.email) ? 'Type a valid email address.' : undefined,
    password: f.password && !/^[0-9]{4}$/.test(f.password) ? 'Use exactly 4 digits.' : undefined,
    shop: !f.shop.trim() ? 'Type the shop name.' : undefined,
    contact: f.contact && !MOBILE_RE.test(f.contact) ? MOBILE_MSG : undefined,
    gst: gst && !GST_RE.test(gst) ? 'The GST number is not valid. It has 15 characters, like 24AAAAA1111A1Z5.'
      : gst && gst.slice(0, 2) !== f.state ? `The GST number starts with ${gst.slice(0, 2)}, which is not the State chosen below.` : undefined,
    address: !f.address.trim() ? 'Type the shop address.' : undefined,
    city: !f.city.trim() ? 'Type the city.' : undefined,
    pin: f.pin.length !== 6 ? 'Pincode has 6 digits.' : undefined
  }
  const required = ['name', 'mobile', 'email', 'password', 'shop', 'contact', 'address', 'city', 'pin'] as const
  const missing = required.some((k) => !f[k])
  const ready = ev === 'done' && !missing && !Object.values(err).some(Boolean)
  const show = (k: string) => (tried || f[k as keyof typeof f] !== '' ? err[k] : undefined) ?? serverErr[k]

  const pickPhoto = (file: File | undefined) => {
    setPhotoErr('')
    if (!file) return
    if (!/^image\/(jpeg|png)$/.test(file.type)) return setPhotoErr('The photo must be a JPG or PNG.')
    if (file.size > 2 * 1024 * 1024) return setPhotoErr('The photo is larger than 2 MB.')
    const r = new FileReader()
    r.onload = () => setPhoto(String(r.result))
    r.readAsDataURL(file)
  }

  const submit = async () => {
    setTried(true); setFormErr(''); setServerErr({})
    if (!ready) return
    setBusy(true)
    try {
      const r = await post<{ key: string; whatsapp: { status: 'sent' | 'failed'; error?: string } }>('/v1/onboarding/submit', {
        fullName: f.name.trim(), mobile: f.mobile, email: f.email, password: f.password, ...(photo ? { photo } : {}),
        shopName: f.shop.trim(), description: f.desc.trim(), contactNumber: f.contact, gstin: gst, address: f.address.trim(), city: f.city.trim(),
        stateCode: f.state, pincode: f.pin, plan: f.plan, mode: f.backup, counters: Number(f.counters) || 1, days: Number(f.days) || 365
      })
      setCreated({ key: r.key, whatsapp: r.whatsapp, mobile: f.mobile, shop: f.shop.trim() })
    } catch (e) {
      if (e instanceof ApiError) { setFormErr(e.message); setServerErr(e.fields) } else setFormErr('Something went wrong. Try again.')
    } finally { setBusy(false) }
  }

  if (created) {
    return (
      <>
        <div className="head"><div><h1>Onboard a shop</h1><div className="muted">The owner is set up.</div></div></div>
        <section className="panel">
          <h2>{created.whatsapp.status === 'sent' ? 'Shop created. Activation key sent by email.' : 'Shop created. The key could not be emailed.'}</h2>
          <p style={{ margin: 0 }}>
            {created.whatsapp.status === 'sent' ? <>Sent to the owner’s email. </> : <>The mail server said: {created.whatsapp.error}. Give the owner the key below yourself. </>}
            The owner enters it, with the same mobile number, on “Activate this PC” in the app.
          </p>
          <div className="token">{created.key}</div>
          <div className="row"><button type="button" className="btn" onClick={() => copyText(created.key)}>Copy key</button><Link className="btn p" to="/shops">Go to shops</Link>
            <button type="button" className="btn" onClick={() => { setCreated(null); setEv('idle'); setTried(false); setPhoto(''); setF(BLANK) }}>Onboard another</button></div>
        </section>
      </>
    )
  }

  return (
    <>
      <div className="head"><div><h1>Onboard a shop</h1><div className="muted">Fill this with the owner (or send them the link). The email must be verified before the activation key can be created.</div></div></div>
      <div className="onb">
        <div className="stackv">
          <section className="panel">
            <h2>1 · Owner</h2>
            <div className="row mid">
              <div className="avatar" aria-hidden="true" style={photo ? { backgroundImage: `url(${photo})`, color: 'transparent' } : undefined}>{f.name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}</div>
              <div className="stackv" style={{ gap: 6 }}>
                <div className="row mid"><label className="btn sm" htmlFor="photo">{photo ? 'Change photo' : 'Upload profile photo'}</label>
                  <input id="photo" type="file" accept="image/jpeg,image/png" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
                  {photo && <button type="button" className="btn sm" onClick={() => setPhoto('')}>Remove</button>}</div>
                {photoErr || serverErr['photo'] ? <div className="err" role="alert">{photoErr || serverErr['photo']}</div> : <div className="hint">JPG or PNG, up to 2 MB. Optional.</div>}
              </div>
            </div>
            <Field label="Full name *" id="name" error={show('name')}><input id="name" type="text" value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field>
                <Field label="Mobile number *" id="mobile" error={show('mobile')} hint="The owner enters this number in the app along with the key."><input id="mobile" type="text" inputMode="numeric" value={f.mobile} onChange={(e) => set('mobile')(digits(e.target.value, 10))} aria-invalid={!!show('mobile')} /></Field>
            <Verified id="email" label="Email *" value={f.email} onValue={set('email')} mask={(v) => v.trim()} valid={EMAIL_RE.test(f.email)} error={show('email')} hint="This address receives the forgot-PIN link. It is never shown in the app." state={ev} setState={setEv} />
            <Field label="Portal password *" id="password" error={show('password')} hint="A 4-digit PIN (numbers only) for the owner’s portal login."><PasswordInput id="password" inputMode="numeric" maxLength={4} value={f.password} onChange={(e) => set('password')(e.target.value)} /></Field>
          </section>

          <section className="panel">
            <h2>2 · Shop</h2>
            <Field label="Shop name *" id="shop" error={show('shop')}><input id="shop" type="text" value={f.shop} onChange={(e) => set('shop')(e.target.value)} /></Field>
            <Field label="Shop contact number *" id="contact" error={show('contact')} hint={MOBILE_MSG}><input id="contact" type="text" inputMode="numeric" value={f.contact} onChange={(e) => set('contact')(digits(e.target.value, 10))} /></Field>
            <Field label="Shop description" id="desc"><textarea id="desc" rows={3} value={f.desc} onChange={(e) => set('desc')(e.target.value)} /></Field>
            <Field label="GST number" id="gst" error={err['gst'] ?? serverErr['gstin']} hint="Optional. The first two digits are the state code (24 = Gujarat); the State below must match."><input id="gst" type="text" maxLength={15} value={gst} onChange={(e) => set('gst')(e.target.value.replace(/[^0-9a-zA-Z]/g, ''))} /></Field>
          </section>

          <section className="panel">
            <h2>3 · Shop address</h2>
            <Field label="Address *" id="address" error={show('address')}><input id="address" type="text" value={f.address} onChange={(e) => set('address')(e.target.value)} /></Field>
            <div className="grid3">
              <Field label="City *" id="city" error={show('city')}><input id="city" type="text" value={f.city} onChange={(e) => set('city')(e.target.value)} /></Field>
              <Field label="State *" id="state"><select id="state" value={f.state} onChange={(e) => set('state')(e.target.value)}>{STATES.map(([c, n]) => <option key={c} value={c}>{c} {n}</option>)}</select></Field>
              <Field label="Pincode *" id="pin" error={show('pin')}><input id="pin" type="text" inputMode="numeric" value={f.pin} onChange={(e) => set('pin')(digits(e.target.value, 6))} /></Field>
            </div>
          </section>

          <section className="panel">
            <h2>4 · Plan and licence</h2>
            <div className="grid3">
              <Field label="Plan" id="plan"><select id="plan" value={f.plan} onChange={(e) => set('plan')(e.target.value)}>{plans.map((p) => <option key={p.key} value={p.key}>{p.name} · {inr(p.yearPrice)} / year</option>)}</select></Field>
              <Field label="Backup mode" id="backup"><select id="backup" value={f.backup} onChange={(e) => set('backup')(e.target.value)}><option value="cloud">Cloud backup</option><option value="local">Local-only</option></select></Field>
              <Field label="Counters" id="counters"><input id="counters" type="text" inputMode="numeric" value={f.counters} onChange={(e) => set('counters')(digits(e.target.value, 2))} /></Field>
              <Field label="Valid for (days)" id="days"><input id="days" type="text" inputMode="numeric" value={f.days} onChange={(e) => set('days')(digits(e.target.value, 4))} /></Field>
            </div>
          </section>
        </div>

        <aside>
          <section className="panel sticky">
            <h2>Before you submit</h2>
            <ul className="checks">
              <li className={ev === 'done' ? 'yes' : ''}>{ev === 'done' ? '✓' : '•'} Email verified</li>
              {err['gst'] && <li className="err">! GST number needs fixing (optional field)</li>}
              {tried && missing && <li className="err">! Fill in every field marked *</li>}
            </ul>
            <button type="button" className="btn p wide" disabled={ev !== 'done' || busy} onClick={() => void submit()}>{busy ? 'Creating…' : 'Create shop and send key'}</button>
            {formErr && <div className="err" role="alert">{formErr}</div>}
            {ev !== 'done' && <div className="hint">Verify the email first.</div>}
            <h3>What happens next</h3>
            <ol style={{ margin: 0, paddingLeft: 20 }} className="muted">
              <li>The shop and owner are saved. The activation key is created.</li>
              <li>The key is emailed to the owner.</li>
              <li>The owner installs the app and enters the key and the same mobile number.</li>
              <li>The app opens Settings → Shop with these details filled in, ready to edit.</li>
            </ol>
          </section>
        </aside>
      </div>
    </>
  )
}
