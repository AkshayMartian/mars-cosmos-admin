import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, post } from '../api'
import { signIn, type Session } from '../auth'
import { PasswordInput } from "../components/ui"

/** Staff sign-in against admin_users. The server sets the session cookie; the two-step code comes later. */
export function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!email.trim() || !password) return setError('Type your email and PIN.')
    setBusy(true); setError('')
    try {
      const s = await post<Session>('/v1/admin/login', { email: email.trim(), password })
      signIn(s)
      nav('/', { replace: true })
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.') } finally { setBusy(false) }
  }

  return (
    <div className="login">
      <form className="lcard" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div className="logo" style={{ fontSize: 18 }}><i />MARS Admin</div>
        <h1>Sign in</h1>
        <p className="muted" style={{ margin: 0 }}>For the MARS Technolabs team only. Shop owners use the MARS POS app.</p>
        <div className="f"><label htmlFor="em">Email</label><input id="em" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="f"><label htmlFor="pw">PIN</label><PasswordInput id="pw" inputMode="numeric" maxLength={4} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <div className="err" role="alert">{error}</div>}
        <button className="btn p" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
