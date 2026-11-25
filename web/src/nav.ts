/** Left menu and routes in one place. Same order as the approved design. */
export interface NavItem { path: string; label: string; blurb: string; group: 1 | 2 }

export const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', blurb: 'Shops waiting on you, licences running out, and recent activity.', group: 1 },
  { path: '/onboard', label: 'Onboard a shop', blurb: 'Owner and shop details, with mobile and email verified, then the activation key.', group: 1 },
  { path: '/shops', label: 'Shops', blurb: 'Every shop, its licence and whether its app is activated.', group: 1 },
  { path: '/activation-keys', label: 'Activation keys', blurb: 'Keys sent to owners, WhatsApp delivery, and where each was activated.', group: 1 },
  { path: '/licences', label: 'Licences', blurb: 'Plan, expiry and last contact for every shop.', group: 1 },
  { path: '/pin-resets', label: 'PIN resets', blurb: 'Owner forgot-PIN requests and their status.', group: 1 },
  { path: '/messages', label: 'Messages', blurb: 'Everything the portal sent: keys, codes and reset emails.', group: 1 },
  { path: '/plans', label: 'Plans', blurb: 'What a shop gets on each plan.', group: 2 },
  { path: '/admin-users', label: 'Admin users', blurb: 'MARS staff who can sign in to this portal.', group: 2 },
  { path: '/audit-log', label: 'Audit log', blurb: 'Who did what, and when. Entries cannot be edited or deleted.', group: 2 }
]
