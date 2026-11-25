/** Sample data from the approved design. Replaced by the server's /v1/admin/* endpoints as they are built. */
export type Tone = 'ok' | 'warn' | 'bad' | 'mute'

export interface Shop {
  id: string; name: string; owner: string; mobile: string; city: string; plan: string; backup: 'Cloud' | 'Local'
  licence: string; licenceTone: Tone; app: string; appTone: Tone; lastSeen: string
  status: 'active' | 'waiting' | 'ending' | 'expired' | 'pending'
}

export const SHOPS: Shop[] = [
  { id: 'raj-fashion', name: 'Raj Fashion', owner: 'Rajesh Patel', mobile: '98••••0210', city: 'Ahmedabad', plan: 'Starter', backup: 'Cloud', licence: 'Ends in 5 days', licenceTone: 'warn', app: 'Activated', appTone: 'ok', lastSeen: '2 hours ago', status: 'ending' },
  { id: 'shree-textiles', name: 'Shree Textiles', owner: 'Meena Shah', mobile: '97••••5518', city: 'Surat', plan: 'Starter', backup: 'Local', licence: 'Not started', licenceTone: 'mute', app: 'Key sent, not used', appTone: 'warn', lastSeen: 'Never', status: 'waiting' },
  { id: 'style-hub', name: 'Style Hub', owner: 'Imran Khan', mobile: '98••••7741', city: 'Vadodara', plan: 'Growth', backup: 'Cloud', licence: 'Active · 11 months', licenceTone: 'ok', app: 'Activated · 2 counters', appTone: 'ok', lastSeen: '12 minutes ago', status: 'active' },
  { id: 'nikk-store', name: 'Nikk Store', owner: 'Nikhil Joshi', mobile: '93••••8593', city: 'Rajkot', plan: 'Trial', backup: 'Cloud', licence: 'Trial · 9 days left', licenceTone: 'warn', app: 'Activated', appTone: 'ok', lastSeen: 'Yesterday', status: 'active' },
  { id: 'urban-threads', name: 'Urban Threads', owner: 'Kavita Mehta', mobile: '99••••2046', city: 'Gandhinagar', plan: 'Starter', backup: 'Cloud', licence: 'Pending review', licenceTone: 'mute', app: 'No key yet', appTone: 'mute', lastSeen: 'Never', status: 'pending' },
  { id: 'kavya-boutique', name: 'Kavya Boutique', owner: 'Kavya Desai', mobile: '98••••3319', city: 'Bhavnagar', plan: 'Starter', backup: 'Local', licence: 'Expired', licenceTone: 'bad', app: 'Blocked until renewed', appTone: 'bad', lastSeen: '6 days ago', status: 'expired' }
]

export const ATTENTION = [
  { shop: 'Shree Textiles', text: 'Key sent 4 days ago, not activated yet', action: 'Resend key' },
  { shop: 'Raj Fashion', text: 'Licence ends in 5 days (Starter, cloud backup)', action: 'Renew' },
  { shop: 'Style Hub', text: '3 PIN reset requests in 24 hours', action: 'Review' },
  { shop: 'Nikk Store', text: 'WhatsApp message failed: number not on WhatsApp', action: 'Fix' }
]

export const RECENT: { shop: string; owner: string; city: string; status: string; tone: Tone }[] = [
  { shop: 'Raj Fashion', owner: 'Rajesh Patel', city: 'Ahmedabad', status: 'Active', tone: 'ok' },
  { shop: 'Shree Textiles', owner: 'Meena Shah', city: 'Surat', status: 'Key sent', tone: 'warn' },
  { shop: 'Style Hub', owner: 'Imran Khan', city: 'Vadodara', status: 'Active', tone: 'ok' },
  { shop: 'Nikk Store', owner: 'Nikhil Joshi', city: 'Rajkot', status: 'Send failed', tone: 'bad' },
  { shop: 'Urban Threads', owner: 'Kavita Mehta', city: 'Gandhinagar', status: 'Pending review', tone: 'mute' }
]

export const KEYS: { key: string; shop: string; mobile: string; status: string; tone: Tone; wa: string; waTone: Tone; issued: string; pc: string; actions: string[] }[] = [
  { key: 'MARS-7K2Q-••••-••••', shop: 'Raj Fashion', mobile: '98••••0210', status: 'Activated', tone: 'ok', wa: 'Delivered', waTone: 'ok', issued: '12 Nov', pc: 'PC 124D-9CE2-664F', actions: ['Revoke'] },
  { key: 'MARS-4TXP-••••-••••', shop: 'Shree Textiles', mobile: '97••••5518', status: 'Issued, not used', tone: 'warn', wa: 'Delivered', waTone: 'ok', issued: '21 Nov', pc: '—', actions: ['Resend', 'Revoke'] },
  { key: 'MARS-9HBD-••••-••••', shop: 'Style Hub', mobile: '98••••7741', status: 'Activated', tone: 'ok', wa: 'Delivered', waTone: 'ok', issued: '3 Nov', pc: 'PC 8B21-0DF4-33A9', actions: ['Revoke'] },
  { key: 'MARS-2WQE-••••-••••', shop: 'Nikk Store', mobile: '93••••8593', status: 'Issued, not used', tone: 'warn', wa: 'Failed: not on WhatsApp', waTone: 'bad', issued: '23 Nov', pc: '—', actions: ['Fix number', 'Resend'] },
  { key: 'MARS-6LNC-••••-••••', shop: 'Kavya Boutique', mobile: '98••••3319', status: 'Revoked', tone: 'mute', wa: 'Delivered', waTone: 'ok', issued: '2 Oct', pc: '—', actions: [] },
  { key: 'MARS-5RMA-••••-••••', shop: 'Urban Threads', mobile: '99••••2046', status: 'Not created yet', tone: 'mute', wa: '—', waTone: 'mute', issued: '—', pc: '—', actions: ['Review request'] }
]

export const LICENCES: { shop: string; city: string; plan: string; backup: string; counters: string; till: string; status: string; tone: Tone; check: string; action: string }[] = [
  { shop: 'Raj Fashion', city: 'Ahmedabad', plan: 'Starter', backup: 'Cloud', counters: '1', till: '30 Nov 2026', status: 'Ends in 5 days', tone: 'warn', check: '2 hours ago', action: 'Renew' },
  { shop: 'Style Hub', city: 'Vadodara', plan: 'Growth', backup: 'Cloud', counters: '2', till: '14 Oct 2027', status: 'Active', tone: 'ok', check: '12 minutes ago', action: 'Renew' },
  { shop: 'Nikk Store', city: 'Rajkot', plan: 'Trial', backup: 'Cloud', counters: '1', till: '4 Dec 2026', status: 'Trial · 9 days left', tone: 'warn', check: 'Yesterday', action: 'Convert to paid' },
  { shop: 'Kavya Boutique', city: 'Bhavnagar', plan: 'Starter', backup: 'Local-only', counters: '1', till: '19 Nov 2026', status: 'Expired', tone: 'bad', check: '6 days ago', action: 'Renew' },
  { shop: 'Shree Textiles', city: 'Surat', plan: 'Starter', backup: 'Local-only', counters: '1', till: '—', status: 'Not started', tone: 'mute', check: 'Never', action: '' }
]

export const PIN_RESETS: { shop: string; at: string; pc: string; email: string; status: string; tone: Tone; done: string }[] = [
  { shop: 'Raj Fashion', at: '24 Nov, 14:55', pc: '124D-9CE2-664F', email: 'ra•••••@rajfashion.in', status: 'Applied on the PC', tone: 'ok', done: '24 Nov, 15:02' },
  { shop: 'Style Hub', at: '25 Nov, 09:10', pc: '8B21-0DF4-33A9', email: 'im••@stylehub.co.in', status: 'Waiting for the owner', tone: 'warn', done: 'Link valid for 11 more minutes' },
  { shop: 'Style Hub', at: '25 Nov, 08:41', pc: '8B21-0DF4-33A9', email: 'im••@stylehub.co.in', status: 'Expired', tone: 'mute', done: 'Link not opened' },
  { shop: 'Nikk Store', at: '20 Nov, 17:30', pc: '55E0-A1C7-2B90', email: 'ni•••@gmail.com', status: 'Applied on the PC', tone: 'ok', done: '20 Nov, 17:36' }
]

export const MESSAGES: { time: string; shop: string; type: string; channel: string; to: string; status: string; tone: Tone; action: string }[] = [
  { time: '25 Nov, 09:10', shop: 'Style Hub', type: 'PIN reset email', channel: 'Email', to: 'im••@stylehub.co.in', status: 'Delivered', tone: 'ok', action: '' },
  { time: '23 Nov, 16:02', shop: 'Nikk Store', type: 'Activation key', channel: 'WhatsApp', to: '93••••8593', status: 'Failed: not on WhatsApp', tone: 'bad', action: 'Retry' },
  { time: '23 Nov, 15:58', shop: 'Nikk Store', type: 'Verification code', channel: 'SMS', to: '93••••8593', status: 'Delivered', tone: 'ok', action: '' },
  { time: '21 Nov, 12:20', shop: 'Shree Textiles', type: 'Activation key', channel: 'WhatsApp', to: '97••••5518', status: 'Delivered', tone: 'ok', action: 'Resend' },
  { time: '24 Nov, 15:02', shop: 'Raj Fashion', type: 'PIN changed', channel: 'Email', to: 'ra•••••@rajfashion.in', status: 'Delivered', tone: 'ok', action: '' },
  { time: '24 Nov, 14:55', shop: 'Raj Fashion', type: 'PIN reset email', channel: 'Email', to: 'ra•••••@rajfashion.in', status: 'Delivered', tone: 'ok', action: '' }
]

export const PLANS = [
  { name: 'Trial', count: '4 active', price: 'Free', lines: ['14 days · 1 counter', 'Mobile one-time code to start', 'All features', 'Converts to a paid plan'] },
  { name: 'Starter', count: '16 shops', price: '₹3,999 / year', lines: ['1 counter', 'Billing, stock, stickers, staff, reports', 'Cloud backup or Local-only', 'Installation and training included'] },
  { name: 'Growth', count: '4 shops', price: '[PRICE] / year', lines: ['2+ counters', 'Everything in Starter', 'More counters on the shop Wi-Fi', 'Second outlet (needs cloud plan)'] }
]

export const ADMINS = [
  { name: 'Arif', email: 'arif@marstechnolabs.in', role: 'Admin', last: 'Today, 09:02', actions: ['Edit'] },
  { name: 'Pinkal', email: 'pinkal@marstechnolabs.in', role: 'Admin', last: 'Yesterday', actions: ['Edit'] },
  { name: 'Akshay', email: 'akshay@marstechnolabs.in', role: 'Admin', last: '23 Nov', actions: ['Edit'] },
  { name: 'Support desk', email: 'support@marstechnolabs.in', role: 'Support', last: '22 Nov', actions: ['Edit', 'Disable'] }
]

export const AUDIT = [
  { time: '25 Nov, 09:10', who: 'Owner (web page)', action: 'PIN reset requested', shop: 'Style Hub', detail: 'From PC 8B21-0DF4-33A9. Email sent.' },
  { time: '24 Nov, 15:02', who: 'System', action: 'PIN reset applied', shop: 'Raj Fashion', detail: 'App on PC 124D-9CE2-664F saved the new PIN.' },
  { time: '24 Nov, 14:58', who: 'Owner (web page)', action: 'New PIN saved', shop: 'Raj Fashion', detail: 'Link used once. Confirmation email sent.' },
  { time: '23 Nov, 16:02', who: 'Arif', action: 'Key resent', shop: 'Nikk Store', detail: 'WhatsApp failed: number not on WhatsApp.' },
  { time: '21 Nov, 12:20', who: 'Arif', action: 'Shop created', shop: 'Shree Textiles', detail: 'Mobile and email verified. Key sent.' },
  { time: '19 Nov, 18:44', who: 'Support desk', action: 'Licence expired', shop: 'Kavya Boutique', detail: 'App is locked until renewed.' },
  { time: '12 Nov, 11:20', who: 'System', action: 'App activated', shop: 'Raj Fashion', detail: 'PC 124D-9CE2-664F.' }
]

export const ACTIVITY: [string, string][] = [
  ['24 Nov, 15:02', 'PIN reset applied on PC 124D-9CE2-664F'],
  ['24 Nov, 14:58', 'PIN reset link opened and new PIN saved (web page)'],
  ['24 Nov, 14:55', 'PIN reset requested from the app. Email sent to ra•••••@rajfashion.in'],
  ['12 Nov, 11:20', 'App activated on PC 124D-9CE2-664F'],
  ['12 Nov, 10:41', 'Activation key sent on WhatsApp, delivered'],
  ['12 Nov, 10:40', 'Shop created by Arif. Mobile and email verified.']
]

export const STATES = ['24 Gujarat', '27 Maharashtra', '08 Rajasthan', '07 Delhi', '29 Karnataka', '33 Tamil Nadu', '09 Uttar Pradesh', '23 Madhya Pradesh']
