import { createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

/** Portal passwords: scrypt with a random salt. Stored as `scrypt$<salt>$<hash>` (base64url). Never stored or logged in clear. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, s, h] = stored.split('$')
  if (alg !== 'scrypt' || !s || !h) return false
  const expected = Buffer.from(h, 'base64url')
  const actual = await scrypt(password, Buffer.from(s, 'base64url'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** A 6-digit one-time code. */
export const newCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** One-time codes are kept only as a keyed hash, bound to the channel and the target they were sent to. */
export const hashCode = (secret: string, channel: string, target: string, code: string): string =>
  createHmac('sha256', secret).update(`${channel}\n${target}\n${code}`).digest('base64url')

export const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// no 0/O/1/I so a key read from a phone screen is hard to mistype
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const chunk = (): string => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
/** MARS-XXXX-XXXX-XXXX, 60 bits of randomness. */
export const newActivationKey = (): string => `MARS-${chunk()}-${chunk()}-${chunk()}`
