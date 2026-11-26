import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createInvoice } from '../lib/invoices.js'
import { requirePermission, sessionOf } from './admin.js'

const METHODS = ['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Card'] as const

const NewBody = z.object({
  tenantId: z.string().min(8, 'Choose a shop.'),
  amount: z.coerce.number({ invalid_type_error: 'Type the amount in whole rupees.' }).int('Type the amount in whole rupees.').min(1, 'The amount must be at least ₹1.').max(10_000_000, 'That amount is too high.'),
  description: z.string().trim().min(2, 'Say what the invoice is for.').max(120, 'The description is too long.'),
  dueDays: z.coerce.number().int().min(0).max(365).default(15)
})
const PaidBody = z.object({
  method: z.enum(METHODS, { errorMap: () => ({ message: 'Choose how it was paid.' }) }),
  reference: z.string().trim().max(80, 'The reference is too long.').optional().default(''),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the payment date.').optional()
})

type Status = 'Paid' | 'Due' | 'Overdue' | 'Cancelled'

/** Invoices and payments (Admin only, `payments` permission). Invoices are created at onboarding and by staff here. */
export function paymentRoutes(secret: string) {
  return async function routes(app: FastifyInstance): Promise<void> {
    const guard = { preHandler: requirePermission(secret, 'payments') }

    const list = async () => {
      const db = app.database!.db
      const [invoices, shops] = await Promise.all([db.collection('invoices').find({}).sort({ issuedAt: -1, no: -1 }).toArray(), db.collection('shops').find({}).toArray()])
      const name = new Map(shops.map((s) => [s['tenantId'] as string, s['name'] as string]))
      const now = Date.now()
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
      const rows = invoices.map((i) => {
        const status: Status = i['status'] === 'paid' ? 'Paid' : i['status'] === 'cancelled' ? 'Cancelled' : (i['dueAt'] as Date).getTime() < now ? 'Overdue' : 'Due'
        return {
          id: i['id'] as string, no: i['no'] as string, tenantId: i['tenantId'] as string, shop: name.get(i['tenantId']) ?? '—',
          amount: i['amount'] as number, description: (i['description'] as string | undefined) ?? '', status,
          issuedAt: (i['issuedAt'] as Date).toISOString(), dueAt: (i['dueAt'] as Date).toISOString(),
          paidAt: i['paidAt'] ? (i['paidAt'] as Date).toISOString() : null, method: (i['method'] as string | undefined) ?? null, reference: (i['reference'] as string | undefined) ?? null
        }
      })
      const sum = (r: typeof rows) => r.reduce((a, x) => a + x.amount, 0)
      return {
        invoices: rows,
        totals: {
          outstanding: sum(rows.filter((r) => r.status === 'Due' || r.status === 'Overdue')),
          overdue: sum(rows.filter((r) => r.status === 'Overdue')),
          overdueCount: rows.filter((r) => r.status === 'Overdue').length,
          collectedThisMonth: sum(rows.filter((r) => r.status === 'Paid' && r.paidAt && new Date(r.paidAt).getTime() >= monthStart))
        },
        methods: METHODS
      }
    }

    // GET /v1/admin/payments: every invoice, newest first, with totals
    app.get('/v1/admin/payments', guard, async (_req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      return list()
    })

    // POST /v1/admin/payments: a new invoice for a shop (renewal, add-on, anything else)
    app.post('/v1/admin/payments', guard, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const p = NewBody.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? 'Check the values.' })
      const db = app.database.db
      if (!(await db.collection('shops').findOne({ tenantId: p.data.tenantId }))) return reply.code(404).send({ error: 'No such shop.' })
      const inv = await createInvoice(db, { tenantId: p.data.tenantId, amount: p.data.amount, description: p.data.description, dueDays: p.data.dueDays, by: sessionOf(secret, req)!.name })
      return reply.code(201).send({ ...(await list()), created: inv.no })
    })

    // POST /v1/admin/payments/:id/paid: record the payment of a due invoice
    app.post<{ Params: { id: string } }>('/v1/admin/payments/:id/paid', guard, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const p = PaidBody.safeParse(req.body)
      if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? 'Check the values.' })
      const db = app.database.db
      const paidAt = p.data.paidOn ? new Date(p.data.paidOn + 'T12:00:00') : new Date()
      if (paidAt.getTime() > Date.now() + 86_400_000) return reply.code(400).send({ error: 'The payment date cannot be in the future.' })
      const by = sessionOf(secret, req)!.name
      // only a due invoice can be paid, and only once (two staff clicking at the same time: one wins)
      const before = await db.collection('invoices').findOneAndUpdate(
        { id: req.params.id, status: 'due' },
        { $set: { status: 'paid', paidAt, method: p.data.method, ...(p.data.reference ? { reference: p.data.reference } : {}), paidBy: by, updatedAt: new Date() } }
      )
      if (!before) {
        const exists = await db.collection('invoices').findOne({ id: req.params.id })
        return reply.code(exists ? 409 : 404).send({ error: exists ? 'This invoice is already paid or cancelled.' : 'No such invoice.' })
      }
      await db.collection('audit_log').insertOne({ tenantId: before['tenantId'], action: 'invoice_paid', at: new Date(), by, details: { no: before['no'], amount: `₹${(before['amount'] as number).toLocaleString('en-IN')}`, method: p.data.method } })
      return list()
    })

    // POST /v1/admin/payments/:id/cancel: cancel a due invoice (raised by mistake)
    app.post<{ Params: { id: string } }>('/v1/admin/payments/:id/cancel', guard, async (req, reply) => {
      if (!app.database) return reply.code(503).send({ error: 'The database is not connected.' })
      const db = app.database.db
      const by = sessionOf(secret, req)!.name
      const before = await db.collection('invoices').findOneAndUpdate({ id: req.params.id, status: 'due' }, { $set: { status: 'cancelled', cancelledBy: by, updatedAt: new Date() } })
      if (!before) {
        const exists = await db.collection('invoices').findOne({ id: req.params.id })
        return reply.code(exists ? 409 : 404).send({ error: exists ? 'Only an unpaid invoice can be cancelled.' : 'No such invoice.' })
      }
      await db.collection('audit_log').insertOne({ tenantId: before['tenantId'], action: 'invoice_cancelled', at: new Date(), by, details: { no: before['no'] } })
      return list()
    })
  }
}
