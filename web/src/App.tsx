import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { Onboard } from './pages/Onboard'
import { ResetPin } from './pages/ResetPin'
import { ShopDetail } from './pages/ShopDetail'
import { ActivationKeys, AdminUsers, AuditLog, Licences, Messages, PinResets, Plans, Shops } from './pages/Lists'

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
        <Route path="activation-keys" element={<ActivationKeys />} />
        <Route path="licences" element={<Licences />} />
        <Route path="pin-resets" element={<PinResets />} />
        <Route path="messages" element={<Messages />} />
        <Route path="plans" element={<Plans />} />
        <Route path="admin-users" element={<AdminUsers />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
