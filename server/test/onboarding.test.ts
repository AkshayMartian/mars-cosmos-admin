import { createPublicKey, verify } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { generateLicenceKeyPair, licenceDates, makeSigner } from '../src/lib/licence.js'
import type { Messenger } from '../src/lib/messenger.js'
import { makeSessionToken } from '../src/routes/admin.js'
import { hashPassword, newActivationKey, verifyPassword } from '../src/lib/secrets.js'
import { fakeDatabase } from './fakedb.js'

process.env['NODE_ENV'] = 'test'

const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64')
const pair = generateLicenceKeyPair()

function setup(opts: { failKey?: boolean } = {}) {
  const sent: { codes: Record<string, string>; keys: Array<{ mobile: string; key: string }> } = { codes: {}, keys: [] }
  const messenger: Messenger = {
    async sendCode(channel, target, code) { sent.codes[`${channel}:${target}`] = code },
    async sendActivationKey(mobile, _shop, key) { if (opts.failKey) throw new Error('number not on WhatsApp'); sent.keys.push({ mobile, key }); return { messageId: 'wamid.1' } },
    async sendActivationKeyEmail(email, _shop, key) { if (opts.failKey) throw new Error('mailbox unavailable'); sent.keys.push({ mobile: email, key }); return { messageId: 'wamid.1' } },
    async sendPinResetEmail() { /* not used here */ },
    async sendPinChangedEmail() { /* not used here */ }
  }
  const uploads = mkdtempSync(join(tmpdir(), 'mars-up-'))
  const config = loadConfig({ UPLOAD_DIR: uploads, OTP_SECRET: 'test-secret' })
  const database = fakeDatabase()
  return { sent, database, uploads, build: async () => {
    const app = await buildApp(config, database, { messenger, signer: makeSigner(pair.privatePem), emailDomainOk: async (e) => !e.endsWith('@nodomain.invalid') })
    // every request in these tests is made by a signed-in staff member, except where a test says otherwise
    const cookie = 'mars_admin=' + makeSessionToken('test-secret', { email: 'staff@example.com', name: 'Staff', role: 'Admin' })
    const inject = app.inject.bind(app) as (o: any) => any
    ;(app as any).inject = (o: any) => inject({ ...o, headers: { cookie, ...o.headers } })
    return app
  } }
}

const form = (over: Record<string, unknown> = {}) => ({
  fullName: 'Rajesh Patel', mobile: '9876543210', email: 'Rajesh@Example.com', password: '4821', photo: PNG,
  shopName: 'Raj Fashion', description: 'Clothes', contactNumber: '9876500000', gstin: '24AAAAA1111A1Z5',
  address: '12 Ring Road', city: 'Ahmedabad', stateCode: '24', pincode: '380001', plan: 'smart', mode: 'cloud', counters: 2, days: 365, ...over
})

async function verifyBoth(app: Awaited<ReturnType<ReturnType<typeof setup>['build']>>, sent: ReturnType<typeof setup>['sent'], mobile = '9876543210', email = 'rajesh@example.com') {
  for (const [channel, target] of [['email', email]] as const) {
    expect((await app.inject({ method: 'POST', url: '/v1/onboarding/otp', payload: { channel, target } })).statusCode).toBe(200)
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/verify', payload: { channel, target, code: sent.codes[`${channel}:${target}`] } })
    expect(r.json()).toEqual({ verified: true })
  }
}

describe('one-time codes', () => {
  it('sends, rejects a wrong code, accepts the right one, and limits resends', async () => {
    const s = setup(); const app = await s.build()
    const otp = { method: 'POST' as const, url: '/v1/onboarding/otp', payload: { channel: 'mobile', target: '9876543210' } }
    expect((await app.inject(otp)).statusCode).toBe(200)
    expect((await app.inject(otp)).statusCode).toBe(429)
    const code = s.sent.codes['mobile:9876543210']!
    const wrong = code === '000000' ? '111111' : '000000'
    const bad = await app.inject({ method: 'POST', url: '/v1/onboarding/verify', payload: { channel: 'mobile', target: '9876543210', code: wrong } })
    expect(bad.statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/v1/onboarding/verify', payload: { channel: 'mobile', target: '9876543210', code } })).json()).toEqual({ verified: true })
    // only a hash is stored
    const stored = s.database.c('otp_verifications').docs[0]!
    expect(JSON.stringify(stored)).not.toContain(code)
    await app.close()
  })

  it('locks a code after 5 wrong tries', async () => {
    const s = setup(); const app = await s.build()
    await app.inject({ method: 'POST', url: '/v1/onboarding/otp', payload: { channel: 'email', target: 'a@b.co' } })
    const code = s.sent.codes['email:a@b.co']!
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/v1/onboarding/verify', payload: { channel: 'email', target: 'a@b.co', code: wrong } })
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/verify', payload: { channel: 'email', target: 'a@b.co', code } })
    expect(r.statusCode).toBe(429)
    await app.close()
  })

  it('refuses an email whose domain cannot receive mail, without sending anything', async () => {
    const s = setup(); const app = await s.build()
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/otp', payload: { channel: 'email', target: 'a@nodomain.invalid' } })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toContain('cannot receive mail')
    expect(s.sent.codes).toEqual({})
    await app.close()
  })

  it('refuses a bad mobile with a message', async () => {
    const s = setup(); const app = await s.build()
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/otp', payload: { channel: 'mobile', target: '5555555555' } })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toContain('10 digits')
    await app.close()
  })
})

describe('submit', () => {
  it('refuses until both contacts are verified', async () => {
    const s = setup(); const app = await s.build()
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form() })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toContain('Verify')
    expect(s.database.c('shops').docs).toHaveLength(0)
    await app.close()
  })

  it('validates fields (GST must match the State, short password)', async () => {
    const s = setup(); const app = await s.build()
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form({ stateCode: '27', password: '12' }) })
    expect(r.statusCode).toBe(400)
    expect(r.json().fields).toMatchObject({ gstin: expect.stringContaining('starts with 24'), password: 'Use exactly 4 digits.' })
    await app.close()
  })

  it('saves shop, owner (hashed password), photo and key, and emails the key', async () => {
    const s = setup(); const app = await s.build()
    await verifyBoth(app, s.sent)
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form() })
    expect(r.statusCode).toBe(201)
    const out = r.json()
    expect(out.key).toMatch(/^MARS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(out.whatsapp).toEqual({ status: 'sent' })
    expect(s.sent.keys).toEqual([{ mobile: 'rajesh@example.com', key: out.key }])

    const shop = s.database.c('shops').docs[0]!
    expect(shop).toMatchObject({ name: 'Raj Fashion', status: 'pending', gstin: '24AAAAA1111A1Z5', address: { state: 'Gujarat', stateCode: '24', city: 'Ahmedabad' } })
    const owner = s.database.c('owners').docs[0]!
    expect(owner.email).toBe('rajesh@example.com')
    expect(owner.passwordHash).not.toContain('4821')
    expect(await verifyPassword('4821', owner.passwordHash)).toBe(true)
    expect(existsSync(join(s.uploads, owner.photoKey))).toBe(true)
    expect(s.database.c('activation_keys').docs[0]).toMatchObject({ key: out.key, status: 'issued', whatsapp: { status: 'sent', messageId: 'wamid.1' }, licenceDays: 365 })
    // codes are used up
    expect(s.database.c('otp_verifications').docs).toHaveLength(0)
    await app.close()
  })

  it('keeps the shop and reports the failure when the email cannot be delivered the key', async () => {
    const s = setup({ failKey: true }); const app = await s.build()
    await verifyBoth(app, s.sent)
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form() })
    expect(r.statusCode).toBe(201)
    expect(r.json().whatsapp).toMatchObject({ status: 'failed', error: 'mailbox unavailable' })
    expect(s.database.c('activation_keys').docs[0]!.whatsapp.status).toBe('failed')
    await app.close()
  })

  it('does not ask for a mobile code: only the email must be verified', async () => {
    const s = setup(); const app = await s.build()
    await verifyBoth(app, s.sent)
    expect(Object.keys(s.sent.codes)).toEqual(['email:rajesh@example.com'])
    expect((await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form() })).statusCode).toBe(201)
    expect(s.database.c('owners').docs[0]).not.toHaveProperty('mobileVerifiedAt')
    await app.close()
  })

  it('refuses a second shop for the same mobile', async () => {
    const s = setup(); const app = await s.build()
    await verifyBoth(app, s.sent)
    expect((await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form() })).statusCode).toBe(201)
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/otp', payload: { channel: 'mobile', target: '9876543210' } })
    expect(r.statusCode).toBe(409)
    await app.close()
  })

  it('refuses a photo that is not really an image', async () => {
    const s = setup(); const app = await s.build()
    await verifyBoth(app, s.sent)
    const fake = 'data:image/png;base64,' + Buffer.from('not an image').toString('base64')
    const r = await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form({ photo: fake }) })
    expect(r.statusCode).toBe(400)
    expect(r.json().fields.photo).toContain('JPG or PNG')
    await app.close()
  })
})

describe('activation', () => {
  let s: ReturnType<typeof setup>
  let app: Awaited<ReturnType<typeof s.build>>
  let key: string
  const MACHINE = '124D-9CE2-664F-AAAA'
  const act = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/v1/activate', payload })

  beforeEach(async () => {
    s = setup(); app = await s.build()
    await verifyBoth(app, s.sent)
    key = (await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form() })).json().key
  })

  it('returns a signed licence and the shop profile, and activates the shop', async () => {
    const r = await act({ key: key.toLowerCase(), mobile: '+91 98765 43210', machine: MACHINE })
    expect(r.statusCode).toBe(200)
    const { licence, shop, owner } = r.json()

    const [tag, body, sig] = licence.split('.')
    expect(tag).toBe('MARSL1')
    const ok = verify(null, Buffer.from(body, 'base64url'), createPublicKey(pair.publicPem), Buffer.from(sig, 'base64url'))
    expect(ok).toBe(true)
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    expect(payload).toMatchObject({ v: 1, key, machine: MACHINE, shop: 'Raj Fashion', plan: 'smart', mode: 'cloud', counters: 2, kind: 'full', ...licenceDates(365) })

    expect(shop).toMatchObject({ name: 'Raj Fashion', description: 'Clothes', contactNumber: '9876500000', gstin: '24AAAAA1111A1Z5', address: { line: '12 Ring Road', city: 'Ahmedabad', state: 'Gujarat', stateCode: '24', pincode: '380001' } })
    expect(owner.fullName).toBe('Rajesh Patel')
    expect(owner.photo).toMatch(/^data:image\/png;base64,/)
    expect(JSON.stringify(r.json())).not.toContain('example.com')
    expect(s.database.c('shops').docs[0]!.status).toBe('active')
    expect(s.database.c('activation_keys').docs[0]).toMatchObject({ status: 'activated', machineId: MACHINE })
    expect(s.database.c('devices').docs).toHaveLength(1)
    await app.close()
  })

  it('lets the same PC activate again, but not a second PC', async () => {
    expect((await act({ key, mobile: '9876543210', machine: MACHINE })).statusCode).toBe(200)
    expect((await act({ key, mobile: '9876543210', machine: MACHINE })).statusCode).toBe(200)
    const other = await act({ key, mobile: '9876543210', machine: 'FFFF-0000-1111-2222' })
    expect(other.statusCode).toBe(409)
    await app.close()
  })

  it('answers the same message for a wrong mobile and an unknown key, and locks after 10 wrong mobiles', async () => {
    const wrongMobile = await act({ key, mobile: '9123456789', machine: MACHINE })
    const unknown = await act({ key: newActivationKey(), mobile: '9876543210', machine: MACHINE })
    expect(wrongMobile.statusCode).toBe(400)
    expect(wrongMobile.json()).toEqual(unknown.json())
    for (let i = 0; i < 9; i++) await act({ key, mobile: '9123456789', machine: MACHINE })
    expect((await act({ key, mobile: '9876543210', machine: MACHINE })).statusCode).toBe(429)
    await app.close()
  })

  it('refuses a revoked key', async () => {
    s.database.c('activation_keys').docs[0]!.status = 'revoked'
    const r = await act({ key, mobile: '9876543210', machine: MACHINE })
    expect(r.statusCode).toBe(403)
    await app.close()
  })

  it('says so when the server has no signing key', async () => {
    const noKey = await buildApp(loadConfig({}), s.database, { signer: null })
    expect((await noKey.inject({ method: 'POST', url: '/v1/activate', payload: { key, mobile: '9876543210', machine: MACHINE } })).statusCode).toBe(503)
    await noKey.close()
    await app.close()
  })
})

describe('helpers', () => {
  it('hashes passwords with a random salt', async () => {
    const a = await hashPassword('same-password'), b = await hashPassword('same-password')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same-password', a)).toBe(true)
    expect(await verifyPassword('other-password', a)).toBe(false)
  })
  it('counts both licence days (365 days from 1 Jan ends 31 Dec)', () => {
    expect(licenceDates(365, new Date('2026-01-01T10:00:00Z'))).toEqual({ issued: '2026-01-01', expires: '2026-12-31' })
  })
  it('does not leave the private key readable by accident', () => {
    expect(readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')).toContain('*.pem')
  })
})

describe('staff sign-in', () => {
  const login = (app: any, email: string, password: string) => app.inject({ method: 'POST', url: '/v1/admin/login', headers: { cookie: '' }, payload: { email, password } })
  async function withAdmin() {
    const s = setup(); const app = await s.build()
    await s.database.c('admin_users').insertOne({ email: 'admin@gmail.com', name: 'Admin', role: 'Admin', active: true, passwordHash: await hashPassword('Test@1234') })
    return { s, app }
  }

  it('signs in with the right password, sets a http-only cookie, and /me knows who it is', async () => {
    const { app } = await withAdmin()
    const r = await login(app, 'Admin@Gmail.com', 'Test@1234')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ email: 'admin@gmail.com', name: 'Admin', role: 'Admin' })
    const set = String(r.headers['set-cookie'])
    expect(set).toContain('HttpOnly')
    const me = await app.inject({ url: '/v1/admin/me', headers: { cookie: set.split(';')[0] } })
    expect(me.json()).toMatchObject({ email: 'admin@gmail.com' })
    await app.close()
  })

  it('refuses a wrong password and an unknown email with the same message, and locks after 5 tries', async () => {
    const { app } = await withAdmin()
    const a = await login(app, 'admin@gmail.com', 'wrong'), b = await login(app, 'nobody@gmail.com', 'wrong')
    expect(a.statusCode).toBe(401); expect(a.json()).toEqual(b.json())
    for (let i = 0; i < 4; i++) await login(app, 'admin@gmail.com', 'wrong')
    expect((await login(app, 'admin@gmail.com', 'Test@1234')).statusCode).toBe(429)
    await app.close()
  })

  it('refuses a forged or missing session, and keeps onboarding closed to the public', async () => {
    const { app } = await withAdmin()
    expect((await app.inject({ url: '/v1/admin/me', headers: { cookie: 'mars_admin=abc.def' } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/v1/onboarding/otp', headers: { cookie: '' }, payload: { channel: 'mobile', target: '9876543210' } })).statusCode).toBe(401)
    await app.close()
  })
})

describe('plans come from the database', () => {
  const asSupport = { cookie: 'mars_admin=' + makeSessionToken('test-secret', { email: 's@example.com', name: 'Sup', role: 'Support' }) }
  const add = (app: any, payload: Record<string, unknown>, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/v1/admin/plans', payload, headers }) as Promise<{ statusCode: number; json: () => any }> // eslint-disable-line @typescript-eslint/no-explicit-any

  it('an Admin adds a plan: it gets a short key, is listed by price, and a duplicate name is refused', async () => {
    const s = setup(); const app = await s.build()
    const r = await add(app, { name: 'Family Pack', yearPrice: 9500, counters: 3, includes: ['alterations'] })
    expect(r.statusCode).toBe(201)
    expect(r.json().added).toBe('family_pack')
    expect(r.json().plans.map((p: { key: string }) => p.key)).toEqual(['basic', 'smart', 'family_pack', 'pro'])
    expect(s.database.c('plans').docs.find((d) => d['key'] === 'family_pack')).toMatchObject({ name: 'Family Pack', yearPrice: 9500, counters: 3, includes: ['alterations'] })
    expect((await add(app, { name: 'family pack', yearPrice: 1 })).statusCode).toBe(409)
    expect((await add(app, { name: 'Family-Pack', yearPrice: 1000 })).json().added).toBe('family_pack_2') // a different name that makes the same short key
    expect(s.database.c('audit_log').docs.some((d) => d['action'] === 'plan_added')).toBe(true)
    await app.close()
  })

  it('refuses non-Admin staff and bad values', async () => {
    const s = setup(); const app = await s.build()
    expect((await add(app, { name: 'Gold', yearPrice: 100 }, asSupport)).statusCode).toBe(403)
    expect((await add(app, { name: 'G', yearPrice: 100 })).statusCode).toBe(400)
    expect((await add(app, { name: 'Gold', yearPrice: -1 })).statusCode).toBe(400)
    expect((await add(app, { name: 'Gold', yearPrice: 'abc' })).json().error).toContain('whole rupees')
    expect((await add(app, { name: 'Gold', yearPrice: 100, counters: 0 })).statusCode).toBe(400)
    expect(s.database.c('plans').docs.map((d) => d['key'])).not.toContain('gold')
    await app.close()
  })

  it('onboarding accepts a plan added later, and refuses one that is not in the database', async () => {
    const s = setup(); const app = await s.build()
    await verifyBoth(app, s.sent)
    const unknown = await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form({ plan: 'gold' }) })
    expect(unknown.statusCode).toBe(400)
    expect(unknown.json().fields).toEqual({ plan: 'Choose one of the listed plans.' })
    expect((await add(app, { name: 'Gold', yearPrice: 20000, counters: 4 })).statusCode).toBe(201)
    const ok = await app.inject({ method: 'POST', url: '/v1/onboarding/submit', payload: form({ plan: 'gold' }) })
    expect(ok.statusCode).toBe(201)
    expect(s.database.c('shops').docs[0]).toMatchObject({ plan: 'gold' })
    await app.close()
  })
})
