import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { financialYear } from '../src/lib/invoices.js'
import { makeSessionToken } from '../src/routes/admin.js'
import { fakeDatabase } from './fakedb.js'

process.env['NODE_ENV'] = 'test'
const as = (role: 'Admin' | 'Support' | 'Sales') => 'mars_admin=' + makeSessionToken('test-secret', { email: role.toLowerCase() + '@example.com', name: role + ' Person', role })
const ADMIN = as('Admin')

async function setup() {
  const database = fakeDatabase()
  const app = await buildApp(loadConfig({ OTP_SECRET: 'test-secret' }), database, { signer: null })
  await database.c('shops').insertOne({ tenantId: 'tenant-0001', name: 'Raj Fashion', status: 'active', plan: 'smart' })
  const call = (method: string, url: string, cookie: string, payload?: unknown) => app.inject({ method: method as any, url, headers: { cookie }, ...(payload ? { payload } : {}) })
  return { database, call }
}

describe('payments', () => {
  it('numbers invoices by Indian financial year', () => {
    expect(financialYear(new Date(2026, 10, 26))).toBe('26-27')
    expect(financialYear(new Date(2027, 2, 31))).toBe('26-27')
    expect(financialYear(new Date(2027, 3, 1))).toBe('27-28')
  })

  it('is for Admins only', async () => {
    const { call } = await setup()
    expect((await call('GET', '/v1/admin/payments', '')).statusCode).toBe(401)
    expect((await call('GET', '/v1/admin/payments', as('Sales'))).statusCode).toBe(403)
    expect((await call('GET', '/v1/admin/payments', as('Support'))).statusCode).toBe(403)
    expect((await call('GET', '/v1/admin/payments', ADMIN)).statusCode).toBe(200)
  })

  it('raises an invoice, records its payment once, and keeps totals', async () => {
    const { call, database } = await setup()
    expect((await call('POST', '/v1/admin/payments', ADMIN, { tenantId: 'tenant-0001', amount: 0, description: 'x' })).statusCode).toBe(400)
    expect((await call('POST', '/v1/admin/payments', ADMIN, { tenantId: 'nobody-0000', amount: 100, description: 'Renewal' })).statusCode).toBe(404)
    const a = await call('POST', '/v1/admin/payments', ADMIN, { tenantId: 'tenant-0001', amount: 7999, description: 'Renewal 2027' })
    const b = await call('POST', '/v1/admin/payments', ADMIN, { tenantId: 'tenant-0001', amount: 299, description: 'WhatsApp bill add-on', dueDays: 0 })
    expect(a.statusCode).toBe(201)
    const fy = financialYear(new Date())
    expect(a.json().created).toBe(`MT/${fy}/0001`)
    expect(b.json().created).toBe(`MT/${fy}/0002`)
    let d = b.json()
    expect(d.invoices.find((i: any) => i.amount === 299)).toMatchObject({ shop: 'Raj Fashion', description: 'WhatsApp bill add-on', status: 'Due' })
    expect(d.totals.outstanding).toBe(7999 + 299)

    const id = d.invoices.find((i: any) => i.amount === 7999).id
    expect((await call('POST', `/v1/admin/payments/${id}/paid`, ADMIN, { method: 'Gold' })).statusCode).toBe(400)
    const paid = await call('POST', `/v1/admin/payments/${id}/paid`, ADMIN, { method: 'UPI', reference: 'UTR123' })
    expect(paid.statusCode).toBe(200)
    d = paid.json()
    expect(d.invoices.find((i: any) => i.id === id)).toMatchObject({ status: 'Paid', method: 'UPI', reference: 'UTR123' })
    expect(d.totals).toMatchObject({ outstanding: 299, collectedThisMonth: 7999 })
    expect((await call('POST', `/v1/admin/payments/${id}/paid`, ADMIN, { method: 'UPI' })).statusCode).toBe(409)
    expect((await call('POST', `/v1/admin/payments/${id}/cancel`, ADMIN)).statusCode).toBe(409)

    const other = d.invoices.find((i: any) => i.amount === 299).id
    const cancelled = await call('POST', `/v1/admin/payments/${other}/cancel`, ADMIN)
    expect(cancelled.json().invoices.find((i: any) => i.id === other).status).toBe('Cancelled')
    expect(cancelled.json().totals.outstanding).toBe(0)
    expect(database.c('audit_log').docs.map((x) => x['action'])).toEqual(['invoice_created', 'invoice_created', 'invoice_paid', 'invoice_cancelled'])
  })

  it('shows an unpaid invoice past its due date as overdue', async () => {
    const { call, database } = await setup()
    await database.c('invoices').insertOne({ id: 'old-1', no: 'MT/25-26/0007', tenantId: 'tenant-0001', amount: 4999, status: 'due', issuedAt: new Date(Date.now() - 40 * 864e5), dueAt: new Date(Date.now() - 25 * 864e5) })
    const d = (await call('GET', '/v1/admin/payments', ADMIN)).json()
    expect(d.invoices[0].status).toBe('Overdue')
    expect(d.totals).toMatchObject({ overdue: 4999, overdueCount: 1 })
  })
})
