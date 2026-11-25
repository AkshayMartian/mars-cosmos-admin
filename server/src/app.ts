import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Config } from './config.js'
import type { Database } from './db.js'
import { healthRoutes } from './routes/health.js'
import { plannedRoutes } from './routes/planned.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** null when MONGODB_URI is not set */
    database: Database | null
  }
}

/** Builds the server without starting it, so tests can call it with app.inject(). */
export async function buildApp(config: Config, database: Database | null = null): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env['NODE_ENV'] === 'test' ? false : { level: 'info' } })
  app.decorate('database', database)
  await app.register(cors, { origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()) })
  await app.register(healthRoutes)
  await app.register(plannedRoutes)
  return app
}
