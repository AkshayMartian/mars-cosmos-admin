import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { can, ROLE_PERMISSIONS, type Permission, type Role } from '../lib/roles.js'
import { hashPassword, verifyPassword } from '../lib/secrets.js'

const COOKIE = 'mars_admin'
const SESSION_HOURS = 8
const MAX_FAILS = 5
const LOCK_MINUTES = 15

export interface Session { email: string; name: string; role: 'Admin' | 'Support' | 'Sales' }

/** `<payload>.<signature>`: the session is signed (HMAC-SHA256), so it cannot be forged or edited, and carries its own expiry. */
export function makeSessionToken(secret: string, s: Session, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: now + SESSION_HOURS * 3_600_000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}

export function readSessionToken(secret: string, token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const good = createHmac('sha256', secret).update(payload).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== good.length || !timingSafeEqual(given, good)) return null
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session & { exp: number }
    return p.exp > now ? { email: p.email, name: p.name, role: p.role } : null
  } catch { return null }
}

const cookieOf = (req: FastifyRequest): string | undefined => /(?:^|;\s*)mars_admin=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]

/** The signed-in staff member, or null. */
export const sessionOf = (secret: string, req: FastifyRequest): Session | null => readSessionToken(secret, cookieOf(req))

/**
 * The signed-in member as stored now: name and role come from the database, so a change on the Team page applies at once
 * (the session cookie only proves who they are). Null when not signed in or switched off.
 */
async function currentStaff(secret: string, req: FastifyRequest): Promise<{ session: Session; off: boolean } | null> {
  const s = sessionOf(secret, req)
  if (!s) return null
  const u = await req.server.database?.db.collection('admin_users').findOne({ email: s.email })
  if (!u) return { session: s, off: false }
  return { session: { email: s.email, name: u['name'], role: u['role'] }, off: !u['active'] }
}

/** Use as a route `preHandler`: 401 unless a staff member is signed in (and switched on); 403 unless their role has `permission`. */
export const requirePermission = (secret: string, permission: Permission | null) => async (req: FastifyRequest, reply: FastifyReply) => {
  const who = await currentStaff(secret, req)
  if (!who) return reply.code(401).send({ error: 'Sign in first.' })
  // a member switched off on the Team page loses access at once, not when their 8-hour session runs out
  if (who.off) return reply.code(401).send({ error: 'Your access has been switched off. Ask an Admin.' })
  if (permission && !can(who.session.role, permission)) return reply.code(403).send({ error: `Your role (${who.session.role}) cannot do this. Ask an Admin.` })
}

/** Any signed-in staff member, whatever the role. */
export const requireStaff = (secret: string) => requirePermission(secret, null)

const Body = z.object({ email: z.string().trim().toLowerCase().max(120), password: z.string().min(1).max(200) })
const BAD = 'The email or password is not right.'
// compared against when the email is unknown, so an unknown email takes as long as a wrong password
const dummyHash = hashPassword('not-a-real-password')

export function adminRoutes(secret: string, production: boolean) {
  const cookie = (value: string, maxAge: number) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${production ? '; Secure' : ''}`
  return async function routes(app: FastifyInstance): Promise<void> {
    // POST /v1/admin/login
    app.post('/v1/admin/login', async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const p = Body.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: BAD })
      const users = app.database.db.collection('admin_users')
      const u = await users.findOne({ email: p.data.email })
      if (u?.['lockedUntil'] && u['lockedUntil'] > new Date()) return reply.code(429).send({ error: `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.` })
      const ok = await verifyPassword(p.data.password, u ? u['passwordHash'] : await dummyHash)
      if (!u || !ok || !u['active']) {
        if (u) {
          const fails = (u['failedLogins'] ?? 0) + 1
          await users.updateOne({ _id: u._id }, { $set: fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: fails } })
        }
        return reply.code(401).send({ error: BAD })
      }
      await users.updateOne({ _id: u._id }, { $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: '' } })
      const s: Session = { email: u['email'], name: u['name'], role: u['role'] }
      reply.header('set-cookie', cookie(makeSessionToken(secret, s), SESSION_HOURS * 3600))
      return { ...s, can: ROLE_PERMISSIONS[s.role] ?? [] }
    })

    // GET /v1/admin/me: who is signed in (the web app asks this on every page load)
    // with the role's permissions, so the web app shows only what this member may use
    app.get('/v1/admin/me', async (req, reply) => {
      const who = await currentStaff(secret, req)
      if (!who || who.off) return reply.code(401).send({ error: who?.off ? 'Your access has been switched off. Ask an Admin.' : 'Sign in first.' })
      return { ...who.session, can: ROLE_PERMISSIONS[who.session.role as Role] ?? [] }
    })

    // POST /v1/admin/logout
    app.post('/v1/admin/logout', async (_req, reply) => {
      reply.header('set-cookie', cookie('', 0))
      return { ok: true }
    })
  }
}
