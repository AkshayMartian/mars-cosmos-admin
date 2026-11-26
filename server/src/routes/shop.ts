import type { FastifyInstance } from 'fastify'
import type { Messenger } from '../lib/messenger.js'
import { can } from '../lib/roles.js'
import { newActivationKey } from '../lib/secrets.js'
import { requirePermission, sessionOf } from './admin.js'
import { shopRows } from './dashboard.js'
import { KEY_VALID_DAYS } from './onboarding.js'

const DAY = 86_400_000
/** MARS-AB12-••••-•••• : enough to tell keys apart, not enough to use one. */
const maskKey = (k: string): string => k.slice(0, 10) + '••••-••••'

type KeyStatus = 'Waiting' | 'Activated' | 'Expired' | 'Cancelled'
const keyStatus = (k: Record<string, any>, now: number): KeyStatus =>
  k['status'] === 'activated' ? 'Activated' : k['status'] === 'revoked' ? 'Cancelled' : k['expiresAt'] && (k['expiresAt'] as Date).getTime() <= now ? 'Expired' : 'Waiting'

/**
 * One shop for the shop page: details, owner, activation keys and PCs.
 * Anyone who may see shops gets the page; the full key (and emailing / replacing it) needs the `onboard` permission (Admin, Sales).
 */
export function shopRoutes(secret: string, messenger: Messenger) {
  return async function routes(app: FastifyInstance): Promise<void> {
    const view = { preHandler: requirePermission(secret, 'shops') }
    const manage = { preHandler: requirePermission(secret, 'onboard') }

    const detail = async (tenantId: string, fullKeys: boolean) => {
      const db = app.database!.db
      const shop = await db.collection('shops').findOne({ tenantId })
      if (!shop) return null
      const now = Date.now()
      const [owner, keys, devices, row] = await Promise.all([
        db.collection('owners').findOne({ tenantId }),
        db.collection('activation_keys').find({ tenantId }).sort({ issuedAt: -1 }).toArray(),
        db.collection('devices').find({ tenantId }).toArray(),
        shopRows(db, now).then((rows) => rows.find((r) => r.tenantId === tenantId))
      ])
      return {
        tenantId, name: shop['name'], status: row?.status ?? 'Waiting', planName: row?.planName ?? shop['plan'], expires: row?.expires ?? null,
        contactNumber: shop['contactNumber'], gstin: shop['gstin'] ?? null, description: shop['description'] ?? null,
        address: shop['address'], mode: shop['mode'], counters: shop['counters'] ?? 1, createdAt: (shop['createdAt'] as Date | undefined)?.toISOString() ?? null,
        owner: owner ? { fullName: owner['fullName'], mobile: owner['mobile'], email: owner['email'] } : null,
        canManageKeys: fullKeys,
        keys: keys.map((k) => ({
          key: fullKeys ? (k['key'] as string) : maskKey(k['key']), status: keyStatus(k, now),
          issuedAt: (k['issuedAt'] as Date).toISOString(), expiresAt: k['expiresAt'] ? (k['expiresAt'] as Date).toISOString() : null,
          activatedAt: k['activatedAt'] ? (k['activatedAt'] as Date).toISOString() : null, machineId: (k['machineId'] as string | undefined) ?? null,
          licenceDays: (k['licenceDays'] as number | undefined) ?? null, licenceExpires: (k['licenceExpires'] as string | undefined) ?? null,
          emailed: k['whatsapp']?.['status'] === 'sent' ? 'sent' : k['whatsapp']?.['status'] === 'failed' ? 'failed' : null
        })),
        devices: devices.map((d) => ({
          machineId: d['machineId'] as string, activatedAt: (d['activatedAt'] as Date).toISOString(),
          lastCheckAt: d['lastCheckAt'] ? (d['lastCheckAt'] as Date).toISOString() : null, released: !!d['releasedAt']
        }))
      }
    }
    const roleOf = async (req: Parameters<typeof sessionOf>[1]) => {
      const s = sessionOf(secret, req)!
      const u = await app.database!.db.collection('admin_users').findOne({ email: s.email })
      return { name: (u?.['name'] as string | undefined) ?? s.name, role: (u?.['role'] as string | undefined) ?? s.role }
    }

    // GET /v1/admin/shops/:tenantId
    app.get<{ Params: { tenantId: string } }>('/v1/admin/shops/:tenantId', view, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const d = await detail(req.params.tenantId, can((await roleOf(req)).role, 'onboard'))
      return d ?? reply.code(404).send({ error: 'No such shop.' })
    })

    // POST /v1/admin/shops/:tenantId/key/resend: email the current key to the owner again
    app.post<{ Params: { tenantId: string } }>('/v1/admin/shops/:tenantId/key/resend', manage, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const db = app.database.db
      const { tenantId } = req.params
      const [shop, owner] = await Promise.all([db.collection('shops').findOne({ tenantId }), db.collection('owners').findOne({ tenantId })])
      if (!shop || !owner) return reply.code(404).send({ error: 'No such shop.' })
      const now = new Date()
      const k = await db.collection('activation_keys').findOne({ tenantId, status: 'issued', expiresAt: { $gt: now } }, { sort: { issuedAt: -1 } })
      if (!k) return reply.code(409).send({ error: 'There is no unused key to send. Issue a new key.' })
      try {
        await messenger.sendActivationKeyEmail(owner['email'], shop['name'], k['key'])
      } catch (e) {
        return reply.code(502).send({ error: 'The email could not be sent: ' + (e instanceof Error ? e.message : String(e)).slice(0, 150) })
      }
      await db.collection('activation_keys').updateOne({ key: k['key'] }, { $set: { whatsapp: { status: 'sent', sentAt: now } } })
      await db.collection('audit_log').insertOne({ tenantId, action: 'key_emailed', at: now, by: (await roleOf(req)).name, details: { key: maskKey(k['key']) } })
      return detail(tenantId, true)
    })

    // POST /v1/admin/shops/:tenantId/key/new: a fresh key, emailed to the owner. Unused keys are cancelled;
    // a key already activated on a PC is left alone, so that PC keeps its licence.
    app.post<{ Params: { tenantId: string } }>('/v1/admin/shops/:tenantId/key/new', manage, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const db = app.database.db
      const { tenantId } = req.params
      const [shop, owner] = await Promise.all([db.collection('shops').findOne({ tenantId }), db.collection('owners').findOne({ tenantId })])
      if (!shop || !owner) return reply.code(404).send({ error: 'No such shop.' })
      if (shop['status'] === 'suspended') return reply.code(409).send({ error: 'This shop is suspended. Switch it back on before issuing a key.' })
      const now = new Date()
      const last = await db.collection('activation_keys').findOne({ tenantId }, { sort: { issuedAt: -1 } })
      await db.collection('activation_keys').updateMany({ tenantId, status: 'issued' }, { $set: { status: 'revoked' } })
      const key = newActivationKey()
      await db.collection('activation_keys').insertOne({
        key, tenantId, mobile: owner['mobile'], status: 'issued', whatsapp: { status: 'queued' },
        licenceDays: (last?.['licenceDays'] as number | undefined) ?? 365, issuedAt: now, expiresAt: new Date(now.getTime() + KEY_VALID_DAYS * DAY)
      })
      const by = (await roleOf(req)).name
      await db.collection('audit_log').insertOne({ tenantId, action: 'key_issued', at: now, by, details: { key: maskKey(key) } })
      let emailed = true
      try {
        await messenger.sendActivationKeyEmail(owner['email'], shop['name'], key)
        await db.collection('activation_keys').updateOne({ key }, { $set: { whatsapp: { status: 'sent', sentAt: new Date() } } })
      } catch (e) {
        emailed = false
        await db.collection('activation_keys').updateOne({ key }, { $set: { whatsapp: { status: 'failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 200) } } })
      }
      return { ...(await detail(tenantId, true)), emailed }
    })
  }
}
