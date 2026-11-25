import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { NAV } from '../nav'
import { currentUser, displayName, signOut } from '../auth'
import { Logo } from '../pages/Login'

/** The signed-in shell. Without a (sample) sign-in the visitor is sent to the sign-in page. */
export function Layout() {
  const nav = useNavigate()
  const user = currentUser()
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand"><Logo />MARS Admin</div>
        {NAV.map((n, i) => (
          <div key={n.path} style={{ display: 'contents' }}>
            {i > 0 && NAV[i - 1]!.group !== n.group && <div className="rule" />}
            <NavLink to={n.path} end={n.path === '/'}>{n.label}</NavLink>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="who">Signed in as<br /><b>{displayName(user)} · Admin</b>
          <button type="button" className="link light" onClick={() => { signOut(); nav('/login') }}>Sign out</button>
        </div>
      </nav>
      <main className="content"><Outlet /></main>
    </div>
  )
}
