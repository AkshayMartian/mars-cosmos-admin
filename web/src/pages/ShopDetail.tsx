import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, get, post } from '../api'
import { Chip, copyText, Modal, toast } from '../components/ui'
import { ago, dOnly, dt, type Tone } from '../store'

type ShopStatus = 'Active' | 'Expiring' | 'Expired' | 'Suspended' | 'Waiting'
type KeyStatus = 'Waiting' | 'Activated' | 'Expired' | 'Cancelled'
interface KeyRow {
  key: string; status: KeyStatus; issuedAt: string; expiresAt: string | null; activatedAt: string | null; machineId: string | null
  licenceDays: number | null; licenceExpires: string | null; emailed: 'sent' | 'failed' | null
}
interface Shop {
  tenantId: string; name: string; status: ShopStatus; planName: string; expires: string | null
  contactNumber: string; gstin: string | null; description: string | null
  address: { line: string; city: string; state: string; pincode: string }; mode: string; counters: number; createdAt: string | null
  owner: { fullName: string; mobile: string; email: string } | null
  canManageKeys: boolean; keys: KeyRow[]
  devices: Array<{ machineId: string; activatedAt: string; lastCheckAt: string | null; released: boolean }>
}

const SHOP_TONE: Record<ShopStatus, Tone> = { Active: 'good', Expiring: 'warn', Expired: 'bad', Suspended: 'bad', Waiting: 'blue' }
const SHOP_LABEL: Record<ShopStatus, string> = { Active: 'Active', Expiring: 'Expiring', Expired: 'Expired', Suspended: 'Suspended', Waiting: 'Waiting for activation' }
const KEY_TONE: Record<KeyStatus, Tone> = { Waiting: 'blue', Activated: 'good', Expired: 'grey', Cancelled: 'grey' }
const KEY_LABEL: Record<KeyStatus, string> = { Waiting: 'Not used yet', Activated: 'Activated', Expired: 'Expired unused', Cancelled: 'Cancelled' }
const phone = (m: string): string => (m.length === 10 ? `${m.slice(0, 5)} ${m.slice(5)}` : m)
const short = (id: string): string => (id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id)
const day = (iso: string | null): string => (iso ? dOnly(new Date(iso).getTime()) : '—')

export function ShopDetail() {
  const { id } = useParams()
  const [shop, setShop] = useState<Shop | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  useEffect(() => {
    get<Shop>(`/v1/admin/shops/${encodeURIComponent(id ?? '')}`).then(setShop, (e: Error) => setError(e instanceof ApiError && e.status === 404 ? 'not found' : e.message))
  }, [id])

  if (error === 'not found') return <div className="empty">Shop not found. <Link to="/shops">Back to shops</Link></div>
  if (error) return <div className="empty" role="alert">Could not load the shop: {error}</div>
  if (!shop) return <div className="empty">Loading…</div>

  const current = shop.keys.find((k) => k.status === 'Waiting') ?? shop.keys.find((k) => k.status === 'Activated') ?? shop.keys[0]
  const act = async (path: string, done: (s: Shop & { emailed?: boolean }) => string) => {
    setBusy(true)
    try { const s = await post<Shop & { emailed?: boolean }>(`/v1/admin/shops/${encodeURIComponent(shop.tenantId)}${path}`, {}); setShop(s); toast(done(s)) }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not do that.') } finally { setBusy(false); setConfirmNew(false) }
  }
  const a = shop.address

  return (
    <>
      <div className="head">
        <div><div className="muted"><Link to="/shops">Shops</Link> /</div><h1>{shop.name}</h1>
          <div className="row mid"><Chip tone={SHOP_TONE[shop.status]}>{SHOP_LABEL[shop.status]}</Chip><span className="muted">{shop.planName} plan{shop.expires ? ` · licence until ${day(shop.expires)}` : ''}</span></div></div>
      </div>

      <div className="panel">
        <h2>Activation key</h2>
        {current ? (
          <>
            <div className="row mid">
              <span className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{current.key}</span>
              <Chip tone={KEY_TONE[current.status]}>{KEY_LABEL[current.status]}</Chip>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {current.status === 'Waiting' && <>The owner enters this key and the mobile number {shop.owner ? <b>{phone(shop.owner.mobile)}</b> : 'on file'} in the MARS POS app. Usable until {day(current.expiresAt)}.{' '}
                {current.emailed === 'sent' ? `Emailed to ${shop.owner?.email ?? 'the owner'}.` : current.emailed === 'failed' ? 'The email to the owner failed: send it again or give the key yourself.' : ''}</>}
              {current.status === 'Activated' && <>Activated {day(current.activatedAt)} on PC <span className="mono">{short(current.machineId ?? '')}</span>{current.licenceExpires ? `. Licence until ${day(current.licenceExpires)}.` : '.'}</>}
              {current.status === 'Expired' && <>This key was not used in time. Issue a new key for the owner.</>}
              {current.status === 'Cancelled' && <>This key was cancelled. Issue a new key for the owner.</>}
            </p>
            {shop.canManageKeys ? (
              <div className="row">
                <button type="button" className="btn" onClick={() => copyText(current.key)}>Copy key</button>
                {current.status === 'Waiting' && <button type="button" className="btn" disabled={busy} onClick={() => void act('/key/resend', () => `Key emailed to ${shop.owner?.email ?? 'the owner'}.`)}>Email key to owner again</button>}
                <button type="button" className="btn" disabled={busy || shop.status === 'Suspended'} onClick={() => setConfirmNew(true)}>Issue new key</button>
              </div>
            ) : <p className="muted" style={{ margin: 0 }}>Only Admin and Sales can see the full key.</p>}
          </>
        ) : (
          <>
            <div className="empty">This shop has no activation key.</div>
            {shop.canManageKeys && <div className="row"><button type="button" className="btn p" disabled={busy} onClick={() => setConfirmNew(true)}>Issue a key</button></div>}
          </>
        )}

        {shop.keys.length > 1 && (
          <div className="tw"><table><thead><tr><th>All keys</th><th>Status</th><th>Issued</th><th>Used on</th></tr></thead><tbody>
            {shop.keys.map((k) => <tr key={k.key}><td className="mono">{k.key}</td><td><Chip tone={KEY_TONE[k.status]}>{KEY_LABEL[k.status]}</Chip></td><td>{dt(new Date(k.issuedAt).getTime())}</td>
              <td>{k.activatedAt ? <>{day(k.activatedAt)} · <span className="mono">{short(k.machineId ?? '')}</span></> : <span className="muted">—</span>}</td></tr>)}
          </tbody></table></div>
        )}
      </div>

      <div className="cols">
        <div className="panel"><h2>Owner</h2>
          {shop.owner ? (
            <div className="tw"><table><tbody>
              <tr><th>Name</th><td>{shop.owner.fullName}</td></tr>
              <tr><th>Mobile</th><td className="mono">{phone(shop.owner.mobile)}</td></tr>
              <tr><th>Email</th><td className="mono">{shop.owner.email}</td></tr>
            </tbody></table></div>
          ) : <div className="empty">No owner on file.</div>}
        </div>
        <div className="panel"><h2>Shop</h2>
          <div className="tw"><table><tbody>
            <tr><th>Contact</th><td className="mono">{phone(shop.contactNumber)}</td></tr>
            <tr><th>Address</th><td>{a.line}, {a.city}, {a.state} {a.pincode}</td></tr>
            <tr><th>GST</th><td className="mono">{shop.gstin ?? '—'}</td></tr>
            <tr><th>Backup</th><td>{shop.mode === 'local' ? 'Local-only' : 'Cloud backup'} · {shop.counters} {shop.counters === 1 ? 'counter' : 'counters'}</td></tr>
            <tr><th>Onboarded</th><td>{day(shop.createdAt)}</td></tr>
          </tbody></table></div>
        </div>
      </div>

      <div className="panel"><h2>PCs</h2>
        {shop.devices.length ? (
          <div className="tw"><table><thead><tr><th>PC</th><th>Activated</th><th>Last check-in</th><th>Status</th></tr></thead><tbody>
            {shop.devices.map((d) => <tr key={d.machineId}><td className="mono" title={d.machineId}>{short(d.machineId)}</td><td>{day(d.activatedAt)}</td>
              <td>{d.lastCheckAt ? ago(new Date(d.lastCheckAt).getTime()) : '—'}</td><td><Chip tone={d.released ? 'grey' : 'good'}>{d.released ? 'Released' : 'In use'}</Chip></td></tr>)}
          </tbody></table></div>
        ) : <div className="empty">No PC has been activated yet.</div>}
      </div>

      {confirmNew && (
        <Modal onClose={() => setConfirmNew(false)}>
          <h2>Issue a new activation key?</h2>
          <p style={{ margin: 0 }}>A new key is created and emailed to {shop.owner?.email ?? 'the owner'}. Any unused key is cancelled. A PC already activated keeps working.</p>
          <div className="mfoot"><button type="button" className="btn" onClick={() => setConfirmNew(false)}>Cancel</button>
            <button type="button" className="btn p" disabled={busy} onClick={() => void act('/key/new', (s) => (s.emailed ? 'New key issued and emailed to the owner.' : 'New key issued, but the email failed. Copy it and give it to the owner.'))}>Issue new key</button></div>
        </Modal>
      )}
    </>
  )
}
