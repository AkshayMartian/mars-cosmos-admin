/** Sample sign-in state, kept for the browser tab only. Replaced by a server session (httpOnly cookie) when /v1/admin/login is built. */
const KEY = 'mars-admin-user'

export const currentUser = (): string | null => {
  try { return sessionStorage.getItem(KEY) } catch { return null }
}
export const signIn = (email: string): void => {
  try { sessionStorage.setItem(KEY, email) } catch { /* storage blocked: the page still works until reload */ }
}
export const signOut = (): void => {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
export const displayName = (email: string | null): string => {
  const n = (email ?? '').split('@')[0] ?? ''
  return n ? n[0]!.toUpperCase() + n.slice(1) : 'Admin'
}
