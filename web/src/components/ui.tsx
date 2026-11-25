import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Tone } from '../data/sample'

export const Pill = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`pill ${tone}`}>{children}</span>
export const SampleBadge = () => <span className="badge">Sample data</span>

export function PageHead({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <header className="head">
      <div><h1>{title}</h1><div className="sub">{sub}</div></div>
      <div className="row"><SampleBadge />{children}</div>
    </header>
  )
}
export const OnboardLink = () => <Link className="btn primary" to="/onboard">+ Onboard a shop</Link>

export function Field({ label, id, hint, error, children }: { label: string; id: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <div className="err" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

/** A dropdown filter: the first option means "no filter"; `match` says whether a row fits the chosen value. */
export interface Filter<T> { label: string; options: string[]; match: (row: T, value: string) => boolean }

/** Search box + dropdown filters + table, used by every list page. `text` is what the search box looks in. */
export function ListTable<T>({ rows, head, row, text, searchHint, filters = [], note }: {
  rows: T[]; head: string[]; row: (r: T) => ReactNode; text: (r: T) => string; searchHint: string; filters?: Filter<T>[]; note?: ReactNode
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>(() => filters.map((f) => f.options[0]!))
  const shown = useMemo(() => rows.filter((r) => {
    if (q.trim() && !text(r).toLowerCase().includes(q.trim().toLowerCase())) return false
    return filters.every((f, i) => sel[i] === f.options[0] || f.match(r, sel[i]!))
  }), [rows, q, sel, filters, text])
  return (
    <>
      <div className="card filters">
        <div className="field grow"><label htmlFor="q">Search</label><input id="q" value={q} placeholder={searchHint} onChange={(e) => setQ(e.target.value)} /></div>
        {filters.map((f, i) => (
          <div className="field" key={f.label}>
            <label htmlFor={`f${i}`}>{f.label}</label>
            <select id={`f${i}`} value={sel[i]} onChange={(e) => setSel(sel.map((v, j) => (j === i ? e.target.value : v)))}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
          </div>
        ))}
      </div>
      <div className="card table-card">
        <div className="scroll">
          <table>
            <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((r, i) => <tr key={i}>{row(r)}</tr>)}
              {!shown.length && <tr><td colSpan={head.length} className="muted">Nothing matches. Clear the search or the filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="muted small">Sample data · showing {shown.length} of {rows.length} rows</div>
      </div>
      {note && <p className="note">{note}</p>}
    </>
  )
}

export const LinkBtn = ({ children, to, onClick }: { children: ReactNode; to?: string; onClick?: () => void }) =>
  to ? <Link className="btn small" to={to}>{children}</Link> : <button type="button" className="btn small" onClick={onClick}>{children}</button>
