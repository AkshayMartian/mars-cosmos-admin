import { scryptSync } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import type { Messenger } from '../src/lib/messenger.js'
import { fakeDatabase } from './fakedb.js'

process.env['NODE_ENV'] = 'test'

const KEY = 'MARS-2HZ6-SSVD-QM4Z'
const MACHINE = 'AAAABBBBCCCCDDDDEEEEFFFF00001111'
const TENANT = '3ccb878e-d2b5-479f-af5d-ef49054f7d61'

/** The app's own check (mars-pos-desktop src/main/services/pin.ts), repeated here so the format the server hands over is proven compatible. */
function appVerify(pin: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  return scryptSync(pin, Buffer.from(saltHex, 'hex'), 32).toString('hex') === hashHex
}

function setup(opts: { mailFails?: boolean } = {}) {
  const mails: Array<{ kind: 'reset' | 'changed'; to: string; link?: string }> = []
  const messenger: Messenger = {
    async sendCode() { /* unused */ },
    async sendActivationKey() { return {} },
    async sendActivationKeyEmail() { return {} },
    async sendPinResetEmail(to, _shop, link) { if (opts.mailFails) throw new Error('smtp down'); mails.push({ kind: 'reset', to, link }) },
    async sendPinChangedEmail(to) { mails.push({ kind: 'changed', to }) }
  }
  const database = fakeDatabase()
  const now = new Date()
  void database.c('shops').insertOne({ tenantId: TENANT, name: 'Mars', status: 'active', plan: 'Starter', mode: 'cloud' })
  void database.c('owners').insertOne({ tenantId: TENANT, fullName: 'Nikhil Joshi', mobile: '6784934853', email: 'nikhil.joshi@gmail.com', passwordHash: 'x', createdAt: now })
  void database.c('activation_keys').insertOne({ key: KEY, tenantId: TENANT, mobile: '6784934853', status: 'activated', machineId: MACHINE, issuedAt: now })
  const config = loadConfig({ OTP_SECRET: 'test-secret', WEB_URL: 'https://admin.example.com' })
  return { mails, database, build: () => buildApp(config, database, { messenger, signer: null }) }
}

const ident = { key: KEY, machine: MACHINE }
const tokenOf = (link: string | undefined): string => new URL(link!).searchParams.get('token')!

type App = Awaited<ReturnType<ReturnType<typeof setup>['build']>>
const request = (app: App, payload: Record<string, unknown> = ident) => app.inject({ method: 'POST', url: '/v1/pin-reset/request', payload })
const status = (app: App, resetId: string, over: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: '/v1/pin-reset/status', query: { ...ident, resetId, ...over } })

let s: ReturnType<typeof setup>
beforeEach(() => { s = setup() })

describe('owner forgot PIN: request', () => {
  it('emails a one-time link to the owner email on file and answers only a masked hint', async () => {
    const app = await s.build()
    const r = await request(app)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ emailHint: 'ni•••@gmail.com', expiresInSec: 900 })
    expect(r.body).not.toContain('nikhil.joshi')
    expect(s.mails).toHaveLength(1)
    expect(s.mails[0]).toMatchObject({ kind: 'reset', to: 'nikhil.joshi@gmail.com' })
    expect(s.mails[0]!.link).toMatch(/^https:\/\/admin\.example\.com\/reset-pin\?token=[\w-]{40,}$/)
    // only a hash of the token is stored
    expect(JSON.stringify(s.database.c('pin_resets').docs)).not.toContain(tokenOf(s.mails[0]!.link))
  })

  it('refuses a PC that is not the one the key was activated on, a wrong key, and an unactivated key', async () => {
    const app = await s.build()
    expect((await request(app, { key: KEY, machine: 'ZZZZZZZZZZZZZZZZ' })).statusCode).toBe(403)
    expect((await request(app, { key: 'MARS-AAAA-BBBB-CCCC', machine: MACHINE })).statusCode).toBe(403)
    expect((await request(app, { key: 'nope', machine: MACHINE })).statusCode).toBe(400)
    await s.database.c('activation_keys').updateOne({ key: KEY }, { $set: { status: 'issued' } })
    expect((await request(app)).statusCode).toBe(403)
    expect(s.mails).toHaveLength(0)
  })

  it('a suspended shop gets no email', async () => {
    await s.database.c('shops').updateOne({ tenantId: TENANT }, { $set: { status: 'suspended' } })
    expect((await request(await s.build())).statusCode).toBe(403)
    expect(s.mails).toHaveLength(0)
  })

  it('resend sends a new link and kills the old one; at most 3 resends', async () => {
    const app = await s.build()
    const first = (await request(app)).json() as { resetId: string }
    const oldToken = tokenOf(s.mails[0]!.link)
    for (let i = 0; i < 3; i++) expect((await request(app, { ...ident, resetId: first.resetId, resend: true })).statusCode).toBe(200)
    expect(s.mails.filter((m) => m.kind === 'reset')).toHaveLength(4)
    const fifth = await request(app, { ...ident, resetId: first.resetId, resend: true })
    expect(fifth.statusCode).toBe(429)
    expect(fifth.json().error).toContain('three times')
    expect((await app.inject({ method: 'GET', url: '/v1/pin-reset/validate', query: { token: oldToken } })).statusCode).toBe(410)
    expect((await app.inject({ method: 'GET', url: '/v1/pin-reset/validate', query: { token: tokenOf(s.mails[3]!.link) } })).statusCode).toBe(200)
  })

  it('a new request makes the earlier link useless', async () => {
    const app = await s.build()
    await request(app); await request(app)
    expect((await app.inject({ method: 'GET', url: '/v1/pin-reset/validate', query: { token: tokenOf(s.mails[0]!.link) } })).statusCode).toBe(410)
    expect((await app.inject({ method: 'GET', url: '/v1/pin-reset/validate', query: { token: tokenOf(s.mails[1]!.link) } })).statusCode).toBe(200)
  })

  it('limits reset emails per shop per hour', async () => {
    const app = await s.build()
    for (let i = 0; i < 5; i++) expect((await request(app)).statusCode).toBe(200)
    const r = await request(app)
    expect(r.statusCode).toBe(429)
    expect(r.json().error).toContain('Too many')
  })

  it('says so when the email cannot be sent, and leaves no usable link', async () => {
    s = setup({ mailFails: true })
    const app = await s.build()
    const r = await request(app)
    expect(r.statusCode).toBe(502)
    expect(r.json().error).toContain('could not be sent')
    expect(s.database.c('pin_resets').docs.every((d) => d['status'] === 'expired')).toBe(true)
  })
})

describe('owner forgot PIN: the web page and the hand-off to the app', () => {
  async function started() {
    const app = await s.build()
    const { resetId } = (await request(app)).json() as { resetId: string }
    return { app, resetId, token: tokenOf(s.mails[0]!.link) }
  }

  it('full journey: link -> new PIN -> app gets the hash once -> applied -> nothing left', async () => {
    const { app, resetId, token } = await started()
    expect((await status(app, resetId)).json()).toEqual({ status: 'waiting' })
    expect((await app.inject({ method: 'GET', url: '/v1/pin-reset/validate', query: { token } })).json()).toMatchObject({ shop: 'Mars' })

    const done = await app.inject({ method: 'POST', url: '/v1/pin-reset/complete', payload: { token, pin: '4826' } })
    expect(done.json()).toEqual({ ok: true })
    expect(s.mails.at(-1)).toMatchObject({ kind: 'changed', to: 'nikhil.joshi@gmail.com' })

    // MongoDB keeps the hash on the owner, and it is not the PIN
    const owner = s.database.c('owners').docs[0]!
    expect(owner['pinHash']).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
    expect(JSON.stringify(s.database.c('pin_resets').docs)).not.toContain('4826')
    expect(appVerify('4826', owner['pinHash'])).toBe(true)
    expect(appVerify('1357', owner['pinHash'])).toBe(false)

    // the app receives the very same hash
    const st = (await status(app, resetId)).json() as { status: string; pinHash: string }
    expect(st).toMatchObject({ status: 'ready', pinHash: owner['pinHash'] })

    expect((await app.inject({ method: 'POST', url: '/v1/pin-reset/applied', payload: { ...ident, resetId } })).json()).toEqual({ ok: true })
    expect((await status(app, resetId)).json()).toEqual({ status: 'expired' })
    expect(s.database.c('pin_resets').docs[0]!['newPinHash']).toBeUndefined() // the hand-off copy is gone
    expect(s.database.c('audit_log').docs.map((d) => d['action'])).toEqual(expect.arrayContaining(['pin_reset_email_sent', 'pin_reset_completed', 'pin_reset_applied']))
  })

  it('the link works once', async () => {
    const { app, token } = await started()
    const pay = (pin: string) => app.inject({ method: 'POST', url: '/v1/pin-reset/complete', payload: { token, pin } })
    expect((await pay('4826')).statusCode).toBe(200)
    const again = await pay('7351')
    expect(again.statusCode).toBe(410)
    expect(appVerify('4826', s.database.c('owners').docs[0]!['pinHash'])).toBe(true) // the first PIN still stands
  })

  it('an expired link is refused', async () => {
    const { app, resetId, token } = await started()
    await s.database.c('pin_resets').updateOne({ resetId }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await app.inject({ method: 'GET', url: '/v1/pin-reset/validate', query: { token } })).statusCode).toBe(410)
    expect((await app.inject({ method: 'POST', url: '/v1/pin-reset/complete', payload: { token, pin: '4826' } })).statusCode).toBe(410)
    expect((await status(app, resetId)).json()).toEqual({ status: 'expired' })
    expect(s.database.c('owners').docs[0]!['pinHash']).toBeUndefined()
  })

  it('refuses a made-up token and bad PINs without using the link up', async () => {
    const { app, token } = await started()
    expect((await app.inject({ method: 'POST', url: '/v1/pin-reset/complete', payload: { token: 'x'.repeat(43), pin: '4826' } })).statusCode).toBe(410)
    for (const pin of ['123', '12345', 'abcd', '1111', '1234', '0000']) {
      const r = await app.inject({ method: 'POST', url: '/v1/pin-reset/complete', payload: { token, pin } })
      expect(r.statusCode, pin).toBe(400)
    }
    expect((await app.inject({ method: 'GET', url: '/v1/pin-reset/validate', query: { token } })).statusCode).toBe(200) // still usable
  })

  it("another PC, or a wrong key, cannot read the reset's status or hash", async () => {
    const { app, resetId, token } = await started()
    await app.inject({ method: 'POST', url: '/v1/pin-reset/complete', payload: { token, pin: '4826' } })
    expect((await status(app, resetId, { machine: 'ZZZZZZZZZZZZZZZZ' })).statusCode).toBe(403)
    expect((await status(app, resetId, { key: 'MARS-AAAA-BBBB-CCCC' })).statusCode).toBe(403)
    expect((await status(app, 'a'.repeat(24))).json()).toEqual({ status: 'expired' })
    expect((await app.inject({ method: 'POST', url: '/v1/pin-reset/applied', payload: { ...ident, machine: 'ZZZZZZZZZZZZZZZZ', resetId } })).statusCode).toBe(403)
  })
})
