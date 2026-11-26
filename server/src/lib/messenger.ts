import nodemailer from 'nodemailer'
import type { Config } from '../config.js'
import { activationKeyEmail, codeEmail, pinChangedEmail, pinResetEmail } from './emailTemplates.js'

/** Everything the server sends to an owner. `live` talks to WhatsApp Business and SMTP; `console` only prints (development). */
export interface Messenger {
  /** one-time code to a mobile (WhatsApp) or an email address */
  sendCode(channel: 'mobile' | 'email', target: string, code: string): Promise<void>
  /** the activation key, to the owner's WhatsApp */
  sendActivationKey(mobile: string, shop: string, key: string): Promise<{ messageId?: string }>
  /** the activation key, to the owner's verified email (used instead of WhatsApp for now) */
  sendActivationKeyEmail(email: string, shop: string, key: string): Promise<{ messageId?: string }>
  /** the forgot-PIN link, to the owner's email on file only */
  sendPinResetEmail(email: string, shop: string, link: string, minutes: number): Promise<void>
  /** a notice after the PIN was changed from the link */
  sendPinChangedEmail(email: string, shop: string): Promise<void>
}

const mask = (s: string): string => (s.includes('@') ? s.replace(/^(.).*(@.*)$/, '$1•••$2') : s.slice(0, 2) + '••••••' + s.slice(-2))

export function consoleMessenger(log: (m: string) => void = console.log): Messenger {
  return {
    async sendCode(channel, target, code) { log(`[dev messenger] ${channel} code for ${mask(target)}: ${code}`) },
    async sendActivationKey(mobile, shop, key) { log(`[dev messenger] WhatsApp to ${mask(mobile)}: activation key for "${shop}": ${key}`); return { messageId: 'dev-' + Date.now() } },
    async sendActivationKeyEmail(email, shop, key) { log(`[dev messenger] email to ${mask(email)}: activation key for "${shop}": ${key}`); return { messageId: 'dev-' + Date.now() } },
    async sendPinResetEmail(email, shop, link) { log(`[dev messenger] email to ${mask(email)}: PIN reset link for "${shop}": ${link}`) },
    async sendPinChangedEmail(email, shop) { log(`[dev messenger] email to ${mask(email)}: PIN changed for "${shop}"`) }
  }
}

/** Emails go out by SMTP when SMTP_URL is set (a real mailbox gets them). Every email is sent as HTML with a plain-text copy (see emailTemplates.ts). */
function smtpSender(c: Config): (to: string, code: string) => Promise<void> {
  const mail = nodemailer.createTransport(c.SMTP_URL!)
  return async (to, code) => {
    const m = codeEmail(code)
    await mail.sendMail({ from: c.SMTP_FROM, to, subject: m.subject, text: m.text, html: m.html })
  }
}

function smtpKeySender(c: Config): (to: string, shop: string, key: string) => Promise<string | undefined> {
  const mail = nodemailer.createTransport(c.SMTP_URL!)
  return async (to, shop, key) => {
    const m = activationKeyEmail(shop, key)
    const info = await mail.sendMail({ from: c.SMTP_FROM, to, subject: m.subject, text: m.text, html: m.html })
    return info.messageId
  }
}

/** The two forgot-PIN emails, by SMTP. */
function smtpPinSenders(c: Config) {
  const mail = nodemailer.createTransport(c.SMTP_URL!)
  return {
    async reset(to: string, shop: string, link: string, minutes: number): Promise<void> {
      const m = pinResetEmail(shop, link, minutes)
      await mail.sendMail({ from: c.SMTP_FROM, to, subject: m.subject, text: m.text, html: m.html })
    },
    async changed(to: string, shop: string): Promise<void> {
      const m = pinChangedEmail(shop)
      await mail.sendMail({ from: c.SMTP_FROM, to, subject: m.subject, text: m.text, html: m.html })
    }
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
  const pinMail = c.SMTP_URL ? smtpPinSenders(c) : null
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
    },
    async sendPinResetEmail(email, shop, link, minutes) { return pinMail ? pinMail.reset(email, shop, link, minutes) : dev.sendPinResetEmail(email, shop, link, minutes) },
    async sendPinChangedEmail(email, shop) { return pinMail ? pinMail.changed(email, shop) : dev.sendPinChangedEmail(email, shop) }
  }
}
