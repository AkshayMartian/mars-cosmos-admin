import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Config } from '../config.js'
import { licenceDates, type LicenceSigner } from '../lib/licence.js'

const MAX_WRONG_MOBILE = 10
const BAD = 'The activation key or the mobile number is not valid. Check both and try again.'

const Body = z.object({
  key: z.string().transform((k) => k.trim().toUpperCase().replace(/\s+/g, '')).pipe(z.string().regex(/^MARS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)),
  // the app may send +91 98765 43210: keep the last 10 digits
  mobile: z.string().transform((m) => m.replace(/\D/g, '').slice(-10)).pipe(z.string().regex(/^[6-9]\d{9}$/)),
  machine: z.string().trim().min(8).max(128)
})

async function photoDataUrl(config: Config, photoKey: unknown): Promise<string | null> {
  if (typeof photoKey !== 'string' || !/^owners\/[\w-]+\.(jpg|png)$/.test(photoKey)) return null
  try {
    const bytes = await readFile(join(resolve(config.UPLOAD_DIR), photoKey))
    return `data:image/${photoKey.endsWith('.png') ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`
  } catch { return null }
}

/** POST /v1/activate: key + mobile + PC id -> signed licence and the shop profile (the app fills Settings → Shop from it). */
export function activateRoutes(config: Config, signer: LicenceSigner | null) {
  return async function routes(app: FastifyInstance): Promise<void> {
    app.post('/v1/activate', async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The MARS server is not ready yet. Try again later.' })
      if (!signer) return reply.code(503).send({ error: 'The MARS server cannot sign licences yet. Contact MARS support.' })
      const p = Body.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: BAD })
      const { key, mobile, machine } = p.data
      const db = app.database.db
      const keys = db.collection('activation_keys')

      const doc = await keys.findOne({ key })
      if (!doc) return reply.code(400).send({ error: BAD })
      if (doc['status'] === 'revoked') return reply.code(403).send({ error: 'This activation key has been cancelled. Contact MARS support.' })
      if ((doc['failedAttempts'] ?? 0) >= MAX_WRONG_MOBILE) return reply.code(429).send({ error: 'Too many wrong attempts with this key. Contact MARS support.' })
      if (doc['mobile'] !== mobile) {
        await keys.updateOne({ key }, { $inc: { failedAttempts: 1 } })
        return reply.code(400).send({ error: BAD })
      }
      const now = new Date()
      if (doc['status'] === 'issued' && doc['expiresAt'] && doc['expiresAt'] <= now) return reply.code(410).send({ error: 'This activation key has expired. Ask MARS support for a new one.' })
      if (doc['status'] === 'activated' && doc['machineId'] !== machine) return reply.code(409).send({ error: 'This key is already activated on another PC. Contact MARS support to move it.' })

      const tenantId = doc['tenantId'] as string
      const shop = await db.collection('shops').findOne({ tenantId })
      const owner = await db.collection('owners').findOne({ tenantId })
      if (!shop || !owner) return reply.code(500).send({ error: 'This shop record is incomplete. Contact MARS support.' })
      if (shop['status'] === 'suspended') return reply.code(403).send({ error: 'This shop is suspended. Contact MARS support.' })

      // first activation claims the key atomically (two PCs racing: one wins); the licence dates are fixed then, so re-activating the same PC gives the same dates
      let { licenceIssued, licenceExpires } = doc as { licenceIssued?: string; licenceExpires?: string }
      if (doc['status'] === 'issued') {
        const d = licenceDates(doc['licenceDays'] ?? 365, now)
        const claimed = await keys.findOneAndUpdate(
          { key, status: 'issued' },
          { $set: { status: 'activated', activatedAt: now, machineId: machine, licenceIssued: d.issued, licenceExpires: d.expires } }
        )
        if (!claimed) return reply.code(409).send({ error: 'This key was just activated on another PC. Contact MARS support.' })
        licenceIssued = d.issued; licenceExpires = d.expires
        await db.collection('shops').updateOne({ tenantId }, { $set: { status: 'active', updatedAt: now } })
        await db.collection('audit_log').insertOne({ tenantId, action: 'licence_activated', at: now, details: { key: key.slice(0, 9) + '••••-••••' } })
      }
      await db.collection('devices').updateOne({ tenantId, machineId: machine }, { $set: { key, lastCheckAt: now }, $setOnInsert: { activatedAt: now } }, { upsert: true })

      const licence = signer({
        v: 1, key, machine, shop: shop['name'], plan: shop['plan'], mode: shop['mode'], counters: shop['counters'] ?? 1,
        kind: 'full', expires: licenceExpires!, issued: licenceIssued!
      })
      return {
        licence,
        shop: { name: shop['name'], description: shop['description'] ?? '', contactNumber: shop['contactNumber'], gstin: shop['gstin'] ?? '', address: shop['address'] },
        // the email is not sent: it is only for the forgot-PIN link and is never shown in the app
        owner: { fullName: owner['fullName'], mobile: owner['mobile'], photo: await photoDataUrl(config, owner['photoKey']) }
      }
    })
  }
}
