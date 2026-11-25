import { resolve4, resolveMx } from 'node:dns/promises'

/**
 * Can this email's domain receive mail? True when it has MX records (or an address record, which mail falls back to).
 * Only a definite "no such domain / no records" answer says false; a DNS timeout or error lets the address through
 * (the one-time code sent to it is the real proof).
 */
export async function emailDomainCanReceive(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  const missing = (e: unknown) => ['ENOTFOUND', 'ENODATA'].includes((e as { code?: string }).code ?? '')
  try {
    if ((await resolveMx(domain)).some((r) => r.exchange && r.exchange !== '.')) return true
  } catch (e) { if (!missing(e)) return true }
  try { return (await resolve4(domain)).length > 0 } catch (e) { return !missing(e) }
}
