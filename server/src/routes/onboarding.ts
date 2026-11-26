import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Db } from 'mongodb'
import { z, ZodError } from 'zod'
import type { Config } from '../config.js'
import type { Messenger } from '../lib/messenger.js'
import { emailDomainCanReceive } from '../lib/emailDomain.js'
import { loadPlans } from '../lib/plans.js'
import { requirePermission, sessionOf } from './admin.js'
import { hashCode, hashPassword, newActivationKey, newCode, safeEqual } from '../lib/secrets.js'
import { GST_STATES } from '../lib/states.js'

const MOBILE_RE = /^[6-9]\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const GST_RE = /^(0[1-9]|[1-2][0-9]|3[0-8])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

const CODE_MINUTES = 10
/** After a code is verified the proof stays valid this long, so the owner can finish the form. */
const VERIFIED_MINUTES = 30
const MAX_CODE_ATTEMPTS = 5
const RESEND_SECONDS = 30
const MAX_CODES_PER_HOUR = 5
/** A key nobody activated is refused after this many days (staff can issue a new one). */
const KEY_VALID_DAYS = 60
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

const mobile = z.string().regex(MOBILE_RE, 'Mobile number: 10 digits starting with 6, 7, 8 or 9.')
const email = z.string().trim().toLowerCase().max(120).regex(EMAIL_RE, 'Type a valid email address.')
const text = (label: string, min: number, max: number) => z.string().trim().min(min, `Type the ${label}.`).max(max, `The ${label} is too long.`)

const OtpBody = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('mobile'), target: mobile }),
  z.object({ channel: z.literal('email'), target: email })
])
const VerifyBody = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('mobile'), target: mobile, code: z.string().regex(/^\d{6}$/, 'The code has 6 digits.') }),
  z.object({ channel: z.literal('email'), target: email, code: z.string().regex(/^\d{6}$/, 'The code has 6 digits.') })
])

const SubmitBody = z.object({
  fullName: text('owner’s full name', 2, 80),
  mobile, email,
  password: z.string().regex(/^[0-9]{4}$/, 'Use exactly 4 digits.'),
  /** optional profile photo as a data URL (JPG or PNG, up to 2 MB) */
  photo: z.string().max(3_000_000).optional(),
  shopName: text('shop name', 2, 80),
  description: z.string().trim().max(500).optional(),
  contactNumber: mobile,
  gstin: z.string().trim().toUpperCase().optional().transform((v) => v || undefined),
  address: text('shop address', 3, 200),
  city: text('city', 2, 60),
  stateCode: z.string().refine((c) => c in GST_STATES, 'Choose a State.'),
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Pincode has 6 digits.'),
  // the key of a plan in the database (checked against the plans collection on submit)
  plan: z.string().regex(/^[a-z0-9_]{2,20}$/, 'Choose a plan.').default('smart'),
  mode: z.enum(['cloud', 'local']).default('cloud'),
  counters: z.coerce.number().int().min(1).max(50).default(1),
  days: z.coerce.number().int().min(1).max(3660).default(365)
}).superRefine((b, ctx) => {
  if (b.gstin && !GST_RE.test(b.gstin)) ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'The GST number is not valid. It has 15 characters, like 24AAAAA1111A1Z5.' })
  else if (b.gstin && b.gstin.slice(0, 2) !== b.stateCode) ctx.addIssue({ code: 'custom', path: ['gstin'], message: `The GST number starts with ${b.gstin.slice(0, 2)}, which is not the State chosen.` })
})

/** { error } is what every client shows. `fields` lets the web form put each message under its own field. */
function fail(reply: FastifyReply, status: number, error: string, fields?: Record<string, string>) {
  return reply.code(status).send(fields ? { error, fields } : { error })
}
function invalid(reply: FastifyReply, e: ZodError) {
  const fields: Record<string, string> = {}
  for (const i of e.issues) fields[i.path.join('.') || 'body'] ??= i.message
  return fail(reply, 400, Object.values(fields)[0] ?? 'Check the details and try again.', fields)
}
const isDuplicate = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000
const minutes = (n: number, from = Date.now()): Date => new Date(from + n * 60_000)

function decodePhoto(dataUrl: string): { bytes: Buffer; ext: 'jpg' | 'png' } | string {
  const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return 'The photo must be a JPG or PNG.'
  const bytes = Buffer.from(m[2]!, 'base64')
  if (bytes.length > MAX_PHOTO_BYTES) return 'The photo is larger than 2 MB.'
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  // the bytes must agree with the label, so a renamed file is not stored as an image
  if (m[1] === 'jpeg' ? !isJpg : !isPng) return 'The photo must be a JPG or PNG.'
  return { bytes, ext: m[1] === 'jpeg' ? 'jpg' : 'png' }
}

export interface OnboardingDeps { config: Config; messenger: Messenger; otpSecret: string; emailDomainOk?: (email: string) => Promise<boolean> }

export function onboardingRoutes(deps: OnboardingDeps) {
  const { config, messenger, otpSecret, emailDomainOk = emailDomainCanReceive } = deps
  return async function routes(app: FastifyInstance): Promise<void> {
    // only signed-in MARS staff can send codes or create shops
    app.addHook('onRequest', requirePermission(otpSecret, 'onboard'))
    const needDb = (reply: FastifyReply): Db | null => {
      if (!app.database) { void fail(reply, 503, 'The database is not connected. Set MONGODB_URI and restart the server.'); return null }
      return app.database.db
    }

    // POST /v1/onboarding/otp: send a 6-digit code to the mobile (WhatsApp) or the email
    app.post('/v1/onboarding/otp', async (req, reply) => {
      const db = needDb(reply); if (!db) return reply
      const p = OtpBody.safeParse(req.body); if (!p.success) return invalid(reply, p.error)
      const { channel, target } = p.data

      if (channel === 'email' && !(await emailDomainOk(target))) return fail(reply, 400, 'This email address cannot receive mail. Check the part after the @.', { target: 'Check the email domain.' })
      const taken = await db.collection('owners').findOne({ [channel]: target })
      if (taken) return fail(reply, 409, channel === 'mobile' ? 'This mobile number already belongs to a shop owner.' : 'This email already belongs to a shop owner.', { target: 'Already registered.' })

      const otps = db.collection('otp_verifications')
      const last = await otps.findOne({ channel, target }, { sort: { createdAt: -1 } })
      if (last && Date.now() - last['createdAt'].getTime() < RESEND_SECONDS * 1000) return fail(reply, 429, `Wait ${RESEND_SECONDS} seconds before asking for another code.`)
      if (await otps.countDocuments({ channel, target, createdAt: { $gt: minutes(-60) } }) >= MAX_CODES_PER_HOUR) return fail(reply, 429, 'Too many codes were requested. Try again in an hour.')

      const code = newCode()
      const now = new Date()
      const { insertedId } = await otps.insertOne({ channel, target, codeHash: hashCode(otpSecret, channel, target, code), attempts: 0, expiresAt: minutes(CODE_MINUTES), createdAt: now })
      try {
        await messenger.sendCode(channel, target, code)
      } catch (e) {
        await otps.deleteOne({ _id: insertedId })
        req.log.error({ channel, err: e instanceof Error ? e.message : String(e) }, 'could not send the verification code')
        return fail(reply, 502, channel === 'mobile' ? 'The code could not be sent on WhatsApp. Check the number and try again.' : 'The code could not be emailed. Check the address and try again.')
      }
      return { sent: true, expiresInMinutes: CODE_MINUTES }
    })

    // POST /v1/onboarding/verify: check the code
    app.post('/v1/onboarding/verify', async (req, reply) => {
      const db = needDb(reply); if (!db) return reply
      const p = VerifyBody.safeParse(req.body); if (!p.success) return invalid(reply, p.error)
      const { channel, target, code } = p.data

      const otps = db.collection('otp_verifications')
      const doc = await otps.findOne({ channel, target }, { sort: { createdAt: -1 } })
      if (!doc || doc['expiresAt'] <= new Date()) return fail(reply, 400, 'This code has expired. Send a new code.')
      if (doc['verifiedAt']) return { verified: true }
      if (doc['attempts'] >= MAX_CODE_ATTEMPTS) return fail(reply, 429, 'Too many wrong codes. Send a new code.')
      if (!safeEqual(doc['codeHash'], hashCode(otpSecret, channel, target, code))) {
        await otps.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } })
        return fail(reply, 400, 'That code is not right. Check it and try again.')
      }
      await otps.updateOne({ _id: doc._id }, { $set: { verifiedAt: new Date(), expiresAt: minutes(VERIFIED_MINUTES) } })
      return { verified: true }
    })

    // POST /v1/onboarding/submit: save shop + owner, create the activation key, email it to the owner
    app.post('/v1/onboarding/submit', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
      const db = needDb(reply); if (!db) return reply
      const p = SubmitBody.safeParse(req.body); if (!p.success) return invalid(reply, p.error)
      const b = p.data
      if (!(await loadPlans(db)).some((x) => x.key === b.plan)) return fail(reply, 400, 'Choose one of the listed plans.', { plan: 'Choose one of the listed plans.' })

      let photo: { bytes: Buffer; ext: 'jpg' | 'png' } | undefined
      if (b.photo) {
        const d = decodePhoto(b.photo)
        if (typeof d === 'string') return fail(reply, 400, d, { photo: d })
        photo = d
      }

      // the email must have been verified here, recently (the mobile number is not verified: the activation key is sent to it on WhatsApp)
      const otps = db.collection('otp_verifications')
      const now = new Date()
      for (const [channel, target] of [['email', b.email]] as const) {
        const v = await otps.findOne({ channel, target, verifiedAt: { $exists: true }, expiresAt: { $gt: now } })
        if (!v) return fail(reply, 400, 'Verify the email first.', { [channel]: 'Not verified.' })
      }

      const dup = async (coll: string, filter: Record<string, unknown>) => (await db.collection(coll).findOne(filter)) !== null
      if (await dup('owners', { mobile: b.mobile })) return fail(reply, 409, 'This mobile number already belongs to a shop owner.', { mobile: 'Already registered.' })
      if (await dup('owners', { email: b.email })) return fail(reply, 409, 'This email already belongs to a shop owner.', { email: 'Already registered.' })
      if (b.gstin && await dup('shops', { gstin: b.gstin })) return fail(reply, 409, 'A shop with this GST number already exists.', { gstin: 'Already registered.' })

      const tenantId = randomUUID()
      const key = newActivationKey()
      const passwordHash = await hashPassword(b.password)
      const photoKey = photo ? `owners/${tenantId}.${photo.ext}` : undefined
      const created: Array<[string, Record<string, unknown>]> = []
      const undo = async () => { for (const [c, f] of created.reverse()) await db.collection(c).deleteOne(f).catch(() => undefined) }

      try {
        if (photo && photoKey) {
          await mkdir(join(resolve(config.UPLOAD_DIR), 'owners'), { recursive: true })
          await writeFile(join(resolve(config.UPLOAD_DIR), photoKey), photo.bytes)
        }
        await db.collection('shops').insertOne({
          tenantId, name: b.shopName, ...(b.description ? { description: b.description } : {}), contactNumber: b.contactNumber,
          ...(b.gstin ? { gstin: b.gstin } : {}),
          address: { line: b.address, city: b.city, state: GST_STATES[b.stateCode]!, stateCode: b.stateCode, pincode: b.pincode },
          status: 'pending', plan: b.plan, mode: b.mode, counters: b.counters, createdAt: now, updatedAt: now
        })
        created.push(['shops', { tenantId }])
        await db.collection('owners').insertOne({
          tenantId, fullName: b.fullName, mobile: b.mobile, email: b.email, emailVerifiedAt: now,
          passwordHash, ...(photoKey ? { photoKey } : {}), createdAt: now, updatedAt: now
        })
        created.push(['owners', { tenantId }])
        await db.collection('activation_keys').insertOne({
          key, tenantId, mobile: b.mobile, status: 'issued', whatsapp: { status: 'queued' }, licenceDays: b.days, issuedAt: now, expiresAt: new Date(now.getTime() + KEY_VALID_DAYS * 86_400_000)
        })
        created.push(['activation_keys', { key }])
      } catch (e) {
        await undo()
        if (photoKey) await unlink(join(resolve(config.UPLOAD_DIR), photoKey)).catch(() => undefined)
        if (isDuplicate(e)) return fail(reply, 409, 'This owner or shop is already registered.')
        throw e
      }

      await otps.deleteMany({ channel: 'email', target: b.email })
      await db.collection('audit_log').insertOne({ tenantId, action: 'shop_onboarded', at: now, by: sessionOf(otpSecret, req)?.name ?? 'Staff', details: { shop: b.shopName, plan: b.plan } })

      // the key goes to the owner's verified email (WhatsApp later); if that fails the shop is still saved and staff can resend
      let whatsapp: { status: 'sent' | 'failed'; error?: string }
      try {
        const sent = await messenger.sendActivationKeyEmail(b.email, b.shopName, key)
        whatsapp = { status: 'sent' }
        await db.collection('activation_keys').updateOne({ key }, { $set: { whatsapp: { status: 'sent', ...(sent.messageId ? { messageId: sent.messageId } : {}), sentAt: new Date() } } })
      } catch (e) {
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 200)
        req.log.error({ tenantId, err: error }, 'could not email the activation key')
        whatsapp = { status: 'failed', error }
        await db.collection('activation_keys').updateOne({ key }, { $set: { whatsapp: { status: 'failed', error } } })
      }
      return reply.code(201).send({ tenantId, key, whatsapp })
    })
  }
}
