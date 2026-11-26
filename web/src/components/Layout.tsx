import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ApiError, get, post } from '../api'
import { signIn, signOut, type Session } from '../auth'

/** Shown instead of a page the signed-in role may not use. */
export function NoAccess() {
  return <div className="empty" role="alert">Your role cannot open this page. Ask an Admin if you need it.</div>
}
import { Toast } from './ui'

// [path, label, permission needed, "later" badge]
const MENU: Array<[string, string, string, boolean?] | 'hr'> = [
  ['/', 'Dashboard', 'dashboard'], ['/shops', 'Shops', 'shops'], ['/onboard', 'Onboard a shop', 'onboard'], ['/plans', 'Plans & add-ons', 'plans'], 'hr',
  ['/payments', 'Payments', 'payments'], 'hr', ['/team', 'Team', 'team'], ['/audit', 'Audit log', 'audit']
]

/** The menu for this member: items their role cannot use are left out, and so are dividers that would end up empty or doubled. */
function menuFor(allowed: string[]): typeof MENU {
  const out: typeof MENU = []
  for (const m of MENU) {
    if (m !== 'hr') { if (allowed.includes(m[2])) out.push(m) } else if (out.length && out[out.length - 1] !== 'hr') out.push(m)
  }
  if (out[out.length - 1] === 'hr') out.pop()
  return out
}

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
          {menuFor(user.can ?? []).map((m, i) => m === 'hr' ? <hr key={i} /> : <NavLink key={m[0]} to={m[0]} end={m[0] === '/'} className={({ isActive }) => (isActive ? 'active' : '')}><span>{m[1]}</span>{m[3] && <span className="later">later</span>}</NavLink>)}
        </nav>
        <main className="work"><Outlet /></main>
      </div>
      <Toast />
    </>
  )
}
