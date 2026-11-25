import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field } from '../components/ui'
import { signIn } from '../auth'

/** Sample sign-in: the two steps of the design (password, then a 6-digit code). Real staff accounts and the code come with the server. */
export function Login() {
  const nav = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const next = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setError('Type your MARS staff email.')
    if (password.length < 8) return setError('Type your password.')
    setError(''); setStep(2)
  }
  const finish = () => {
    if (code.length !== 6) return setError('Type the 6-digit code.')
    signIn(email); nav('/', { replace: true })
  }

  return (
    <div className="login">
      <section className="login-brand" aria-label="MARS">
        <div className="brand big"><Logo size={36} />MARS Admin</div>
        <div className="stack">
          <h2>Onboard shops. Keep every licence in order.</h2>
          <p>Create shops, send activation keys, renew licences, release PCs and watch PIN resets, in one place.</p>
        </div>
        <div className="small light">For MARS staff only. Every action is written to the audit log.</div>
      </section>
      <main className="login-form">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (step === 1) next(); else finish() }}>
          {step === 1 ? (
            <>
              <div><h1>Sign in</h1><div className="sub">Use your MARS staff account.</div></div>
              <Field label="Email" id="em"><input id="em" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Password" id="pw"><input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              {error && <div className="err" role="alert">{error}</div>}
              <button className="btn primary wide big" type="submit">Continue</button>
              <button type="button" className="link" onClick={() => setError('Ask another admin to reset your password. Self-service reset comes with the server.')}>Forgot password?</button>
            </>
          ) : (
            <>
              <div><h1>Check your phone</h1><div className="sub">We sent a 6-digit code to your registered mobile. It works for 5 minutes.</div></div>
              <Field label="Code" id="otp"><input id="otp" className="otp" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus /></Field>
              {error && <div className="err" role="alert">{error}</div>}
              <button className="btn primary wide big" type="submit">Sign in</button>
              <button type="button" className="link" onClick={() => { setStep(1); setCode(''); setError('') }}>Use a different account</button>
            </>
          )}
          <div className="small muted rule-top">After 5 wrong attempts the account is locked for 15 minutes. Sample mode: any account and any 6-digit code signs in.</div>
        </form>
      </main>
    </div>
  )
}

export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="10" fill="#E0703F" />
    <ellipse cx="14" cy="14" rx="13" ry="4" fill="none" stroke="#F5F5F4" strokeWidth="1.5" transform="rotate(-20 14 14)" />
  </svg>
)
