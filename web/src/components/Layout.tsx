import { NavLink, Outlet } from 'react-router-dom'
import { NAV } from '../nav'

export function Layout() {
  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="14" cy="14" r="10" fill="#E0703F" />
            <ellipse cx="14" cy="14" rx="13" ry="4" fill="none" stroke="#F5F5F4" strokeWidth="1.5" transform="rotate(-20 14 14)" />
          </svg>
          MARS Admin
        </div>
        {NAV.map((n, i) => (
          <div key={n.path} style={{ display: 'contents' }}>
            {i > 0 && NAV[i - 1]!.group !== n.group && <div className="rule" />}
            <NavLink to={n.path} end={n.path === '/'}>{n.label}</NavLink>
          </div>
        ))}
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
