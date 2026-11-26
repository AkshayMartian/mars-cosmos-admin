import type { Db } from 'mongodb'

export interface PlanDoc { key: string; name: string; yearPrice: number; counters: number; includes: string[] }

/** Written to the `plans` collection when a plan is missing. After that the database is the only source: staff edit prices on the Plans page. */
export const DEFAULT_PLANS: PlanDoc[] = [
  { key: 'basic', name: 'Basic', yearPrice: 4999, counters: 1, includes: ['alterations'] },
  { key: 'smart', name: 'Smart', yearPrice: 7999, counters: 1, includes: ['alterations', 'coins'] },
  { key: 'pro', name: 'Pro', yearPrice: 11999, counters: 2, includes: ['alterations', 'coins', 'serial'] }
]

/** All plans in price order, adding any default that is missing (never overwrites a stored plan). */
export async function loadPlans(db: Db): Promise<PlanDoc[]> {
  const coll = db.collection('plans')
  const now = new Date()
  for (const p of DEFAULT_PLANS) await coll.updateOne({ key: p.key }, { $setOnInsert: { ...p, createdAt: now } }, { upsert: true })
  const docs = await coll.find({}).toArray()
  return docs
    .map((d) => ({ key: d['key'] as string, name: d['name'] as string, yearPrice: d['yearPrice'] as number, counters: d['counters'] as number, includes: (d['includes'] as string[] | undefined) ?? [] }))
    .sort((a, b) => a.yearPrice - b.yearPrice)
}
