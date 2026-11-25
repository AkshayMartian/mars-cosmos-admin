import type { FastifyInstance } from 'fastify'

/**
 * The API contract, registered up front so every caller (the desktop app, the PIN-reset web page, the portal) sees the
 * same addresses today. Each answers 501 until it is built; the README tracks the order.
 * The desktop app (mars-pos-desktop) already calls the "app" endpoints.
 */
export const PLANNED: ReadonlyArray<{ method: 'GET' | 'POST'; url: string; who: 'app' | 'owner web page' | 'portal'; what: string }> = [
  { method: 'POST', url: '/v1/activate', who: 'app', what: 'key + mobile + PC id -> signed licence and the shop profile' },
  { method: 'POST', url: '/v1/refresh', who: 'app', what: 'weekly check: renewed licence, pending PIN hash' },
  { method: 'POST', url: '/v1/trial/otp', who: 'app', what: 'send the free-trial one-time code' },
  { method: 'POST', url: '/v1/trial/verify', who: 'app', what: 'code -> 14-day trial licence' },
  { method: 'POST', url: '/v1/pin-reset/request', who: 'app', what: 'owner forgot PIN: create the token, email the link' },
  { method: 'GET', url: '/v1/pin-reset/status', who: 'app', what: 'is the new PIN ready? returns the hash once' },
  { method: 'POST', url: '/v1/pin-reset/applied', who: 'app', what: 'the PC saved the PIN; delete the hand-off' },
  { method: 'GET', url: '/v1/pin-reset/validate', who: 'owner web page', what: 'is this link valid, unused and unexpired?' },
  { method: 'POST', url: '/v1/pin-reset/complete', who: 'owner web page', what: 'new PIN -> hash it, store it, mark the token used' },
  { method: 'POST', url: '/v1/onboarding/otp', who: 'portal', what: 'send a mobile or email verification code' },
  { method: 'POST', url: '/v1/onboarding/verify', who: 'portal', what: 'check the code' },
  { method: 'POST', url: '/v1/onboarding/submit', who: 'portal', what: 'create shop + owner + activation key, send the key on WhatsApp' },
  { method: 'POST', url: '/v1/admin/login', who: 'portal', what: 'staff sign-in (password + mobile code)' },
  { method: 'GET', url: '/v1/admin/shops', who: 'portal', what: 'shops list' }
]

export async function plannedRoutes(app: FastifyInstance): Promise<void> {
  for (const r of PLANNED) {
    app.route({
      method: r.method, url: r.url,
      handler: async (_req, reply) => reply.code(501).send({ error: 'This endpoint is planned and not built yet.', endpoint: `${r.method} ${r.url}`, purpose: r.what })
    })
  }
}
