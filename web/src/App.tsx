import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Audit, Payments, Plans, Releases, Team } from './pages/Lists'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { Onboard } from './pages/Onboard'
import { ResetPin } from './pages/ResetPin'
import { ShopDetail } from './pages/ShopDetail'
import { Shops } from './pages/Shops'
import { WhatsApp } from './pages/WhatsApp'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-pin" element={<ResetPin />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="onboard" element={<Onboard />} />
        <Route path="shops" element={<Shops />} />
        <Route path="shops/:id" element={<ShopDetail />} />
        <Route path="plans" element={<Plans />} />
        <Route path="whatsapp" element={<WhatsApp />} />
        <Route path="releases" element={<Releases />} />
        <Route path="payments" element={<Payments />} />
        <Route path="team" element={<Team />} />
        <Route path="audit" element={<Audit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
