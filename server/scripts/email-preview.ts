import { writeFileSync } from 'node:fs'
import { activationKeyEmail, codeEmail, esc, pinChangedEmail, pinResetEmail } from '../src/lib/emailTemplates.js'

/** Writes one page that shows every email the server sends, to look at or share: `npm run email:preview -w server -- <output file>` */
const out = process.argv[2] ?? 'email-preview.html'
const mails = [
  ['Verification code', codeEmail('204815')],
  ['Activation key', activationKeyEmail('Raj Fashion', 'MARS-7K2Q-9XFD-4LPA')],
  ['PIN reset link', pinResetEmail('Raj Fashion', 'http://localhost:4100/reset-pin?token=g4z3q9AnZIqt39lcLxwpNBBtAXtpxjldvtxly3YKM1k', 15)],
  ['PIN changed', pinChangedEmail('Raj Fashion')]
] as const
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MARS emails: preview</title>
<style>body{margin:0;background:#EEEBE6;font-family:'Segoe UI',system-ui,sans-serif;color:#1C1917}h1{margin:0;padding:24px 24px 4px}p.s{margin:0;padding:0 24px 16px;color:#57534E}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px;padding:0 24px 32px}.c{background:#fff;border-radius:12px;overflow:hidden;border:1px solid #D6D0C8}.c b{display:block;padding:10px 14px;background:#1C1917;color:#fff;font-size:14px}
.c .sub{padding:8px 14px;font-size:13px;color:#57534E;border-bottom:1px solid #E2DDD6}iframe{width:100%;height:640px;border:0;background:#F5F3F0}</style></head><body>
<h1>MARS emails</h1><p class="s">The four emails the server sends to shop owners (sample data).</p><div class="g">
${mails.map(([name, m]) => `<div class="c"><b>${esc(name)}</b><div class="sub">Subject: ${esc(m.subject)}</div><iframe title="${esc(name)}" srcdoc="${esc(m.html)}"></iframe></div>`).join('\n')}
</div></body></html>`
writeFileSync(out, page)
console.log('written', out)
