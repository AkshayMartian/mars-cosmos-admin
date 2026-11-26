import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { hashPassword } from '../lib/secrets.js'
import { requirePermission, sessionOf } from './admin.js'

const ROLES = ['Admin', 'Support', 'Sales'] as const
const email = z.string().trim().toLowerCase().max(120).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Type a valid email address.')
const password = z.string().min(8, 'The password needs at least 8 characters.').max(200)

const Add = z.object({
  name: z.string().trim().min(2, 'The name needs at least 2 characters.').max(80, 'The name is too long.'),
  email,
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Choose Admin, Support or Sales.' }) }),
  password
})
const Change = z.object({
  name: z.string().trim().min(2, 'The name needs at least 2 characters.').max(80).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: password.optional()
}).refine((b) => Object.keys(b).length > 0, 'Nothing to change.')

type Member = { name: string; email: string; role: string; active: boolean; lastLoginAt: string | null; createdAt: string | null }
const view = (u: Record<string, any>): Member => ({
  name: u['name'], email: u['email'], role: u['role'], active: !!u['active'],
  lastLoginAt: u['lastLoginAt'] ? (u['lastLoginAt'] as Date).toISOString() : null,
  createdAt: u['createdAt'] ? (u['createdAt'] as Date).toISOString() : null
})

/** GET, POST /v1/admin/team and PUT /v1/admin/team/:email: only roles with the `team` permission (Admin). Staff live in `admin_users`, the same collection sign-in uses. */
export function teamRoutes(secret: string) {
  return async function routes(app: FastifyInstance): Promise<void> {
    const staff = { preHandler: requirePermission(secret, 'team') }
    const list = async () => {
      const docs = await app.database!.db.collection('admin_users').find({}).toArray()
      return docs.map(view).sort((a, b) => Number(b.active) - Number(a.active) || ROLES.indexOf(a.role as never) - ROLES.indexOf(b.role as never) || a.name.localeCompare(b.name))
    }

    app.get('/v1/admin/team', staff, async (_req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      return { team: await list() }
    })

    app.post('/v1/admin/team', staff, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const who = sessionOf(secret, req)!
      const p = Add.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? 'Check the values.' })
      const users = app.database.db.collection('admin_users')
      if (await users.findOne({ email: p.data.email })) return reply.code(409).send({ error: 'A team member with this email already exists.' })
      const now = new Date()
      await users.insertOne({ email: p.data.email, name: p.data.name, role: p.data.role, passwordHash: await hashPassword(p.data.password), active: true, failedLogins: 0, createdAt: now, updatedAt: now })
      await app.database.db.collection('audit_log').insertOne({ action: 'team_member_added', at: now, by: who.name, details: { name: p.data.name, role: p.data.role } })
      return reply.code(201).send({ team: await list() })
    })

    app.put<{ Params: { email: string } }>('/v1/admin/team/:email', staff, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const who = sessionOf(secret, req)!
      const p = Change.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? 'Check the values.' })
      const db = app.database.db
      const users = db.collection('admin_users')
      const target = decodeURIComponent(req.params.email).toLowerCase()
      const found = await users.findOne({ email: target })
      if (!found) return reply.code(404).send({ error: 'No such team member.' })
      const before = { ...found }
      const self = target === who.email.toLowerCase()
      if (self && (p.data.active === false || (p.data.role && p.data.role !== 'Admin'))) return reply.code(400).send({ error: 'You cannot switch off or lower your own access. Ask another Admin.' })
      // there must always be at least one active Admin, or nobody could manage the team again
      const losesAdmin = before['role'] === 'Admin' && before['active'] && (p.data.active === false || (p.data.role && p.data.role !== 'Admin'))
      if (losesAdmin && (await users.countDocuments({ role: 'Admin', active: true })) <= 1) return reply.code(400).send({ error: 'This is the last active Admin. Make someone else Admin first.' })

      const set: Record<string, unknown> = { updatedAt: new Date() }
      if (p.data.name) set['name'] = p.data.name
      if (p.data.role) set['role'] = p.data.role
      if (p.data.active !== undefined) set['active'] = p.data.active
      if (p.data.password) { set['passwordHash'] = await hashPassword(p.data.password); set['failedLogins'] = 0 }
      await users.updateOne({ email: target }, { $set: set, ...(p.data.password ? { $unset: { lockedUntil: '' } } : {}) })

      const changes = [
        p.data.name && p.data.name !== before['name'] ? `name ${before['name']} → ${p.data.name}` : '',
        p.data.role && p.data.role !== before['role'] ? `role ${before['role']} → ${p.data.role}` : '',
        p.data.active !== undefined && p.data.active !== before['active'] ? (p.data.active ? 'switched on' : 'switched off') : '',
        p.data.password ? 'password reset' : ''
      ].filter(Boolean).join(', ')
      if (changes) await db.collection('audit_log').insertOne({ action: 'team_member_changed', at: new Date(), by: who.name, details: { name: p.data.name ?? before['name'], changes } })
      return { team: await list() }
    })
  }
}
