import { describe, expect, it } from 'vitest'
import { activationKeyEmail, codeEmail, esc, pinChangedEmail, pinResetEmail } from '../src/lib/emailTemplates.js'

const LINK = 'https://admin.example.com/reset-pin?token=abc_DEF-123'
const all = () => [codeEmail('204815'), activationKeyEmail('Raj Fashion', 'MARS-7K2Q-9XFD-4LPA'), pinResetEmail('Raj Fashion', LINK, 15), pinChangedEmail('Raj Fashion')]

describe('email templates', () => {
  it('every email has a subject, a plain-text copy and an HTML page', () => {
    for (const m of all()) {
      expect(m.subject.length).toBeGreaterThan(5)
      expect(m.text.length).toBeGreaterThan(20)
      expect(m.html).toMatch(/^<!doctype html>/)
      expect(m.html).toContain('MARS Cosmos')
    }
  })

  it('carries the code, the key and the link where the person needs them', () => {
    expect(codeEmail('204815').html).toContain('204815')
    expect(codeEmail('204815').subject).toContain('204815')
    expect(activationKeyEmail('Raj Fashion', 'MARS-7K2Q-9XFD-4LPA').html).toContain('MARS-7K2Q-9XFD-4LPA')
    const reset = pinResetEmail('Raj Fashion', LINK, 15)
    expect(reset.html.match(/href="https:\/\/admin\.example\.com\/reset-pin\?token=abc_DEF-123"/g)).toHaveLength(2) // the button and the fallback link
    expect(reset.html).toContain('15 minutes')
    expect(reset.text).toContain(LINK)
  })

  it('escapes a shop name so it cannot add markup', () => {
    const evil = '<script>alert(1)</script> & "Co"'
    for (const m of [activationKeyEmail(evil, 'MARS-7K2Q-9XFD-4LPA'), pinResetEmail(evil, LINK, 15), pinChangedEmail(evil)]) {
      expect(m.html).not.toContain('<script>')
      expect(m.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;')
    }
    expect(esc(`a<b>&'"`)).toBe('a&lt;b&gt;&amp;&#39;&quot;')
  })

  it('loads nothing from the internet and has no scripts', () => {
    for (const m of all()) {
      expect(m.html).not.toMatch(/<script|<img|<link|@import|url\(/i)
      expect(m.html.match(/https?:\/\/[^"'\s<)]+/g)?.filter((u) => !u.startsWith('https://admin.example.com')) ?? []).toEqual([])
    }
  })
})
