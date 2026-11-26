import { randomUUID } from 'node:crypto'
import type { Database } from '../src/db.js'

type Doc = Record<string, any>

/** A tiny in-memory stand-in for the few MongoDB calls the routes use (equality, $gt, $exists, $or, $set, $inc, $setOnInsert). */
function matches(d: Doc, f: Doc): boolean {
  return Object.entries(f).every(([k, v]) => {
    if (k === '$or') return (v as Doc[]).some((x) => matches(d, x))
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      return Object.entries(v as Doc).every(([op, arg]) => {
        if (op === '$gt') return d[k] > arg
        if (op === '$in') return (arg as unknown[]).includes(d[k])
        if (op === '$exists') return (d[k] !== undefined) === arg
        throw new Error('fake db: unsupported operator ' + op)
      })
    }
    return d[k] instanceof Date && v instanceof Date ? d[k].getTime() === v.getTime() : d[k] === v
  })
}

function update(d: Doc, u: Doc): void {
  Object.assign(d, u['$set'] ?? {})
  for (const k of Object.keys(u['$unset'] ?? {})) delete d[k]
  for (const [k, n] of Object.entries(u['$inc'] ?? {})) d[k] = (d[k] ?? 0) + (n as number)
}

export class FakeCollection {
  docs: Doc[] = []
  constructor(private uniques: string[] = []) {}
  async findOne(f: Doc, o?: { sort?: Doc }): Promise<Doc | null> {
    let r = this.docs.filter((d) => matches(d, f))
    const [sk, dir] = Object.entries(o?.sort ?? {})[0] ?? []
    if (sk) r = [...r].sort((a, b) => (a[sk] - b[sk]) * (dir as number))
    return r[0] ?? null
  }
  find(f: Doc) {
    let r = this.docs.filter((d) => matches(d, f))
    const cursor = {
      sort(s: Doc) { const [k, dir] = Object.entries(s)[0]!; r = [...r].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir as number)); return cursor },
      limit(n: number) { r = r.slice(0, n); return cursor },
      async toArray() { return r }
    }
    return cursor
  }
  async insertOne(d: Doc) {
    for (const u of this.uniques) if (d[u] !== undefined && this.docs.some((x) => x[u] === d[u])) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
    const doc = { _id: randomUUID(), ...d }
    this.docs.push(doc)
    return { insertedId: doc._id }
  }
  async updateOne(f: Doc, u: Doc, o?: { upsert?: boolean }) {
    const d = this.docs.find((x) => matches(x, f))
    if (d) { update(d, u); return { matchedCount: 1 } }
    if (o?.upsert) { const n = { _id: randomUUID(), ...f, ...(u['$setOnInsert'] ?? {}) }; update(n, u); this.docs.push(n); return { matchedCount: 0 } }
    return { matchedCount: 0 }
  }
  async updateMany(f: Doc, u: Doc) {
    const ds = this.docs.filter((x) => matches(x, f)); ds.forEach((d) => update(d, u)); return { matchedCount: ds.length }
  }
  async findOneAndUpdate(f: Doc, u: Doc): Promise<Doc | null> {
    const d = this.docs.find((x) => matches(x, f)); if (!d) return null
    const before = { ...d }; update(d, u); return before
  }
  async countDocuments(f: Doc) { return this.docs.filter((d) => matches(d, f)).length }
  async deleteOne(f: Doc) { const i = this.docs.findIndex((d) => matches(d, f)); if (i >= 0) this.docs.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 } }
  async deleteMany(f: Doc) { const n = this.docs.length; this.docs = this.docs.filter((d) => !matches(d, f)); return { deletedCount: n - this.docs.length } }
}

const UNIQUE: Record<string, string[]> = { owners: ['mobile', 'email'], shops: ['tenantId'], activation_keys: ['key'] }

export function fakeDatabase(): Database & { c: (name: string) => FakeCollection } {
  const cols = new Map<string, FakeCollection>()
  const c = (name: string) => { if (!cols.has(name)) cols.set(name, new FakeCollection(UNIQUE[name])); return cols.get(name)! }
  return { client: {} as never, db: { collection: c, command: async () => ({ ok: 1 }) } as never, close: async () => undefined, c }
}
