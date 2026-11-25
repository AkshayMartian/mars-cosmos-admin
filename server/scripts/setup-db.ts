/**
 * Creates the MongoDB collections with validators and indexes. Safe to run again; it never deletes data.
 *
 *   1. Atlas > Database Access: add a database user with readWrite on your database; Network Access: allow your IP.
 *   2. Put its connection string in .env as MONGODB_URI (a secret: never in git, never in chat).
 *   3. npm run db:setup
 */
import { COLLECTIONS } from '../src/collections.js'
import { loadConfig } from '../src/config.js'
import { connectDb } from '../src/db.js'

const config = loadConfig()
if (!config.MONGODB_URI) { console.error('Set MONGODB_URI in .env first.'); process.exit(1) }

const { db, close } = await connectDb(config.MONGODB_URI, config.MONGODB_DB)
try {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name))
  for (const [name, { validator, indexes }] of Object.entries(COLLECTIONS)) {
    if (existing.has(name)) await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' })
    else await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' })
    for (const [keys, options] of indexes) await db.collection(name).createIndex(keys, options)
    console.log(`${existing.has(name) ? 'updated' : 'created'}  ${config.MONGODB_DB}.${name}  (${indexes.length} indexes)`)
  }
  console.log(`\nDone. Database "${config.MONGODB_DB}" is ready.`)
} catch (e) {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await close()
}
