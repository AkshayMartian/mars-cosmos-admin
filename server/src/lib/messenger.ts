import nodemailer from 'nodemailer'
import type { Config } from '../config.js'

/** Everything the server sends to an owner. `live` talks to WhatsApp Business and SMTP; `console` only prints (development). */
export interface Messenger {
  /** one-time code to a mobile (WhatsApp) or an email address */
  sendCode(channel: 'mobile' | 'email', target: string, code: string): Promise<void>
  /** the activation key, to the owner's WhatsApp */
  sendActivationKey(mobile: string, shop: string, key: string): Promise<{ messageId?: string }>
  /** the activation key, to the owner's verified email (used instead of WhatsApp for now) */
  sendActivationKeyEmail(email: string, shop: string, key: string): Promise<{ messageId?: string }>
}

const mask = (s: string): string => (s.includes('@') ? s.replace(/^(.).*(@.*)$/, '$1•••$2') : s.slice(0, 2) + '••••••' + s.slice(-2))

export function consoleMessenger(log: (m: string) => void = console.log): Messenger {
  return {
    async sendCode(channel, target, code) { log(`[dev messenger] ${channel} code for ${mask(target)}: ${code}`) },
    async sendActivationKey(mobile, shop, key) { log(`[dev messenger] WhatsApp to ${mask(mobile)}: activation key for "${shop}": ${key}`); return { messageId: 'dev-' + Date.now() } },
    async sendActivationKeyEmail(email, shop, key) { log(`[dev messenger] email to ${mask(email)}: activation key for "${shop}": ${key}`); return { messageId: 'dev-' + Date.now() } }
  }
}

/** Emails go out by SMTP when SMTP_URL is set (a real mailbox gets the code). */
function smtpSender(c: Config): (to: string, code: string) => Promise<void> {
  const mail = nodemailer.createTransport(c.SMTP_URL!)
  return async (to, code) => {
    await mail.sendMail({
      from: c.SMTP_FROM, to, subject: 'Your MARS Cosmos verification code',
      text: `Your verification code is ${code}. It is valid for 10 minutes. If you did not ask for it, ignore this email.`
    })
  }
}

function smtpKeySender(c: Config): (to: string, shop: string, key: string) => Promise<string | undefined> {
  const mail = nodemailer.createTransport(c.SMTP_URL!)
  return async (to, shop, key) => {
    const info = await mail.sendMail({
      from: c.SMTP_FROM, to, subject: 'Your MARS Cosmos activation key',
      text: `Welcome to MARS Cosmos.

Activation key for ${shop}:

${key}

Install the app, then enter this key and your registered mobile number to activate it. Do not share the key with anyone.`
    })
    return info.messageId
  }
}

/** WhatsApp Business Cloud API: template messages (the code, and the activation key). */
function whatsappSender(c: Config) {
  return async (mobile: string, name: string, params: string[], buttonParam?: string): Promise<string | undefined> => {
    const components: unknown[] = [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }]
    if (buttonParam) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: buttonParam }] })
    const res = await fetch(`https://graph.facebook.com/v21.0/${c.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.WHATSAPP_TOKEN}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: '91' + mobile, type: 'template', template: { name, language: { code: c.WHATSAPP_TEMPLATE_LANG }, components } }),
      signal: AbortSignal.timeout(15_000)
    })
    const j = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string } }
    if (!res.ok) throw new Error(j.error?.message ?? `WhatsApp API answered ${res.status}`)
    return j.messages?.[0]?.id
  }
}

/** Email and WhatsApp are switched on separately: SMTP_URL makes email real; MESSENGER=live makes WhatsApp real. Anything not real is printed to the server log. */
export function makeMessenger(c: Config, log: (m: string) => void = console.log): Messenger {
  const dev = consoleMessenger(log)
  const sendMail = c.SMTP_URL ? smtpSender(c) : null
  const sendKeyMail = c.SMTP_URL ? smtpKeySender(c) : null
  const wa = c.MESSENGER === 'live' ? whatsappSender(c) : null
  return {
    async sendCode(channel, target, code) {
      if (channel === 'email' && sendMail) return sendMail(target, code)
      if (channel === 'mobile' && wa) { await wa(target, c.WHATSAPP_OTP_TEMPLATE, [code], code); return }
      return dev.sendCode(channel, target, code)
    },
    async sendActivationKey(mobile, shop, key) {
      if (!wa) return dev.sendActivationKey(mobile, shop, key)
      const messageId = await wa(mobile, c.WHATSAPP_KEY_TEMPLATE, [shop, key])
      return messageId ? { messageId } : {}
    },
    async sendActivationKeyEmail(email, shop, key) {
      if (!sendKeyMail) return dev.sendActivationKeyEmail(email, shop, key)
      const messageId = await sendKeyMail(email, shop, key)
      return messageId ? { messageId } : {}
    }
  }
}
