import { generateKeyPairSync } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { makeSigner } from '../src/lib/licence.js'
import { fakeDatabase } from './fakedb.js'

process.env['NODE_ENV'] = 'test'

const KEY = 'MARS-2HZ6-SSVD-QM4Z'
const MACHINE = 'AAAABBBBCCCCDDDDEEEEFFFF00001111'
const TENANT = '3ccb878e-d2b5-479f-af5d-ef49054f7d61'

const payloadOf = (token: string): Record<string, unknown> => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'))

function setup() {
  const database = fakeDatabase()
  const now = new Date()
  void database.c('shops').insertOne({ tenantId: TENANT, name: 'Mars', status: 'active', plan: 'smart', mode: 'cloud', counters: 1 })
  void database.c('activation_keys').insertOne({ key: KEY, tenantId: TENANT, mobile: '6784934853', status: 'activated', machineId: MACHINE, issuedAt: now, licenceIssued: '2026-11-25', licenceExpires: '2027-11-24' })
  const pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const config = loadConfig({ OTP_SECRET: 'test-secret' })
  return { database, build: () => buildApp(config, database, { signer: makeSigner(pem) }) }
}

let s: ReturnType<typeof setup>
beforeEach(() => { s = setup() })
type App = Awaited<ReturnType<ReturnType<typeof setup>['build']>>
const refresh = (app: App, payload: Record<string, unknown> = { key: KEY, machine: MACHINE }) => app.inject({ method: 'POST', url: '/v1/refresh', payload })

describe('POST /v1/refresh', () => {
  it('signs a fresh licence from what MongoDB holds and records the check-in', async () => {
    const app = await s.build()
    const r = await refresh(app)
    expect(r.statusCode).toBe(200)
    expect(payloadOf(r.json().licence)).toMatchObject({ key: KEY, machine: MACHINE, shop: 'Mars', plan: 'smart', mode: 'cloud', counters: 1, kind: 'full', issued: '2026-11-25', expires: '2027-11-24' })
    const dev = await s.database.c('devices').findOne({ tenantId: TENANT, machineId: MACHINE })
    expect(dev?.['lastCheckAt']).toBeInstanceOf(Date)
  })

  it('picks up a renewal and a plan change', async () => {
    await s.database.c('activation_keys').updateOne({ key: KEY }, { $set: { licenceExpires: '2028-11-24' } })
    await s.database.c('shops').updateOne({ tenantId: TENANT }, { $set: { plan: 'pro', counters: 3 } })
    const r = await refresh(await s.build())
    expect(payloadOf(r.json().licence)).toMatchObject({ expires: '2028-11-24', plan: 'pro', counters: 3 })
  })

  it('refuses another PC, a cancelled key, a suspended shop and an unknown key', async () => {
    const app = await s.build()
    expect((await refresh(app, { key: KEY, machine: 'ZZZZYYYYXXXXWWWW' })).statusCode).toBe(403)
    expect((await refresh(app, { key: 'MARS-AAAA-BBBB-CCCC', machine: MACHINE })).statusCode).toBe(403)
    expect((await refresh(app, { key: 'nonsense', machine: MACHINE })).statusCode).toBe(400)
    await s.database.c('shops').updateOne({ tenantId: TENANT }, { $set: { status: 'suspended' } })
    expect((await refresh(app)).json().error).toMatch(/suspended/)
    await s.database.c('activation_keys').updateOne({ key: KEY }, { $set: { status: 'revoked' } })
    expect((await refresh(app)).json().error).toMatch(/cancelled/)
  })
})
