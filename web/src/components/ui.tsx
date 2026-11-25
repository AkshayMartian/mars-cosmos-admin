import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Tone } from '../store'

export const Chip = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`chip ${tone}`}>{children}</span>
export const SampleNote = () => <p className="sample">Sample data for the prototype.</p>

export function Field({ label, id, hint, error, children }: { label: string; id: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="f">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <div className="err" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return <div className="scrim" role="dialog" aria-modal="true"><div className="modal">{children}</div></div>
}

/** One short message at the bottom of the screen. */
let toastText: string | null = null
let toastTimer: ReturnType<typeof setTimeout> | undefined
const toastListeners = new Set<() => void>()
export function toast(message: string): void {
  toastText = message
  toastListeners.forEach((l) => l())
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText = null; toastListeners.forEach((l) => l()) }, 2600)
}
export function Toast() {
  const t = useSyncExternalStore((cb) => { toastListeners.add(cb); return () => { toastListeners.delete(cb) } }, () => toastText)
  return t ? <div className="toast" role="status">{t}</div> : null
}

export function copyText(t: string): void {
  navigator.clipboard.writeText(t).then(() => toast('Copied'), () => toast('Select the text to copy'))
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<[T, string]>; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  )
}

/** A password box with a Show / Hide button. Pass the same props as an input. */
export function PasswordInput({ style, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="pw">
      <input {...props} type={shown ? 'text' : 'password'} style={style} />
      <button type="button" className="pw-toggle" aria-pressed={shown} onClick={() => setShown((s) => !s)}>{shown ? 'Hide' : 'Show'}</button>
    </div>
  )
}
