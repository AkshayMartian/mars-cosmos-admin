import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actionsMatching, auditRow } from '../lib/audit.js'
import { requireStaff } from './admin.js'

const Query = z.object({
  q: z.string().trim().max(80).optional().default(''),
  /** time of the oldest row already shown: the next page is older than it */
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** GET /v1/admin/audit: the audit log, newest first, 50 at a time; `q` searches who, action and shop. */
export function auditRoutes(secret: string) {
  return async function routes(app: FastifyInstance): Promise<void> {
    app.get('/v1/admin/audit', { preHandler: requireStaff(secret) }, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const p = Query.safeParse(req.query)
      if (!p.success) return reply.code(400).send({ error: 'Check the search.' })
      const { q, before, limit } = p.data
      const db = app.database.db
      const shops = await db.collection('shops').find({}).toArray()
      const name = new Map(shops.map((s) => [s['tenantId'] as string, s['name'] as string]))

      const filter: Record<string, unknown> = {}
      if (q) {
        const re = new RegExp(escape(q), 'i')
        filter['$or'] = [
          { by: { $regex: re } },
          { action: { $in: actionsMatching(q) } },
          { tenantId: { $in: shops.filter((s) => re.test(s['name'])).map((s) => s['tenantId']) } },
          { 'details.name': { $regex: re } },
          { 'details.plan': { $regex: re } }
        ]
      }
      const where = before ? (q ? { $and: [filter, { at: { $lt: new Date(before) } }] } : { at: { $lt: new Date(before) } }) : filter
      // one extra row tells whether there is another page
      const docs = await db.collection('audit_log').find(where).sort({ at: -1 }).limit(limit + 1).toArray()
      return { entries: docs.slice(0, limit).map((a) => auditRow(a, (t) => name.get(t))), more: docs.length > limit }
    })
  }
}
