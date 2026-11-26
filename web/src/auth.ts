/** Sample sign-in state, kept for the browser tab only. Replaced by a server session (httpOnly cookie) when /v1/admin/login is built. */
const KEY = 'mars-admin-user'

/** `can`: what this member's role may use, as the server sends it (the server checks again on every request). */
export interface Session { name: string; role: string; email: string; can?: string[] }

export const currentUser = (): Session | null => {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Session | null } catch { return null }
}
/** Whether the signed-in member's role has this permission (see server/src/lib/roles.ts). */
export const can = (permission: string): boolean => currentUser()?.can?.includes(permission) ?? false

export const signIn = (s: Session): void => {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked: the page still works until reload */ }
}
export const signOut = (): void => {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
