import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { loadPlans } from '../lib/plans.js'
import { requirePermission, sessionOf } from './admin.js'

const Change = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  yearPrice: z.coerce.number().int().min(0).max(10_000_000).optional(),
  counters: z.coerce.number().int().min(1).max(50).optional()
}).refine((b) => Object.keys(b).length > 0, 'Nothing to change.')

const Add = z.object({
  name: z.string().trim().min(2, 'The plan name needs at least 2 characters.').max(40, 'The plan name is too long.'),
  yearPrice: z.coerce.number({ invalid_type_error: 'Type the price in whole rupees.' }).int('Type the price in whole rupees.').min(0, 'The price cannot be negative.').max(10_000_000, 'That price is too high.'),
  counters: z.coerce.number({ invalid_type_error: 'Counters must be a number.' }).int().min(1, 'A plan has at least 1 counter.').max(50, 'At most 50 counters.').default(1),
  includes: z.array(z.string().regex(/^[a-z0-9_]{2,30}$/)).max(20).default([])
})

/** "Family Pack" -> "family_pack": the short name a plan is stored and looked up by. */
const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20).replace(/_+$/, '') || 'plan'

/** GET /v1/admin/plans (any staff), POST /v1/admin/plans and PUT /v1/admin/plans/:key (Admin only): plans and their yearly prices, kept in MongoDB. */
export function planRoutes(secret: string) {
  return async function routes(app: FastifyInstance): Promise<void> {
    const view = { preHandler: requirePermission(secret, 'plans') }
    const edit = { preHandler: requirePermission(secret, 'plans.edit') }

    app.get('/v1/admin/plans', view, async (_req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      return { plans: await loadPlans(app.database.db) }
    })

    app.post('/v1/admin/plans', edit, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const who = sessionOf(secret, req)!
      const p = Add.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? 'Check the values.' })
      const db = app.database.db
      const existing = await loadPlans(db) // also makes sure the defaults exist
      if (existing.some((x) => x.name.toLowerCase() === p.data.name.toLowerCase())) return reply.code(409).send({ error: 'A plan with this name already exists.' })
      const base = slug(p.data.name)
      let key = base
      for (let n = 2; existing.some((x) => x.key === key); n++) key = base.slice(0, 20 - String(n).length - 1) + '_' + n // family_pack, family_pack_2, ...
      const now = new Date()
      await db.collection('plans').insertOne({ key, name: p.data.name, yearPrice: p.data.yearPrice, counters: p.data.counters, includes: p.data.includes, createdAt: now, updatedAt: now })
      await db.collection('audit_log').insertOne({ action: 'plan_added', at: now, by: who.name, details: { plan: p.data.name, changes: `price ${p.data.yearPrice}, counters ${p.data.counters}` } })
      return reply.code(201).send({ plans: await loadPlans(db), added: key })
    })

    app.put<{ Params: { key: string } }>('/v1/admin/plans/:key', edit, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const who = sessionOf(secret, req)!
      const p = Change.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? 'Check the values.' })
      const db = app.database.db
      await loadPlans(db) // make sure the defaults exist before editing one
      const found = await db.collection('plans').findOne({ key: req.params.key })
      if (!found) return reply.code(404).send({ error: 'No such plan.' })
      const before = { ...found }
      await db.collection('plans').updateOne({ key: req.params.key }, { $set: { ...p.data, updatedAt: new Date() } })
      const changes = Object.entries(p.data).map(([k, v]) => `${k}: ${String(before[k])} → ${String(v)}`).join(', ')
      await db.collection('audit_log').insertOne({ action: 'plan_changed', at: new Date(), by: who.name, details: { plan: before['name'], changes } })
      return { plans: await loadPlans(db) }
    })
  }
}
