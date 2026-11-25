import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// .env lives at the project root, beside package.json (works from src/ and from dist/)
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })

const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** empty = run without a database */
  MONGODB_URI: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  MONGODB_DB: z.string().regex(/^[A-Za-z0-9_-]{1,38}$/, 'Database names cannot contain spaces or special characters').default('mars_pos'),
  LICENCE_PRIVATE_KEY_FILE: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined))
})

export type Config = z.infer<typeof Env>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Env.safeParse(env)
  if (!r.success) throw new Error('Bad configuration: ' + r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}
