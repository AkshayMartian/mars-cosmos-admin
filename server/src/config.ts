import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// .env lives at the project root, beside package.json (works from src/ and from dist/)
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })

const optional = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined))

const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** empty = run without a database */
  MONGODB_URI: optional,
  MONGODB_DB: z.string().regex(/^[A-Za-z0-9_-]{1,38}$/, 'Database names cannot contain spaces or special characters').default('mars_pos'),
  LICENCE_PRIVATE_KEY_FILE: optional,
  /** Secret used to hash one-time codes. Required in production; in development a random one is made per run. */
  OTP_SECRET: optional,
  /** Where owner photos are kept (a folder on the server). */
  UPLOAD_DIR: z.string().default('./uploads'),
  /** console = print messages to the server log (development). live = WhatsApp Business API + SMTP email. */
  MESSENGER: z.enum(['console', 'live']).default('console'),
  WHATSAPP_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  /** Approved WhatsApp templates: one with a single {{1}} body parameter + a copy-code button for codes, one with {{1}} shop and {{2}} key. */
  WHATSAPP_OTP_TEMPLATE: z.string().default('mars_verification_code'),
  WHATSAPP_KEY_TEMPLATE: z.string().default('mars_activation_key'),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
  /** e.g. smtps://user:pass@smtp.example.com:465 */
  SMTP_URL: optional,
  SMTP_FROM: z.string().default('MARS Cosmos <no-reply@example.com>')
})

export type Config = z.infer<typeof Env>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Env.safeParse(env)
  if (!r.success) throw new Error('Bad configuration: ' + r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  const c = r.data
  if (c.MESSENGER === 'live') {
    const missing = (['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] as const).filter((k) => !c[k])
    if (missing.length) throw new Error(`Bad configuration: MESSENGER=live needs ${missing.join(', ')}`)
  }
  if (env['NODE_ENV'] === 'production' && !c.OTP_SECRET) throw new Error('Bad configuration: OTP_SECRET is required in production')
  return c
}
