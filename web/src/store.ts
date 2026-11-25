import { useSyncExternalStore } from 'react'

/** Sample data for the prototype screens, kept in this browser (localStorage). Replaced by API calls as each server endpoint is built. */
export const DAY = 864e5

export interface Addon { k: string; n: string; d: string; price: number; net: boolean }
export const ADDONS: Addon[] = [
  { k: 'whatsapp_bill', n: 'WhatsApp bill', d: 'Bill sent to the customer automatically after billing', price: 299, net: true },
  { k: 'whatsapp_store', n: 'WhatsApp store', d: 'Catalog with live stock and online orders', price: 799, net: true },
  { k: 'alterations', n: 'Alterations', d: 'Tailor jobs, tags and ready messages', price: 0, net: false },
  { k: 'coins', n: 'Coins (loyalty)', d: 'Customers earn and use coins', price: 0, net: false },
  { k: 'serial', n: 'Serial-number stock', d: 'Unique code on every piece', price: 199, net: false },
  { k: 'extra_counter', n: 'Extra counter', d: 'One more billing PC in the same shop', price: 167, net: false }
]
export interface Plan { k: string; n: string; year: number; counters: number; inc: string[] }
export const PLANS: Plan[] = [
  { k: 'basic', n: 'Basic', year: 4999, counters: 1, inc: ['alterations'] },
  { k: 'smart', n: 'Smart', year: 7999, counters: 1, inc: ['alterations', 'coins'] },
  { k: 'pro', n: 'Pro', year: 11999, counters: 2, inc: ['alterations', 'coins', 'serial'] }
]
export const addonName = (k: string): string => ADDONS.find((a) => a.k === k)?.n ?? k
export const planOf = (s: { plan: string }): Plan => PLANS.find((p) => p.k === s.plan) ?? PLANS[0]!

export interface Device { id: string; pc: string; counter: string; ver: string; seen: number; activated: number }
export interface Shop {
  id: string; name: string; owner: string; mobile: string; email: string; city: string; gstin: string; plan: string
  status: 'active' | 'trial' | 'suspended'; start: number; expiry: number; addons: string[]
  wa: { status: 'none' | 'pending' | 'live'; number?: string; bsp?: string; used?: number; limit?: number }
  devices: Device[]; key: { code: string; created: number; used: boolean; expires: number }; notes: Array<{ at: number; by: string; text: string }>
}
export interface State {
  v: 2; shops: Shop[]
  templates: Array<{ id: string; name: string; cat: string; status: 'Approved' | 'Pending' | 'Rejected'; body: string }>
  logs: Array<{ at: number; shop: string; to: string; cust: string; tpl: string; status: string }>
  releases: Array<{ v: string; date: number; notes: string; rollout: string }>
  team: Array<{ id: string; name: string; email: string; role: 'Admin' | 'Support' | 'Sales'; active: boolean }>
  invoices: Array<{ id: string; no: string; shop: string; amount: number; date: number; due: number; paid: boolean }>
  audit: Array<{ at: number; by: string; action: string; shop: string | null; details: string }>
}

let seq = 1
export const uid = (p: string): string => p + Date.now().toString(36) + seq++
export function newKey(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const g = () => Array.from({ length: 4 }, () => a[Math.floor(Math.random() * a.length)]).join('')
  return `MARS-${g()}-${g()}-${g()}`
}

function seed(): State {
  const T = Date.now()
  const dev = (pc: string, counter: string, ver: string, seenAgoH: number): Device => ({ id: uid('d'), pc, counter, ver, seen: T - seenAgoH * 36e5, activated: T - 40 * DAY })
  const shop = (id: string, name: string, owner: string, mobile: string, city: string, gstin: string, plan: string, status: Shop['status'], startAgo: number, expIn: number, addons: string[], wa: Shop['wa'], devices: Device[]): Shop =>
    ({ id, name, owner, mobile, email: '', city, gstin, plan, status, start: T - startAgo * DAY, expiry: T + expIn * DAY, addons, wa, devices, key: { code: newKey(), created: T - startAgo * DAY, used: devices.length > 0, expires: T - startAgo * DAY + 7 * DAY }, notes: [] })
  const shops = [
    shop('sh1', 'Raj Fashion', 'Raj Patel', '98250 00010', 'Ahmedabad', '24AAAAA1111A1Z5', 'smart', 'active', 20, 345, ['alterations', 'coins', 'serial', 'whatsapp_bill'], { status: 'live', number: '+91 98250 00010', bsp: 'Gupshup', used: 418, limit: 1000 }, [dev('SHOP-PC-1', 'C1', '1.0.2', 0.2)]),
    shop('sh2', 'Trendz Men’s Wear', 'Kunal Shah', '97250 22114', 'Surat', '24BBBBB2222B1Z1', 'smart', 'trial', 5, 9, ['alterations', 'coins'], { status: 'none' }, [dev('TRENDZ-PC', 'C1', '1.0.2', 3)]),
    shop('sh3', 'Urban Threads', 'Meera Joshi', '99090 33445', 'Rajkot', '24CCCCC3333C1Z2', 'pro', 'active', 120, 245, ['alterations', 'coins', 'serial', 'extra_counter', 'whatsapp_bill', 'whatsapp_store'], { status: 'pending', number: '+91 99090 33445', bsp: 'Gupshup', used: 0, limit: 1000 }, [dev('URBAN-C1', 'C1', '1.0.1', 220), dev('URBAN-C2', 'C2', '1.0.1', 230)]),
    shop('sh4', 'Sai Watch Centre', 'Sai Kumar', '98980 55667', 'Vadodara', '', 'basic', 'active', 200, 24, ['alterations'], { status: 'none' }, [dev('SAI-PC', 'C1', '1.0.0', 30)]),
    shop('sh5', 'Kapadia Sarees', 'Nisha Kapadia', '97120 88990', 'Ahmedabad', '24DDDDD4444D1Z3', 'smart', 'active', 380, -15, ['alterations', 'coins'], { status: 'none' }, [dev('KAPADIA-PC', 'C1', '1.0.0', 400)]),
    shop('sh6', 'Step Up Footwear', 'Nikhil Rao', '99250 11220', 'Anand', '', 'basic', 'suspended', 90, 275, ['alterations'], { status: 'none' }, []),
    shop('sh7', 'Gentry Menswear', 'Arjun Mehta', '98790 66554', 'Ahmedabad', '24EEEEE5555E1Z4', 'smart', 'active', 1, 364, ['alterations', 'coins'], { status: 'none' }, [])
  ]
  shops[0]!.notes = [{ at: T - 3 * DAY, by: 'Arif', text: 'Printer set to 80 mm. Trained 3 staff.' }, { at: T - 20 * DAY, by: 'Akshay Mistry', text: 'Pilot shop. Installed with USB backup to drive E:.' }]
  const names = ['Rahul S.', 'Neha P.', 'Amit D.', 'Priya K.', 'Vikas M.']
  const st = ['Delivered', 'Delivered', 'Read', 'Delivered', 'Failed']
  return {
    v: 2, shops,
    templates: [
      { id: 't1', name: 'bill_ready', cat: 'Utility', status: 'Approved', body: 'Hi {{1}}, thank you for shopping at {{2}}. Your bill {{3}} for ₹{{4}} is attached.' },
      { id: 't2', name: 'alteration_ready', cat: 'Utility', status: 'Approved', body: 'Hi {{1}}, your {{2}} ({{3}}) is ready for pickup at {{4}}.' },
      { id: 't3', name: 'birthday_offer', cat: 'Marketing', status: 'Pending', body: 'Happy birthday {{1}}! Enjoy {{2}} at {{3}} till {{4}}.' },
      { id: 't4', name: 'new_arrivals', cat: 'Marketing', status: 'Rejected', body: 'New collection at {{1}}! Visit today.' }
    ],
    logs: Array.from({ length: 14 }, (_, i) => ({ at: T - i * 47 * 6e4, shop: 'sh1', to: 'xxxxx' + String(10 + i * 7).slice(-3), cust: names[i % 5]!, tpl: i % 6 === 3 ? 'alteration_ready' : 'bill_ready', status: st[i % 5]! })),
    releases: [
      { v: '1.0.2', date: T - 6 * DAY, notes: 'Billing salesperson default, faster stock search', rollout: 'All shops' },
      { v: '1.0.1', date: T - 21 * DAY, notes: 'Backup restore fix, sticker preview', rollout: 'All shops' },
      { v: '1.0.0', date: T - 45 * DAY, notes: 'First release: offline billing, stock, customers, reports', rollout: 'All shops' }
    ],
    team: [
      { id: 'u1', name: 'Akshay Mistry', email: 'akshay@marstechnolabs.com', role: 'Admin', active: true },
      { id: 'u2', name: 'Arif', email: 'arif@marstechnolabs.com', role: 'Support', active: true },
      { id: 'u3', name: 'Sales desk', email: 'sales@marstechnolabs.com', role: 'Sales', active: true }
    ],
    invoices: shops.map((s, i) => ({ id: uid('inv'), no: 'MT/26-27/' + String(i + 11).padStart(4, '0'), shop: s.id, amount: planOf(s).year, date: s.start, due: s.start + 15 * DAY, paid: s.status !== 'trial' && s.id !== 'sh5' })),
    audit: [
      { at: T - 2 * 36e5, by: 'Akshay Mistry', action: 'Add-on on', shop: 'sh1', details: 'WhatsApp bill' },
      { at: T - DAY, by: 'Arif', action: 'Released PC', shop: 'sh3', details: 'URBAN-OLD' },
      { at: T - 3 * DAY, by: 'Akshay Mistry', action: 'Shop suspended', shop: 'sh6', details: 'Payment pending 60 days' },
      { at: T - 5 * DAY, by: 'Sales desk', action: 'Shop created', shop: 'sh2', details: 'Trial 14 days' }
    ]
  }
}

const KEY = 'mars-admin-proto-v2'
let state: State = (() => {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as State | null; if (s?.v === 2) return s } catch { /* blocked or corrupt: start from the sample */ }
  return seed()
})()
const listeners = new Set<() => void>()

/** Change the sample data: mutate `s` inside `fn`. Saves to this browser and re-renders. */
export function update(fn: (s: State) => void): void {
  state = structuredClone(state)
  fn(state)
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage blocked: still works until reload */ }
  listeners.forEach((l) => l())
}
export const useStore = (): State => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => state)

export const addAudit = (s: State, by: string, action: string, shop: string | null, details: string): void => { s.audit.unshift({ at: Date.now(), by, action, shop, details }) }

export const lastSeen = (s: Shop): number | null => (s.devices.length ? Math.max(...s.devices.map((d) => d.seen)) : null)
export type Tone = 'good' | 'warn' | 'bad' | 'blue' | 'grey'
export function statusOf(s: Shop): [string, Tone] {
  const now = Date.now()
  if (s.status === 'suspended') return ['Suspended', 'bad']
  if (s.expiry < now) return ['Expired', 'bad']
  if (s.status === 'trial') return ['Trial', 'blue']
  if (s.expiry - now < 30 * DAY) return ['Expiring', 'warn']
  return ['Active', 'good']
}

export const inr = (n: number): string => '₹' + Number(n).toLocaleString('en-IN')
export const dOnly = (t: number): string => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
export const dt = (t: number): string => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
export function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 6e4)
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 60)
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago'
}
