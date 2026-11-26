import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, get, post } from '../api'
import { PasswordInput } from '../components/ui'

const EASY = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '1212'])

/** The page the owner's emailed link opens (/reset-pin?token=...). Public: no staff sign-in. The server checks the link and keeps only the PIN's hash. */
export function ResetPin() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [view, setView] = useState<'checking' | 'form' | 'done' | 'expired'>('checking')
  const [shop, setShop] = useState('')
  const [minutes, setMinutes] = useState(15)
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const d = (v: string) => v.replace(/\D/g, '').slice(0, 4)
  const [seen1, setSeen1] = useState(false)
  const four = p1.length === 4
  const easy = four && (EASY.has(p1) || /^(\d)\1+$/.test(p1))
  const same = four && p1 === p2
  const m1 = easy ? 'Not an easy PIN like 1111, 1234 or 0000. Choose another.' : seen1 && p1.length < 4 ? (p1 ? `The PIN needs 4 digits (${p1.length} so far).` : 'Enter a 4-digit PIN.') : ''
  const m2 = p2 && (p2 !== p1.slice(0, p2.length) || (p2.length === 4 && p2 !== p1)) ? 'The two PINs do not match.' : ''
  const ok = (on: boolean) => ({ color: on ? '#15803D' : undefined, fontWeight: on ? 600 : undefined })

  // is the link good, unused and not expired? (no token at all is the same as a dead link)
  useEffect(() => {
    if (!token) return setView('expired')
    get<{ shop: string; minutesLeft: number }>('/v1/pin-reset/validate?token=' + encodeURIComponent(token)).then(
      (r) => { setShop(r.shop); setMinutes(r.minutesLeft); setView('form') },
      (e) => { if (e instanceof ApiError && e.status === 0) { setError(e.message); setView('form') } else setView('expired') }
    )
  }, [token])

  const save = async () => {
    if (p1.length !== 4) return setError('Exactly 4 digits.')
    if (EASY.has(p1)) return setError('Not an easy PIN like 1111, 1234 or 0000.')
    if (p1 !== p2) return setError('The two PINs do not match.')
    setBusy(true); setError('')
    try {
      await post('/v1/pin-reset/complete', { token, pin: p1 })
      setP1(''); setP2(''); setView('done')
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) setView('expired')
      else setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="login">
      <div className="lcard">
        <div className="logo" style={{ fontSize: 18 }}><i />MARS Cosmos</div>
        {view === 'checking' && <p className="muted" role="status">Checking your link…</p>}
        {view === 'form' && (
          <form className="stackv" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <div className="muted">{shop ? `${shop} · Owner` : 'Owner'}</div>
            <h1>Choose a new PIN</h1>
            <div className="muted">This link works once and expires in {minutes} {minutes === 1 ? 'minute' : 'minutes'}.</div>
            <div className="f"><label htmlFor="p1">New PIN (4 digits)</label><PasswordInput id="p1" inputMode="numeric" value={p1} onChange={(e) => { setP1(d(e.target.value)); setError('') }} onBlur={() => setSeen1(true)} aria-invalid={!!m1} autoFocus />{m1 && <div className="err" role="alert">{m1}</div>}</div>
            <div className="f"><label htmlFor="p2">Confirm new PIN</label><PasswordInput id="p2" inputMode="numeric" value={p2} onChange={(e) => { setP2(d(e.target.value)); setError('') }} aria-invalid={!!m2} />{m2 && <div className="err" role="alert">{m2}</div>}</div>
            {error ? <div className="err" role="alert">{error}</div> : <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}><li style={ok(four)}>4 digits, numbers only</li><li style={ok(four && !easy)}>Not an easy PIN (1111, 1234, 0000...)</li><li style={ok(same)}>Both PINs match</li></ul>}
            <button className="btn p wide" type="submit" disabled={busy || !four || easy || !same}>{busy ? 'Saving…' : 'Save new PIN'}</button>
            <div className="hint">Not you? Close this page. Nothing changes until a PIN is saved.</div>
          </form>
        )}
        {view === 'done' && (
          <div className="stackv">
            <h1>PIN saved</h1>
            <p style={{ margin: 0 }}>Go back to Mars Cosmos on your shop PC. It picks up the new PIN in a few seconds. Then log in with it.</p>
            <div className="hint">We also sent you an email to confirm the change. If this was not you, call MARS support right away.</div>
          </div>
        )}
        {view === 'expired' && (
          <div className="stackv">
            <h1>This link has expired</h1>
            <p style={{ margin: 0 }}>A reset link works once and for 15 minutes. It may already have been used, or it is too old.</p>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>Open Mars Cosmos on your shop PC.</li>
              <li>Choose the Owner and tap Forgot PIN.</li>
              <li>Open the new email and use the new link.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
