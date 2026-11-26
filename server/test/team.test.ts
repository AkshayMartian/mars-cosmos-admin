import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { makeSessionToken } from '../src/routes/admin.js'
import { hashPassword, verifyPassword } from '../src/lib/secrets.js'
import { fakeDatabase } from './fakedb.js'

process.env['NODE_ENV'] = 'test'
const as = (email: string, name: string, role: 'Admin' | 'Support' | 'Sales') => 'mars_admin=' + makeSessionToken('test-secret', { email, name, role })
const ADMIN = as('boss@example.com', 'Boss', 'Admin')
const SUPPORT = as('help@example.com', 'Helper', 'Support')

async function setup() {
  const database = fakeDatabase()
  const app = await buildApp(loadConfig({ OTP_SECRET: 'test-secret' }), database, { signer: null })
  const users = database.c('admin_users')
  await users.insertOne({ email: 'boss@example.com', name: 'Boss', role: 'Admin', active: true, passwordHash: await hashPassword('boss-password'), createdAt: new Date() })
  await users.insertOne({ email: 'help@example.com', name: 'Helper', role: 'Support', active: true, passwordHash: await hashPassword('help-password'), createdAt: new Date() })
  const call = (method: string, url: string, cookie: string, payload?: unknown) => app.inject({ method: method as any, url, headers: { cookie }, ...(payload ? { payload } : {}) })
  return { app, database, users, call }
}

describe('team', () => {
  it('lists staff from the database without password hashes', async () => {
    const { call } = await setup()
    expect((await call('GET', '/v1/admin/team', '')).statusCode).toBe(401)
    const r = await call('GET', '/v1/admin/team', ADMIN)
    expect(r.statusCode).toBe(200)
    expect(r.json().team.map((u: any) => [u.name, u.role, u.active])).toEqual([['Boss', 'Admin', true], ['Helper', 'Support', true]])
    expect(r.body).not.toContain('passwordHash')
  })

  it('lets an Admin add a member who can then sign in', async () => {
    const { call, app, database } = await setup()
    expect((await call('POST', '/v1/admin/team', SUPPORT, { name: 'X Y', email: 'x@example.com', role: 'Sales', password: 'long-enough' })).statusCode).toBe(403)
    expect((await call('POST', '/v1/admin/team', ADMIN, { name: 'X Y', email: 'x@example.com', role: 'Sales', password: 'short' })).json().error).toContain('8 characters')
    const r = await call('POST', '/v1/admin/team', ADMIN, { name: 'Sales Desk', email: 'Sales@Example.com', role: 'Sales', password: 'long-enough' })
    expect(r.statusCode).toBe(201)
    expect(r.json().team.some((u: any) => u.email === 'sales@example.com' && u.role === 'Sales')).toBe(true)
    expect((await call('POST', '/v1/admin/team', ADMIN, { name: 'Again', email: 'sales@example.com', role: 'Sales', password: 'long-enough' })).statusCode).toBe(409)
    const login = await app.inject({ method: 'POST', url: '/v1/admin/login', payload: { email: 'sales@example.com', password: 'long-enough' } })
    expect(login.statusCode).toBe(200)
    expect(database.c('audit_log').docs.at(-1)).toMatchObject({ action: 'team_member_added', by: 'Boss' })
  })

  it('changes role, switches a member off (blocking sign-in) and resets a password', async () => {
    const { call, app, users } = await setup()
    expect((await call('PUT', '/v1/admin/team/help%40example.com', ADMIN, { role: 'Sales' })).statusCode).toBe(200)
    expect((await call('PUT', '/v1/admin/team/help%40example.com', ADMIN, { active: false })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/v1/admin/login', payload: { email: 'help@example.com', password: 'help-password' } })).statusCode).toBe(401)
    expect((await call('PUT', '/v1/admin/team/help%40example.com', ADMIN, { password: 'new-password-1' })).statusCode).toBe(200)
    const u = users.docs.find((d) => d['email'] === 'help@example.com')!
    expect(u).toMatchObject({ role: 'Sales', active: false })
    expect(await verifyPassword('new-password-1', u['passwordHash'])).toBe(true)
    expect((await call('PUT', '/v1/admin/team/nobody%40example.com', ADMIN, { active: false })).statusCode).toBe(404)
  })

  it('never leaves the team without an active Admin', async () => {
    const { call } = await setup()
    expect((await call('PUT', '/v1/admin/team/boss%40example.com', ADMIN, { active: false })).json().error).toContain('cannot switch off')
    const other = as('other@example.com', 'Other', 'Admin')
    expect((await call('PUT', '/v1/admin/team/boss%40example.com', other, { role: 'Support' })).json().error).toContain('last active Admin')
  })
})

describe('switched-off staff', () => {
  it('lose access at once, even with a session that has not run out', async () => {
    const { call } = await setup()
    expect((await call('GET', '/v1/admin/shops', SUPPORT)).statusCode).toBe(200)
    await call('PUT', '/v1/admin/team/help%40example.com', ADMIN, { active: false })
    const r = await call('GET', '/v1/admin/shops', SUPPORT)
    expect(r.statusCode).toBe(401)
    expect(r.json().error).toContain('switched off')
  })
})

describe('audit log', () => {
  it('pages newest first and searches who, action and shop', async () => {
    const { call, database } = await setup()
    await database.c('shops').insertOne({ tenantId: 't1', name: 'Raj Fashion', status: 'active', plan: 'smart' })
    const log = database.c('audit_log')
    const t0 = Date.now()
    for (let i = 0; i < 60; i++) await log.insertOne({ action: 'pin_reset_email_sent', tenantId: 't1', at: new Date(t0 - i * 60_000), details: { resend: false } })
    await log.insertOne({ action: 'team_member_added', by: 'Boss', at: new Date(t0 + 1000), details: { name: 'Nikita', role: 'Sales' } })

    expect((await call('GET', '/v1/admin/audit', '')).statusCode).toBe(401)
    const first = (await call('GET', '/v1/admin/audit', ADMIN)).json()
    expect(first.entries).toHaveLength(50)
    expect(first.more).toBe(true)
    expect(first.entries[0]).toMatchObject({ action: 'Team member added', by: 'Boss', details: 'Nikita · Sales', shop: null })
    expect(first.entries[1]).toMatchObject({ action: 'PIN reset email sent', by: 'Shop', shop: 'Raj Fashion', details: '' })
    const next = (await call('GET', '/v1/admin/audit?before=' + encodeURIComponent(first.entries[49].at), ADMIN)).json()
    expect(next.entries).toHaveLength(11)
    expect(next.more).toBe(false)

    const s = async (q: string) => (await call('GET', '/v1/admin/audit?q=' + encodeURIComponent(q), ADMIN)).json().entries.length
    expect(await s('nikita')).toBe(1) // details.name
    expect(await s('boss')).toBe(1) // who
    expect(await s('team member')).toBe(1) // action label
    expect(await s('raj')).toBe(50) // shop name (first page)
    expect(await s('.*')).toBe(0) // typed literally, not as a pattern
  })
})

describe('roles', () => {
  const SALES = as('sell@example.com', 'Seller', 'Sales')
  it('let each role use only its own areas', async () => {
    const { call, users } = await setup()
    await users.insertOne({ email: 'sell@example.com', name: 'Seller', role: 'Sales', active: true, passwordHash: 'x', createdAt: new Date() })
    const code = async (method: string, url: string, who: string, body?: unknown) => (await call(method, url, who, body)).statusCode
    for (const who of [ADMIN, SUPPORT, SALES]) {
      expect(await code('GET', '/v1/admin/dashboard', who)).toBe(200)
      expect(await code('GET', '/v1/admin/shops', who)).toBe(200)
      expect(await code('GET', '/v1/admin/plans', who)).toBe(200)
    }
    // team and audit log: Admin only
    for (const url of ['/v1/admin/team', '/v1/admin/audit']) {
      expect(await code('GET', url, ADMIN)).toBe(200)
      expect(await code('GET', url, SUPPORT)).toBe(403)
      expect(await code('GET', url, SALES)).toBe(403)
    }
    // prices: Admin only
    expect(await code('PUT', '/v1/admin/plans/pro', SALES, { yearPrice: 1 })).toBe(403)
    // onboarding: Admin and Sales, not Support
    const otp = { channel: 'email', target: 'owner@example.com' }
    expect(await code('POST', '/v1/onboarding/otp', SUPPORT, otp)).toBe(403)
    expect(await code('POST', '/v1/onboarding/otp', SALES, otp)).not.toBe(403)
  })

  it('use the role stored now, not the one in the session, and tell the web app what it may show', async () => {
    const { call } = await setup()
    // Helper's session says Support; an Admin makes them Sales
    await call('PUT', '/v1/admin/team/help%40example.com', ADMIN, { role: 'Sales' })
    const me = (await call('GET', '/v1/admin/me', SUPPORT)).json()
    expect(me).toMatchObject({ role: 'Sales', name: 'Helper' })
    expect(me.can).toContain('onboard')
    expect(me.can).not.toContain('whatsapp')
    expect((await call('POST', '/v1/onboarding/otp', SUPPORT, { channel: 'email', target: 'o@example.com' })).statusCode).not.toBe(403)
  })
})
