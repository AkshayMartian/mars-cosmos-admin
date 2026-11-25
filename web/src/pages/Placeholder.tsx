/** A page that is designed but not built yet. The design is in the shared preview file. */
export function Placeholder({ title, blurb }: { title: string; blurb: string }) {
  return (
    <>
      <header className="head">
        <div>
          <h1>{title}</h1>
          <div className="sub">{blurb}</div>
        </div>
      </header>
      <div className="card empty">This page is designed and not built yet.</div>
    </>
  )
}
