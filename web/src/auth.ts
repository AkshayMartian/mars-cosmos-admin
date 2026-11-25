/** Sample sign-in state, kept for the browser tab only. Replaced by a server session (httpOnly cookie) when /v1/admin/login is built. */
const KEY = 'mars-admin-user'

export interface Session { name: string; role: string; email: string }

export const currentUser = (): Session | null => {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Session | null } catch { return null }
}
export const signIn = (s: Session): void => {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked: the page still works until reload */ }
}
export const signOut = (): void => {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
