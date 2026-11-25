import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { connectDb, type Database } from './db.js'

const config = loadConfig()
let database: Database | null = null

if (config.MONGODB_URI) {
  try {
    database = await connectDb(config.MONGODB_URI, config.MONGODB_DB)
    console.log(`MongoDB connected, database "${config.MONGODB_DB}".`)
  } catch (e) {
    console.error('Could not connect to MongoDB:', e instanceof Error ? e.message : e)
    process.exit(1)
  }
} else {
  console.warn('MONGODB_URI is empty: starting without a database (only /health works).')
}

const app = await buildApp(config, database)
const stop = async () => { await app.close(); await database?.close(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

await app.listen({ port: config.PORT, host: config.HOST })
