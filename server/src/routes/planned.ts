import type { FastifyInstance } from 'fastify'

/**
 * The API contract, registered up front so every caller (the desktop app, the PIN-reset web page, the portal) sees the
 * same addresses today. Each answers 501 until it is built; the README tracks the order.
 * The desktop app (mars-pos-desktop) already calls the "app" endpoints.
 */
export const PLANNED: ReadonlyArray<{ method: 'GET' | 'POST'; url: string; who: 'app' | 'owner web page' | 'portal'; what: string }> = [
  { method: 'POST', url: '/v1/trial/otp', who: 'app', what: 'send the free-trial one-time code' },
  { method: 'POST', url: '/v1/trial/verify', who: 'app', what: 'code -> 14-day trial licence' }
]

export async function plannedRoutes(app: FastifyInstance): Promise<void> {
  for (const r of PLANNED) {
    app.route({
      method: r.method, url: r.url,
      handler: async (_req, reply) => reply.code(501).send({ error: 'This endpoint is planned and not built yet.', endpoint: `${r.method} ${r.url}`, purpose: r.what })
    })
  }
}
