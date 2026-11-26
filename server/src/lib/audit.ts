/** How `audit_log` entries are shown to staff (Dashboard "Recent changes" and the Audit log page). */

/** Audit actions as staff read them. Unknown actions are shown as they are stored. */
export const ACTION_LABEL: Record<string, string> = {
  shop_onboarded: 'Shop created',
  licence_activated: 'Licence activated',
  pin_reset_email_sent: 'PIN reset email sent',
  pin_reset_completed: 'New PIN chosen',
  pin_reset_applied: 'PIN reset applied',
  plan_added: 'Plan added',
  plan_changed: 'Plan changed',
  team_member_added: 'Team member added',
  team_member_changed: 'Team member changed',
  invoice_created: 'Invoice raised',
  invoice_paid: 'Payment received',
  invoice_cancelled: 'Invoice cancelled',
  key_emailed: 'Activation key emailed',
  key_issued: 'New activation key'
}

export const actionLabel = (action: string): string => ACTION_LABEL[action] ?? action

/** Action keys whose stored key or shown label contains `text` (for searching). */
export const actionsMatching = (text: string): string[] => {
  const t = text.toLowerCase()
  return Object.entries(ACTION_LABEL).filter(([k, l]) => k.includes(t) || l.toLowerCase().includes(t)).map(([k]) => k)
}

const detailText = (d: unknown): string =>
  d && typeof d === 'object' ? Object.entries(d as Record<string, unknown>).filter(([k, v]) => k !== 'shop' && v !== false && v != null).map(([k, v]) => (v === true ? k : String(v))).join(' · ') : ''

export interface AuditRow { id: string; at: string; by: string; action: string; shop: string | null; details: string }

/** One stored entry as a table row. Entries written by the app (no `by`) show "Shop". */
export function auditRow(a: Record<string, any>, shopName: (tenantId: string) => string | undefined): AuditRow {
  return {
    id: String(a['_id']),
    at: (a['at'] as Date).toISOString(),
    by: (a['by'] as string | undefined) ?? (a['action'] === 'shop_onboarded' ? 'Staff' : 'Shop'),
    action: actionLabel(String(a['action'])),
    shop: a['tenantId'] ? shopName(a['tenantId']) ?? null : null,
    details: detailText(a['details'])
  }
}
