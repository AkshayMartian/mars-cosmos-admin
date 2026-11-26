import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { can } from './auth'
import { Layout, NoAccess } from './components/Layout'
import { Audit, Payments, Plans, Team } from './pages/Lists'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { Onboard } from './pages/Onboard'
import { ResetPin } from './pages/ResetPin'
import { ShopDetail } from './pages/ShopDetail'
import { Shops } from './pages/Shops'

/** A page only roles with `p` may open (the server refuses their data anyway). */
const Need = ({ p, children }: { p: string; children: ReactNode }) => (can(p) ? <>{children}</> : <NoAccess />)

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-pin" element={<ResetPin />} />
      <Route element={<Layout />}>
        <Route index element={<Need p="dashboard"><Dashboard /></Need>} />
        <Route path="onboard" element={<Need p="onboard"><Onboard /></Need>} />
        <Route path="shops" element={<Need p="shops"><Shops /></Need>} />
        <Route path="shops/:id" element={<Need p="shops"><ShopDetail /></Need>} />
        <Route path="plans" element={<Need p="plans"><Plans /></Need>} />
        <Route path="payments" element={<Need p="payments"><Payments /></Need>} />
        <Route path="team" element={<Need p="team"><Team /></Need>} />
        <Route path="audit" element={<Need p="audit"><Audit /></Need>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
