import type { FastifyInstance } from 'fastify'
import { auditRow } from '../lib/audit.js'
import { loadPlans } from '../lib/plans.js'
import { requireStaff } from './admin.js'

const DAY = 86_400_000
const OFFLINE_DAYS = 7
const RENEW_DAYS = 30

/** End of the inclusive licence day `YYYY-MM-DD`, in ms. */
const endOfDay = (ymd: string): number => new Date(ymd + 'T23:59:59.999Z').getTime()

type Status = 'Active' | 'Expiring' | 'Expired' | 'Suspended' | 'Waiting'

/** One row per shop with its owner, licence expiry, last contact and status, read from the database. */
async function shopRows(db: import('mongodb').Db, now: number) {
  const [shops, owners, keys, devices, plans] = await Promise.all([
    db.collection('shops').find({}).toArray(),
    db.collection('owners').find({}).toArray(),
    db.collection('activation_keys').find({ status: 'activated' }).toArray(),
    db.collection('devices').find({}).toArray(),
    loadPlans(db)
  ])
  const plan = new Map(plans.map((p) => [p.key, p]))
  const owner = new Map(owners.map((o) => [o['tenantId'] as string, o]))
  // latest licence expiry per shop (a shop can have more than one activated key)
  const expiry = new Map<string, string>()
  for (const k of keys) {
    const e = k['licenceExpires'] as string | undefined
    if (e && (!expiry.has(k['tenantId']) || e > expiry.get(k['tenantId'])!)) expiry.set(k['tenantId'], e)
  }
  // last contact per shop from any of its PCs that is still in use
  const lastSeen = new Map<string, number>()
  const pcs = new Map<string, number>()
  for (const d of devices) {
    if (d['releasedAt']) continue
    pcs.set(d['tenantId'], (pcs.get(d['tenantId']) ?? 0) + 1)
    const t = (d['lastCheckAt'] as Date | undefined)?.getTime()
    if (t && t > (lastSeen.get(d['tenantId']) ?? 0)) lastSeen.set(d['tenantId'], t)
  }
  return shops.map((s) => {
    const t = s['tenantId'] as string
    const exp = expiry.get(t) ?? null
    const left = exp ? endOfDay(exp) - now : null
    const status: Status = s['status'] === 'suspended' ? 'Suspended' : s['status'] === 'pending' ? 'Waiting'
      : left !== null && left < 0 ? 'Expired' : left !== null && left < RENEW_DAYS * DAY ? 'Expiring' : 'Active'
    const o = owner.get(t)
    const seen = lastSeen.get(t)
    return {
      tenantId: t, name: s['name'] as string, plan: s['plan'] as string, planName: plan.get(s['plan'])?.name ?? String(s['plan']), yearPrice: plan.get(s['plan'])?.yearPrice ?? 0, city: (s['address']?.['city'] as string | undefined) ?? '',
      owner: (o?.['fullName'] as string | undefined) ?? '', mobile: (o?.['mobile'] as string | undefined) ?? '',
      expires: exp, daysLeft: left === null ? null : Math.ceil(left / DAY), pcs: pcs.get(t) ?? 0,
      lastSeen: seen ? new Date(seen).toISOString() : null,
      offline: !!seen && now - seen > OFFLINE_DAYS * DAY && status !== 'Suspended',
      status, createdAt: (s['createdAt'] as Date | undefined)?.toISOString() ?? null
    }
  })
}

/** GET /v1/admin/dashboard: the home page figures, computed from the database. */
export function dashboardRoutes(secret: string) {
  return async function routes(app: FastifyInstance): Promise<void> {
    // GET /v1/admin/shops: every shop, newest first (the web page filters and searches them)
    app.get('/v1/admin/shops', { preHandler: requireStaff(secret) }, async (_req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const rows = await shopRows(app.database.db, Date.now())
      return { shops: rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')) }
    })

    app.get('/v1/admin/dashboard', { preHandler: requireStaff(secret) }, async (_req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const db = app.database.db
      const [rows, audit] = await Promise.all([shopRows(db, Date.now()), db.collection('audit_log').find({}).sort({ at: -1 }).limit(8).toArray()])
      const name = new Map(rows.map((r) => [r.tenantId, r.name]))
      const live = rows.filter((r) => r.status === 'Active' || r.status === 'Expiring')
      return {
        total: rows.length,
        active: live.length,
        pending: rows.filter((r) => r.status === 'Waiting').length,
        suspended: rows.filter((r) => r.status === 'Suspended').length,
        expired: rows.filter((r) => r.status === 'Expired').length,
        // yearly price of every shop with a valid licence, at today's prices from the plans collection
        yearValue: live.reduce((a, r) => a + r.yearPrice, 0),
        renewSoon: rows.filter((r) => r.status === 'Expiring').sort((a, b) => a.expires!.localeCompare(b.expires!))
          .map((r) => ({ tenantId: r.tenantId, name: r.name, plan: r.planName, expires: r.expires!, daysLeft: Math.max(0, r.daysLeft!) })),
        offline: rows.filter((r) => r.offline).sort((a, b) => a.lastSeen!.localeCompare(b.lastSeen!))
          .map((r) => ({ tenantId: r.tenantId, name: r.name, lastSeen: r.lastSeen!, mobile: r.mobile })),
        recent: audit.map((a) => auditRow(a, (t) => name.get(t)))
      }
    })
  }
}
