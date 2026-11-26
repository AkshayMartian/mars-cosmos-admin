/** What each staff role may do. The server checks these on every request; /v1/admin/me sends the list to the web app, which hides what the role cannot use. */
export type Role = 'Admin' | 'Support' | 'Sales'

export const PERMISSIONS = {
  dashboard: 'See the dashboard',
  shops: 'See shops',
  onboard: 'Onboard shops and send activation keys',
  plans: 'See plans and prices',
  'plans.edit': 'Add plans and change prices',
  whatsapp: 'See WhatsApp templates and logs',
  releases: 'Manage app releases',
  payments: 'See payments',
  team: 'Manage the team',
  audit: 'See the audit log'
} as const
export type Permission = keyof typeof PERMISSIONS

const ALL = Object.keys(PERMISSIONS) as Permission[]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Admin: ALL,
  Support: ['dashboard', 'shops', 'plans', 'whatsapp'],
  Sales: ['dashboard', 'shops', 'onboard', 'plans']
}

export const can = (role: string, p: Permission): boolean => (ROLE_PERMISSIONS[role as Role] ?? []).includes(p)
