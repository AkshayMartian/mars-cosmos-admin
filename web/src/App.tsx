import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { NAV } from './nav'
import { Dashboard } from './pages/Dashboard'
import { Placeholder } from './pages/Placeholder'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        {NAV.filter((n) => n.path !== '/').map((n) => (
          <Route key={n.path} path={n.path} element={<Placeholder title={n.label} blurb={n.blurb} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
