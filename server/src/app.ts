import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Config } from './config.js'
import type { Database } from './db.js'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSigner, type LicenceSigner } from './lib/licence.js'
import { makeMessenger, type Messenger } from './lib/messenger.js'
import { activateRoutes } from './routes/activate.js'
import { adminRoutes } from './routes/admin.js'
import { onboardingRoutes } from './routes/onboarding.js'
import { healthRoutes } from './routes/health.js'
import { pinResetRoutes } from './routes/pinreset.js'
import { plannedRoutes } from './routes/planned.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** null when MONGODB_URI is not set */
    database: Database | null
  }
}

/** Builds the server without starting it, so tests can call it with app.inject(). */
export interface AppOptions { messenger?: Messenger; signer?: LicenceSigner | null; emailDomainOk?: (email: string) => Promise<boolean> }

export async function buildApp(config: Config, database: Database | null = null, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env['NODE_ENV'] === 'test' ? false : { level: 'info' } })
  app.decorate('database', database)
  await app.register(cors, { origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()) })
  await app.register(healthRoutes)
  const messenger = options.messenger ?? makeMessenger(config)
  const signer = options.signer !== undefined ? options.signer : config.LICENCE_PRIVATE_KEY_FILE ? loadSigner(resolve(fileURLToPath(new URL('../../', import.meta.url)), config.LICENCE_PRIVATE_KEY_FILE)) : null
  // one secret for one-time codes and staff sessions (random per run when OTP_SECRET is not set: sessions then end on restart)
  const secret = config.OTP_SECRET ?? randomBytes(32).toString('hex')
  await app.register(adminRoutes(secret, process.env['NODE_ENV'] === 'production'))
  await app.register(onboardingRoutes({ config, messenger, otpSecret: secret, ...(options.emailDomainOk ? { emailDomainOk: options.emailDomainOk } : {}) }))
  await app.register(activateRoutes(config, signer))
  await app.register(pinResetRoutes({ config, messenger, secret }))
  await app.register(plannedRoutes)
  return app
}
