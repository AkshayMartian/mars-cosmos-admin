import { useState } from 'react'
import { Logo } from './Login'

const EASY = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '1212'])

/** The page the owner's emailed link opens. Public (no staff sign-in). Sample mode: the token is not checked yet; /expired previews the dead-link state. */
export function ResetPin() {
  const [view, setView] = useState<'form' | 'done' | 'expired'>('form')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState('')
  const d = (v: string) => v.replace(/\D/g, '').slice(0, 4)

  const save = () => {
    if (p1.length !== 4) return setError('Exactly 4 digits.')
    if (EASY.has(p1)) return setError('Not an easy PIN like 1111, 1234 or 0000.')
    if (p1 !== p2) return setError('The two PINs do not match.')
    setError(''); setView('done')
  }

  return (
    <div className="reset">
      <div className="reset-card stack">
        <div className="brand dark"><Logo />MARS Cosmos</div>
        {view === 'form' && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
            <div className="muted">Raj Fashion · Owner</div>
            <h1>Choose a new PIN</h1>
            <div className="sub">This link works once and expires in 14 minutes.</div>
            <div className="field"><label htmlFor="p1">New PIN (4 digits)</label><input id="p1" type="password" inputMode="numeric" className="otp" value={p1} onChange={(e) => setP1(d(e.target.value))} autoFocus /></div>
            <div className="field"><label htmlFor="p2">Confirm new PIN</label><input id="p2" type="password" inputMode="numeric" className="otp" value={p2} onChange={(e) => setP2(d(e.target.value))} /></div>
            {error ? <div className="err" role="alert">{error}</div> : <div className="hint">Exactly 4 digits. Not an easy PIN like 1111, 1234 or 0000.</div>}
            <button className="btn primary wide big" type="submit">Save new PIN</button>
            <div className="small muted">Not you? Close this page. Nothing changes until a PIN is saved.</div>
            <button type="button" className="link" onClick={() => setView('expired')}>Preview: what an expired link shows</button>
          </form>
        )}
        {view === 'done' && (
          <div className="stack center">
            <div className="bigmark ok">✓</div>
            <h1>PIN saved</h1>
            <p>Go back to Mars Cosmos on your shop PC. It picks up the new PIN in a few seconds. Then log in with it.</p>
            <div className="small muted">We also sent you an email to confirm the change. If this was not you, call MARS support right away.</div>
            <button type="button" className="link" onClick={() => { setView('form'); setP1(''); setP2('') }}>Back to the form</button>
          </div>
        )}
        {view === 'expired' && (
          <div className="stack center">
            <div className="bigmark warn">!</div>
            <h1>This link has expired</h1>
            <p>A reset link works once and for 15 minutes. It may already have been used, or it is too old.</p>
            <ol className="next left">
              <li>Open Mars Cosmos on your shop PC.</li>
              <li>Choose the Owner and tap Forgot PIN.</li>
              <li>Open the new email and use the new link.</li>
            </ol>
            <button type="button" className="link" onClick={() => setView('form')}>Back to the form</button>
          </div>
        )}
      </div>
    </div>
  )
}
