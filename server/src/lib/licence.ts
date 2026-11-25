import { createPrivateKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** The licence as the desktop app verifies it (mars-pos-desktop: src/shared/licence.ts). Field names must not change. */
export interface LicencePayload {
  v: 1
  key: string
  machine: string
  shop: string
  plan: string
  mode: 'cloud' | 'local'
  counters: number
  kind: 'full' | 'trial'
  /** YYYY-MM-DD, inclusive */
  expires: string
  issued: string
}

export type LicenceSigner = (p: LicencePayload) => string

/** `MARSL1.<payload>.<signature>`: Ed25519 over the exact payload bytes, base64url (same as the app's licenceSign.ts). */
export function makeSigner(privateKeyPem: string): LicenceSigner {
  const key: KeyObject = createPrivateKey(privateKeyPem)
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('The licence private key must be an Ed25519 key.')
  return (p) => {
    const body = Buffer.from(JSON.stringify(p), 'utf8')
    return `MARSL1.${body.toString('base64url')}.${sign(null, body, key).toString('base64url')}`
  }
}

export const loadSigner = (file: string): LicenceSigner => makeSigner(readFileSync(file, 'utf8'))

export function generateLicenceKeyPair(): { privatePem: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString()
  }
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10)
/** Licence of `days` days starting today, both days counted (so 365 days issued on 1 Jan ends 31 Dec). */
export function licenceDates(days: number, now = new Date()): { issued: string; expires: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days - 1))
  return { issued: ymd(now), expires: ymd(end) }
}
