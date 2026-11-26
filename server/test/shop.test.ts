import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import type { Messenger } from '../src/lib/messenger.js'
import { makeSessionToken } from '../src/routes/admin.js'
import { fakeDatabase } from './fakedb.js'

process.env['NODE_ENV'] = 'test'
const as = (role: 'Admin' | 'Support' | 'Sales') => 'mars_admin=' + makeSessionToken('test-secret', { email: role.toLowerCase() + '@example.com', name: role + ' Person', role })
const KEY = 'MARS-AB12-CD34-EF56'
const URL = '/v1/admin/shops/tenant-0001'

async function setup(opts: { mailFails?: boolean } = {}) {
  const sent: Array<{ to: string; key: string }> = []
  const messenger = {
    async sendCode() {}, async sendActivationKey() { return {} },
    async sendActivationKeyEmail(to: string, _shop: string, key: string) { if (opts.mailFails) throw new Error('mailbox full'); sent.push({ to, key }); return {} },
    async sendPinResetEmail() {}, async sendPinChangedEmail() {}
  } as unknown as Messenger
  const database = fakeDatabase()
  const app = await buildApp(loadConfig({ OTP_SECRET: 'test-secret' }), database, { signer: null, messenger })
  await database.c('shops').insertOne({ tenantId: 'tenant-0001', name: 'Raj Fashion', status: 'pending', plan: 'smart', contactNumber: '9876500001', address: { line: '1 Road', city: 'Surat', state: 'Gujarat', pincode: '395001' }, createdAt: new Date() })
  await database.c('owners').insertOne({ tenantId: 'tenant-0001', fullName: 'Raj Patel', mobile: '9876500001', email: 'raj@example.com' })
  await database.c('activation_keys').insertOne({ key: KEY, tenantId: 'tenant-0001', mobile: '9876500001', status: 'issued', licenceDays: 365, issuedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 864e5), whatsapp: { status: 'sent' } })
  const call = (method: string, url: string, cookie: string) => app.inject({ method: method as any, url, headers: { cookie } })
  return { database, call, sent }
}

describe('shop page and activation key', () => {
  it('shows the full key to Admin and Sales, a masked one to Support', async () => {
    const { call } = await setup()
    expect((await call('GET', URL, '')).statusCode).toBe(401)
    for (const role of ['Admin', 'Sales'] as const) {
      const d = (await call('GET', URL, as(role))).json()
      expect(d).toMatchObject({ name: 'Raj Fashion', status: 'Waiting', owner: { fullName: 'Raj Patel', email: 'raj@example.com' }, canManageKeys: true })
      expect(d.keys[0]).toMatchObject({ key: KEY, status: 'Waiting', emailed: 'sent' })
    }
    const s = (await call('GET', URL, as('Support'))).json()
    expect(s.keys[0].key).toBe('MARS-AB12-••••-••••')
    expect(s.canManageKeys).toBe(false)
    expect((await call('GET', '/v1/admin/shops/nobody', as('Admin'))).statusCode).toBe(404)
  })

  it('emails the key again (Admin and Sales only)', async () => {
    const { call, sent, database } = await setup()
    expect((await call('POST', URL + '/key/resend', as('Support'))).statusCode).toBe(403)
    expect((await call('POST', URL + '/key/resend', as('Sales'))).statusCode).toBe(200)
    expect(sent).toEqual([{ to: 'raj@example.com', key: KEY }])
    expect(database.c('audit_log').docs.at(-1)).toMatchObject({ action: 'key_emailed', by: 'Sales Person' })
  })

  it('issues a new key: the unused one is cancelled, an activated one is kept', async () => {
    const { call, sent, database } = await setup()
    await database.c('activation_keys').insertOne({ key: 'MARS-OLD1-OLD2-OLD3', tenantId: 'tenant-0001', mobile: '9876500001', status: 'activated', machineId: 'PC-1', issuedAt: new Date(Date.now() - 864e5) })
    const r = await call('POST', URL + '/key/new', as('Admin'))
    expect(r.statusCode).toBe(200)
    const d = r.json()
    expect(d.emailed).toBe(true)
    const byKey = Object.fromEntries(d.keys.map((k: any) => [k.key, k.status]))
    expect(byKey[KEY]).toBe('Cancelled')
    expect(byKey['MARS-OLD1-OLD2-OLD3']).toBe('Activated')
    const fresh = d.keys.find((k: any) => k.status === 'Waiting')
    expect(fresh.key).toMatch(/^MARS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(fresh.key).not.toBe(KEY)
    expect(sent.at(-1)).toEqual({ to: 'raj@example.com', key: fresh.key })
    // the cancelled key can no longer be emailed; the new one can
    expect((await call('POST', URL + '/key/resend', as('Admin'))).statusCode).toBe(200)
    expect(sent.at(-1)!.key).toBe(fresh.key)
  })

  it('keeps the new key when the email fails, and says so', async () => {
    const { call } = await setup({ mailFails: true })
    const d = (await call('POST', URL + '/key/new', as('Admin'))).json()
    expect(d.emailed).toBe(false)
    expect(d.keys.find((k: any) => k.status === 'Waiting').emailed).toBe('failed')
  })
})
