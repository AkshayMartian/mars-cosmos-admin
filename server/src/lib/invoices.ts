import { randomUUID } from 'node:crypto'
import type { Db } from 'mongodb'

const DAY = 86_400_000
export const DUE_DAYS = 15

/** Indian financial year (April to March) as "26-27" for any date from 1 Apr 2026 to 31 Mar 2027. */
export function financialYear(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `${String(y % 100).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`
}

/** Next invoice number for the year, e.g. MT/26-27/0001. The counter lives in `counters` and is increased atomically. */
export async function nextInvoiceNo(db: Db, now = new Date()): Promise<string> {
  const fy = financialYear(now)
  const c = await db.collection<{ _id: string; seq: number }>('counters').findOneAndUpdate(
    { _id: `invoice-${fy}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' }
  )
  return `MT/${fy}/${String(c!.seq).padStart(4, '0')}`
}

/** An invoice is due until the end of its due day, not the exact minute it was raised. */
const endOfDay = (d: Date): Date => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e }

export interface NewInvoice { tenantId: string; amount: number; description: string; by: string; dueDays?: number }

/** Saves an unpaid invoice and returns it. */
export async function createInvoice(db: Db, x: NewInvoice, now = new Date()) {
  const doc = {
    id: randomUUID(), no: await nextInvoiceNo(db, now), tenantId: x.tenantId, amount: Math.round(x.amount), description: x.description,
    status: 'due' as const, issuedAt: now, dueAt: endOfDay(new Date(now.getTime() + (x.dueDays ?? DUE_DAYS) * DAY)), createdBy: x.by, createdAt: now
  }
  await db.collection('invoices').insertOne({ ...doc })
  await db.collection('audit_log').insertOne({ tenantId: x.tenantId, action: 'invoice_created', at: now, by: x.by, details: { no: doc.no, amount: `₹${doc.amount.toLocaleString('en-IN')}` } })
  return doc
}
