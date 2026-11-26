import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Db } from 'mongodb'
import { z } from 'zod'
import type { Config } from '../config.js'
import type { Messenger } from '../lib/messenger.js'
import { RESET_PAGE } from '../lib/resetPage.js'
import { hashAppPin, hashToken, newToken, pinProblem } from '../lib/secrets.js'

/**
 * Owner forgot-PIN. The PIN is chosen on a web page opened from an email sent to the owner's email on file; no one at MARS can see it.
 *   app  -> POST /v1/pin-reset/request   (licence key + PC id; also "resend")   -> emails the link, answers a masked email hint
 *   web  -> GET  /v1/pin-reset/validate  (token)                                -> is the link good?
 *   web  -> POST /v1/pin-reset/complete  (token + new PIN)                      -> hashes the PIN, keeps it in MongoDB, readies the hand-off
 *   app  -> GET  /v1/pin-reset/status    (key, PC id, resetId)                  -> the hash once it is ready
 *   app  -> POST /v1/pin-reset/applied                                          -> the PC has it: the hand-off is deleted
 */

export const RESET_MINUTES = 15
const MAX_SENDS = 4 // the first email and three resends (the app shows the same limit)
const MAX_EMAILS_PER_HOUR = 5 // per shop, however the requests are spread
const HOUR = 3_600_000

const NOT_ACTIVATED = 'This PC is not activated with MARS. Contact MARS support.'
const DEAD_LINK = 'This link has expired or was already used. Open Mars Cosmos on the shop PC and tap Forgot PIN again.'

const Identity = z.object({
  key: z.string().transform((k) => k.trim().toUpperCase()).pipe(z.string().regex(/^MARS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)),
  machine: z.string().trim().min(8).max(128)
})
const RequestBody = Identity.extend({ resetId: z.string().regex(/^[0-9a-f]{24}$/).optional(), resend: z.boolean().optional() })
const StatusQuery = Identity.extend({ resetId: z.string().regex(/^[0-9a-f]{24}$/) })

/** ni•••@gmail.com: the app shows this and never learns the full address. */
export const maskEmail = (email: string): string => {
  const [local = '', domain = ''] = email.split('@')
  return `${local.length > 2 ? local.slice(0, 2) : local.slice(0, 1)}•••@${domain}`
}

export function pinResetRoutes(deps: { config: Config; messenger: Messenger; secret: string }) {
  const { config, messenger, secret } = deps
  return async function routes(app: FastifyInstance): Promise<void> {
    const dbOf = (): Db | null => app.database?.db ?? null

    /** The shop and owner behind a licence key, but only when the call comes from the PC that key was activated on. */
    async function identify(db: Db, key: string, machine: string) {
      const k = await db.collection('activation_keys').findOne({ key })
      if (!k || k['status'] !== 'activated' || k['machineId'] !== machine) return null
      const tenantId = k['tenantId'] as string
      const shop = await db.collection('shops').findOne({ tenantId })
      const owner = await db.collection('owners').findOne({ tenantId })
      if (!shop || !owner) return null
      return { tenantId, shop, owner }
    }
    const log = (db: Db, tenantId: string, action: string, details: Record<string, unknown> = {}) =>
      db.collection('audit_log').insertOne({ tenantId, action, at: new Date(), details })

    // the page the emailed link opens: one self-contained HTML file, so no separate web server has to be running
    app.get('/reset-pin', async (_req, reply) => reply.header('cache-control', 'no-store').type('text/html; charset=utf-8').send(RESET_PAGE))

    app.post('/v1/pin-reset/request', async (req, reply) => {
      const db = dbOf()
      if (!db) return reply.code(503).send({ error: 'The MARS server is not ready yet. Try again later.' })
      const p = RequestBody.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: NOT_ACTIVATED })
      const { key, machine, resetId, resend } = p.data
      const who = await identify(db, key, machine)
      if (!who) return reply.code(403).send({ error: NOT_ACTIVATED })
      if (who.shop['status'] === 'suspended') return reply.code(403).send({ error: 'This shop is suspended. Contact MARS support.' })
      const { tenantId } = who
      const pins = db.collection('pin_resets')

      const now = new Date()
      const recent = await db.collection('audit_log').countDocuments({ tenantId, action: 'pin_reset_email_sent', at: { $gt: new Date(now.getTime() - HOUR) } })
      if (recent >= MAX_EMAILS_PER_HOUR) return reply.code(429).send({ error: 'Too many reset emails for this shop. Try again in an hour.' })

      const token = newToken()
      const tokenHash = hashToken(secret, token)
      const expiresAt = new Date(now.getTime() + RESET_MINUTES * 60_000)
      let id: string
      if (resend && resetId) {
        const cur = await pins.findOne({ resetId, tenantId, machineId: machine, status: 'pending', expiresAt: { $gt: now } })
        if (!cur) return reply.code(400).send({ error: 'This reset is no longer open. Start the PIN reset again.' })
        if ((cur['sendCount'] ?? 1) >= MAX_SENDS) return reply.code(429).send({ error: 'The email was already sent three times. Check the inbox and the spam folder, or try again later.' })
        await pins.updateOne({ resetId }, { $set: { tokenHash, expiresAt, lastSentAt: now }, $inc: { sendCount: 1 } })
        id = resetId
      } else {
        await pins.updateMany({ tenantId, status: 'pending' }, { $set: { status: 'expired' } }) // an older link stops working
        id = randomBytes(12).toString('hex')
        await pins.insertOne({ resetId: id, tenantId, tokenHash, machineId: machine, status: 'pending', sendCount: 1, expiresAt, lastSentAt: now, createdAt: now })
      }

      const email = String(who.owner['email'])
      try {
        await messenger.sendPinResetEmail(email, String(who.shop['name']), `${(config.WEB_URL ?? `http://localhost:${config.PORT}`).replace(/\/+$/, '')}/reset-pin?token=${token}`, RESET_MINUTES)
      } catch (e) {
        app.log.error({ err: e instanceof Error ? e.message : e }, 'pin reset email failed')
        await pins.updateOne({ resetId: id }, { $set: { status: 'expired' } })
        return reply.code(502).send({ error: 'The email could not be sent. Try again in a moment.' })
      }
      await log(db, tenantId, 'pin_reset_email_sent', { resend: !!resend })
      return { resetId: id, emailHint: maskEmail(email), expiresInSec: RESET_MINUTES * 60 }
    })

    app.get('/v1/pin-reset/validate', async (req, reply) => {
      const db = dbOf()
      if (!db) return reply.code(503).send({ error: 'The MARS server is not ready yet. Try again later.' })
      const token = String((req.query as Record<string, unknown>)['token'] ?? '')
      const doc = token.length >= 20 ? await db.collection('pin_resets').findOne({ tokenHash: hashToken(secret, token), status: 'pending', expiresAt: { $gt: new Date() } }) : null
      if (!doc) return reply.code(410).send({ error: DEAD_LINK })
      const shop = await db.collection('shops').findOne({ tenantId: doc['tenantId'] })
      return { shop: shop?.['name'] ?? '', minutesLeft: Math.max(1, Math.ceil((doc['expiresAt'].getTime() - Date.now()) / 60_000)) }
    })

    app.post('/v1/pin-reset/complete', async (req, reply) => {
      const db = dbOf()
      if (!db) return reply.code(503).send({ error: 'The MARS server is not ready yet. Try again later.' })
      const b = z.object({ token: z.string().min(20).max(200), pin: z.string() }).safeParse(req.body)
      if (!b.success) return reply.code(400).send({ error: DEAD_LINK })
      const problem = pinProblem(b.data.pin)
      if (problem) return reply.code(400).send({ error: problem })
      const newPinHash = await hashAppPin(b.data.pin)
      const now = new Date()
      // single use: the first request to flip pending -> ready wins; a second click or a replay finds nothing
      const doc = await db.collection('pin_resets').findOneAndUpdate(
        { tokenHash: hashToken(secret, b.data.token), status: 'pending', expiresAt: { $gt: now } },
        { $set: { status: 'ready', usedAt: now, newPinHash } }
      )
      if (!doc) return reply.code(410).send({ error: DEAD_LINK })
      const tenantId = doc['tenantId'] as string
      await db.collection('owners').updateOne({ tenantId }, { $set: { pinHash: newPinHash, pinUpdatedAt: now, updatedAt: now } })
      await log(db, tenantId, 'pin_reset_completed')
      const owner = await db.collection('owners').findOne({ tenantId })
      const shop = await db.collection('shops').findOne({ tenantId })
      if (owner) await messenger.sendPinChangedEmail(String(owner['email']), String(shop?.['name'] ?? '')).catch((e: unknown) => app.log.error({ err: e instanceof Error ? e.message : e }, 'pin changed email failed'))
      return { ok: true }
    })

    app.get('/v1/pin-reset/status', async (req, reply) => {
      const db = dbOf()
      if (!db) return reply.code(503).send({ error: 'The MARS server is not ready yet. Try again later.' })
      const q = StatusQuery.safeParse(req.query)
      if (!q.success) return reply.code(400).send({ error: NOT_ACTIVATED })
      const who = await identify(db, q.data.key, q.data.machine)
      if (!who) return reply.code(403).send({ error: NOT_ACTIVATED })
      const doc = await db.collection('pin_resets').findOne({ resetId: q.data.resetId, tenantId: who.tenantId, machineId: q.data.machine })
      if (!doc) return { status: 'expired' }
      if (doc['status'] === 'ready') return { status: 'ready', pinHash: doc['newPinHash'] }
      if (doc['status'] === 'pending' && doc['expiresAt'] > new Date()) return { status: 'waiting' }
      return { status: 'expired' }
    })

    app.post('/v1/pin-reset/applied', async (req, reply) => {
      const db = dbOf()
      if (!db) return reply.code(503).send({ error: 'The MARS server is not ready yet. Try again later.' })
      const b = StatusQuery.safeParse(req.body)
      if (!b.success) return reply.code(400).send({ error: NOT_ACTIVATED })
      const who = await identify(db, b.data.key, b.data.machine)
      if (!who) return reply.code(403).send({ error: NOT_ACTIVATED })
      const r = await db.collection('pin_resets').updateOne(
        { resetId: b.data.resetId, tenantId: who.tenantId, machineId: b.data.machine, status: 'ready' },
        { $set: { status: 'applied', appliedAt: new Date() }, $unset: { newPinHash: '' } } // the hash only waits here until the PC has it
      )
      if (r.matchedCount) await log(db, who.tenantId, 'pin_reset_applied', { machineId: b.data.machine })
      return { ok: true }
    })
  }
}
