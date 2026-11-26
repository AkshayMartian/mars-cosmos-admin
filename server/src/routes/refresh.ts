import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { LicenceSigner } from '../lib/licence.js'

const NOT_ACTIVATED = 'This PC is not activated with MARS. Contact MARS support.'

const Body = z.object({
  key: z.string().transform((k) => k.trim().toUpperCase()).pipe(z.string().regex(/^MARS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)),
  machine: z.string().trim().min(8).max(128)
})

/**
 * POST /v1/refresh: the app's check-in (weekly, and "Check with MARS now" in Settings → Licence).
 * Key + PC id -> a freshly signed licence built from what MongoDB holds now, so a renewal (new licenceExpires on the key),
 * a plan change or a renamed shop reaches the PC. Also records when the PC last checked in (dashboard "last seen").
 */
export function refreshRoutes(signer: LicenceSigner | null) {
  return async function routes(app: FastifyInstance): Promise<void> {
    app.post('/v1/refresh', async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The MARS server is not ready yet. Try again later.' })
      if (!signer) return reply.code(503).send({ error: 'The MARS server cannot sign licences yet. Contact MARS support.' })
      const p = Body.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: NOT_ACTIVATED })
      const { key, machine } = p.data
      const db = app.database.db

      const doc = await db.collection('activation_keys').findOne({ key })
      if (!doc) return reply.code(403).send({ error: NOT_ACTIVATED })
      if (doc['status'] === 'revoked') return reply.code(403).send({ error: 'This licence has been cancelled. Contact MARS support.' })
      if (doc['status'] !== 'activated' || doc['machineId'] !== machine) return reply.code(403).send({ error: 'This licence belongs to another PC. Contact MARS support.' })
      if (!doc['licenceIssued'] || !doc['licenceExpires']) return reply.code(500).send({ error: 'This licence record is incomplete. Contact MARS support.' })

      const tenantId = doc['tenantId'] as string
      const shop = await db.collection('shops').findOne({ tenantId })
      if (!shop) return reply.code(500).send({ error: 'This shop record is incomplete. Contact MARS support.' })
      if (shop['status'] === 'suspended') return reply.code(403).send({ error: 'This shop is suspended. Contact MARS support.' })

      const now = new Date()
      await db.collection('devices').updateOne({ tenantId, machineId: machine }, { $set: { key, lastCheckAt: now }, $setOnInsert: { activatedAt: now } }, { upsert: true })
      const licence = signer({
        v: 1, key, machine, shop: shop['name'], plan: shop['plan'], mode: shop['mode'], counters: shop['counters'] ?? 1,
        kind: 'full', expires: doc['licenceExpires'] as string, issued: doc['licenceIssued'] as string
      })
      return { licence, expires: doc['licenceExpires'] }
    })
  }
}
