/** Calls the admin server (Vite forwards /api to it in development). Errors carry the server's message and per-field messages. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly fields: Record<string, string> = {}) { super(message) }
}

export const post = <T>(path: string, body: unknown): Promise<T> => send<T>('POST', path, body)
export const put = <T>(path: string, body: unknown): Promise<T> => send<T>('PUT', path, body)

async function send<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api' + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new ApiError('Could not reach the server. Check that it is running.', 0)
  }
  const j = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> } & Record<string, unknown>
  if (!res.ok) throw new ApiError(j.error ?? 'The server did not accept this.', res.status, j.fields)
  return j as T
}

export async function get<T>(path: string): Promise<T> {
  let res: Response
  try { res = await fetch('/api' + path) } catch { throw new ApiError('Could not reach the server. Check that it is running.', 0) }
  const j = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>
  if (!res.ok) throw new ApiError(j.error ?? 'The server did not accept this.', res.status)
  return j as T
}
