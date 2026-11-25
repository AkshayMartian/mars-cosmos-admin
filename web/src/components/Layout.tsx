import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ApiError, get, post } from '../api'
import { signIn, signOut, type Session } from '../auth'
import { Toast } from './ui'

const MENU: Array<[string, string, boolean?] | 'hr'> = [
  ['/', 'Dashboard'], ['/shops', 'Shops'], ['/onboard', 'Onboard a shop'], ['/plans', 'Plans & add-ons'], ['/whatsapp', 'WhatsApp'], 'hr',
  ['/releases', 'App releases'], ['/payments', 'Payments', true], 'hr', ['/team', 'Team'], ['/audit', 'Audit log']
]

/** The signed-in shell. Without a (sample) sign-in the visitor is sent to the sign-in page. */
export function Layout() {
  const nav = useNavigate()
  const [user, setUser] = useState<Session | null>(null)
  const [down, setDown] = useState(false)
  // the server holds the session (httpOnly cookie): ask who is signed in; no session sends the visitor to the sign-in page
  useEffect(() => {
    get<Session>('/v1/admin/me').then((s) => { signIn(s); setUser(s) }, (e) => { if (e instanceof ApiError && e.status === 401) { signOut(); nav('/login', { replace: true }) } else setDown(true) })
  }, [nav])
  if (down) return <div className="login"><div className="lcard"><h1>Server not reachable</h1><p className="muted" style={{ margin: 0 }}>Check that the MARS server is running, then reload.</p></div></div>
  if (!user) return null
  return (
    <>
      <header className="top">
        <span className="logo"><i />MARS Admin</span><span className="sub">MARS Technolabs · shops on MARS POS</span><span className="sp" />
        <span style={{ textAlign: 'right', fontSize: 13, lineHeight: 1.2 }}>{user.name}<br /><span className="sub">{user.role}</span></span>
        <button type="button" className="btn-top" onClick={() => { void post('/v1/admin/logout', {}).finally(() => { signOut(); nav('/login') }) }}>Sign out</button>
      </header>
      <div className="body">
        <nav className="menu" aria-label="Main menu">
          {MENU.map((m, i) => m === 'hr' ? <hr key={i} /> : <NavLink key={m[0]} to={m[0]} end={m[0] === '/'} className={({ isActive }) => (isActive ? 'active' : '')}><span>{m[1]}</span>{m[2] && <span className="later">later</span>}</NavLink>)}
        </nav>
        <main className="work"><Outlet /></main>
      </div>
      <Toast />
    </>
  )
}
