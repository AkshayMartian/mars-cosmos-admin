import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { makeSessionToken } from '../src/routes/admin.js'
import { fakeDatabase } from './fakedb.js'

process.env['NODE_ENV'] = 'test'
const DAY = 86_400_000
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10)

async function setup() {
  const database = fakeDatabase()
  const app = await buildApp(loadConfig({ OTP_SECRET: 'test-secret' }), database, { signer: null })
  const cookie = 'mars_admin=' + makeSessionToken('test-secret', { email: 'staff@example.com', name: 'Staff', role: 'Admin' })
  const now = Date.now()
  const shop = (tenantId: string, name: string, status: string, plan = 'smart') => database.c('shops').insertOne({ tenantId, name, status, plan, createdAt: new Date() })
  await shop('t1', 'Fresh Shop', 'active', 'pro')
  await shop('t2', 'Renew Shop', 'active', 'basic')
  await shop('t3', 'Waiting Shop', 'pending')
  await shop('t4', 'Old Shop', 'active')
  await shop('t5', 'Stopped Shop', 'suspended')
  for (const [t, m] of [['t1', '9800000001'], ['t2', '9800000002'], ['t4', '9800000004']]) await database.c('owners').insertOne({ tenantId: t, mobile: m })
  const key = (tenantId: string, expires: number) => database.c('activation_keys').insertOne({ key: 'K-' + tenantId, tenantId, status: 'activated', licenceExpires: ymd(expires) })
  await key('t1', now + 300 * DAY); await key('t2', now + 10 * DAY); await key('t4', now - 2 * DAY)
  await database.c('devices').insertOne({ tenantId: 't1', machineId: 'A', lastCheckAt: new Date(now - 9 * DAY) })
  await database.c('devices').insertOne({ tenantId: 't2', machineId: 'B', lastCheckAt: new Date(now - DAY) })
  await database.c('devices').insertOne({ tenantId: 't2', machineId: 'C', lastCheckAt: new Date(now - 30 * DAY), releasedAt: new Date() })
  await database.c('audit_log').insertOne({ tenantId: 't3', action: 'shop_onboarded', at: new Date(now - DAY), by: 'Akshay', details: { shop: 'Waiting Shop', plan: 'smart' } })
  await database.c('audit_log').insertOne({ tenantId: 't1', action: 'licence_activated', at: new Date(now - 3600_000), details: { key: 'MARS-ABCD-••••-••••' } })
  return { app, cookie }
}

describe('dashboard', () => {
  it('needs a signed-in staff member', async () => {
    const { app } = await setup()
    expect((await app.inject({ method: 'GET', url: '/v1/admin/dashboard' })).statusCode).toBe(401)
  })

  it('computes the figures from the database', async () => {
    const { app, cookie } = await setup()
    const r = await app.inject({ method: 'GET', url: '/v1/admin/dashboard', headers: { cookie } })
    expect(r.statusCode).toBe(200)
    const d = r.json()
    expect(d).toMatchObject({ total: 5, active: 2, pending: 1, suspended: 1, expired: 1 })
    expect(d.yearValue).toBe(4999 + 11999) // basic + pro at the default prices
    expect(d.renewSoon).toEqual([expect.objectContaining({ tenantId: 't2', name: 'Renew Shop', plan: 'Basic' })])
    expect(d.renewSoon[0].daysLeft).toBeGreaterThanOrEqual(10)
    // only Fresh Shop: Renew Shop's old PC was released, its current one checked in yesterday
    expect(d.offline).toEqual([expect.objectContaining({ tenantId: 't1', name: 'Fresh Shop', mobile: '9800000001' })])
    expect(d.recent[0]).toMatchObject({ action: 'Licence activated', shop: 'Fresh Shop', by: 'Shop', details: 'MARS-ABCD-••••-••••' })
    expect(d.recent[1]).toMatchObject({ action: 'Shop created', shop: 'Waiting Shop', by: 'Akshay', details: 'smart' })
  })
})

describe('shops list', () => {
  it('needs a signed-in staff member', async () => {
    const { app } = await setup()
    expect((await app.inject({ method: 'GET', url: '/v1/admin/shops' })).statusCode).toBe(401)
  })

  it('lists every shop with owner, expiry, last contact and status', async () => {
    const { app, cookie } = await setup()
    const r = await app.inject({ method: 'GET', url: '/v1/admin/shops', headers: { cookie } })
    expect(r.statusCode).toBe(200)
    const by = Object.fromEntries(r.json().shops.map((s: any) => [s.tenantId, s]))
    expect(Object.keys(by).sort()).toEqual(['t1', 't2', 't3', 't4', 't5'])
    expect(by.t1).toMatchObject({ name: 'Fresh Shop', mobile: '9800000001', plan: 'pro', status: 'Active', offline: true, pcs: 1 })
    expect(by.t2).toMatchObject({ status: 'Expiring', offline: false, pcs: 1 })
    expect(by.t3).toMatchObject({ status: 'Waiting', expires: null, lastSeen: null })
    expect(by.t4.status).toBe('Expired')
    expect(by.t5.status).toBe('Suspended')
  })
})

describe('plans', () => {
  it('starts with the default plans and lets an Admin change a price, which the dashboard uses', async () => {
    const { app, cookie } = await setup()
    const list = await app.inject({ method: 'GET', url: '/v1/admin/plans', headers: { cookie } })
    expect(list.json().plans.map((p: any) => [p.key, p.yearPrice])).toEqual([['basic', 4999], ['smart', 7999], ['pro', 11999]])
    const put = await app.inject({ method: 'PUT', url: '/v1/admin/plans/pro', headers: { cookie }, payload: { yearPrice: 15000 } })
    expect(put.statusCode).toBe(200)
    const d = (await app.inject({ method: 'GET', url: '/v1/admin/dashboard', headers: { cookie } })).json()
    expect(d.yearValue).toBe(4999 + 15000)
    expect(d.recent[0]).toMatchObject({ action: 'Plan changed', by: 'Staff', details: 'Pro · yearPrice: 11999 → 15000' })
  })

  it('refuses price changes from non-Admin staff and bad values', async () => {
    const { app, cookie } = await setup()
    const support = 'mars_admin=' + makeSessionToken('test-secret', { email: 's@example.com', name: 'Sup', role: 'Support' })
    expect((await app.inject({ method: 'PUT', url: '/v1/admin/plans/pro', headers: { cookie: support }, payload: { yearPrice: 1 } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PUT', url: '/v1/admin/plans/pro', headers: { cookie }, payload: { yearPrice: -5 } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PUT', url: '/v1/admin/plans/nope', headers: { cookie }, payload: { yearPrice: 5 } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/v1/admin/plans' })).statusCode).toBe(401)
  })
})
