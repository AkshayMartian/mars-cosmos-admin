/**
 * Creates (or resets the password of) a portal staff user.
 *   npm run admin:create -w server -- <email> <name> <role: Admin|Support|Sales>
 * The password is read from the ADMIN_PASSWORD environment variable, so it never lands in shell history or a file:
 *   PowerShell:  $env:ADMIN_PASSWORD='...'; npm run admin:create -w server -- admin@example.com "Admin" Admin
 * Only a scrypt hash is stored.
 */
import { loadConfig } from '../src/config.js'
import { connectDb } from '../src/db.js'
import { hashPassword } from '../src/lib/secrets.js'

const [email, name, role] = process.argv.slice(2)
const password = process.env['ADMIN_PASSWORD']
if (!email || !name || !role || !password) { console.error('Usage: ADMIN_PASSWORD=... npm run admin:create -w server -- <email> <name> <Admin|Support|Sales>'); process.exit(1) }
if (!['Admin', 'Support', 'Sales'].includes(role)) { console.error('Role must be Admin, Support or Sales.'); process.exit(1) }
if (!/^\d{4}$/.test(password)) { console.error('The portal password is a 4-digit PIN (digits only).'); process.exit(1) }

const config = loadConfig()
if (!config.MONGODB_URI) { console.error('Set MONGODB_URI in .env first.'); process.exit(1) }
const { db, close } = await connectDb(config.MONGODB_URI, config.MONGODB_DB)
try {
  const now = new Date()
  const r = await db.collection('admin_users').updateOne(
    { email: email.toLowerCase() },
    { $set: { name, role, passwordHash: await hashPassword(password), active: true, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  )
  console.log(r.upsertedCount ? `Created ${role} user ${email.toLowerCase()}.` : `Updated ${email.toLowerCase()} (password reset).`)
} finally { await close() }
