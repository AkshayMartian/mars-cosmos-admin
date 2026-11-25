import type { FastifyInstance } from 'fastify'

/** GET /health: is the server up, and is the database reachable? Used by the web app's status chip and by monitoring. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    let database: 'ok' | 'down' | 'not configured' = 'not configured'
    if (app.database) {
      try { await app.database.db.command({ ping: 1 }); database = 'ok' } catch { database = 'down' }
    }
    return { ok: true, service: 'mars-admin-server', database, time: new Date().toISOString() }
  })
}
