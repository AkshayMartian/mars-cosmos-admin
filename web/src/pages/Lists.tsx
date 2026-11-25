import { Link } from 'react-router-dom'
import { ADMINS, AUDIT, KEYS, LICENCES, MESSAGES, PIN_RESETS, PLANS, SHOPS } from '../data/sample'
import { LinkBtn, ListTable, OnboardLink, PageHead, Pill } from '../components/ui'
import { NAV } from '../nav'

const sub = (path: string) => NAV.find((n) => n.path === path)!.blurb
const Cell = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => <td>{strong ? <b>{children}</b> : children}</td>

export function Shops() {
  const statusOf = { 'Active': 'active', 'Waiting to activate': 'waiting', 'Ending soon': 'ending', 'Expired': 'expired', 'Suspended': 'suspended' } as Record<string, string>
  return (
    <>
      <PageHead title="Shops" sub={sub('/shops')}><OnboardLink /></PageHead>
      <ListTable rows={SHOPS} searchHint="Shop, owner, mobile, GST number or key" text={(s) => `${s.name} ${s.owner} ${s.mobile} ${s.city}`}
        filters={[
          { label: 'Status', options: ['All', ...Object.keys(statusOf)], match: (s, v) => s.status === statusOf[v] },
          { label: 'Plan', options: ['All plans', 'Starter', 'Growth', 'Trial'], match: (s, v) => s.plan === v }
        ]}
        head={['Shop', 'City', 'Plan', 'Licence', 'App', 'Last seen', 'Open']}
        row={(s) => (
          <>
            <td><b>{s.name}</b><div className="muted small">{s.owner} · {s.mobile}</div></td>
            <Cell>{s.city}</Cell>
            <Cell>{s.plan} · {s.backup}</Cell>
            <td><Pill tone={s.licenceTone}>{s.licence}</Pill></td>
            <td><Pill tone={s.appTone}>{s.app}</Pill></td>
            <Cell>{s.lastSeen}</Cell>
            <td><LinkBtn to={`/shops/${s.id}`}>Open</LinkBtn></td>
          </>
        )} />
    </>
  )
}

export function ActivationKeys() {
  return (
    <>
      <PageHead title="Activation keys" sub={sub('/activation-keys')}><OnboardLink /></PageHead>
      <ListTable rows={KEYS} searchHint="Key, shop or mobile" text={(k) => `${k.key} ${k.shop} ${k.mobile}`}
        filters={[
          { label: 'Status', options: ['All', 'Issued', 'Activated', 'Revoked'], match: (k, v) => k.status.startsWith(v) },
          { label: 'WhatsApp', options: ['All', 'Delivered', 'Sent', 'Failed'], match: (k, v) => k.wa.startsWith(v) }
        ]}
        head={['Key', 'Shop', 'Owner mobile', 'Status', 'WhatsApp', 'Issued', 'Activated on', '']}
        row={(k) => (
          <>
            <td className="mono">{k.key}</td><Cell strong>{k.shop}</Cell><Cell>{k.mobile}</Cell>
            <td><Pill tone={k.tone}>{k.status}</Pill></td><td><Pill tone={k.waTone}>{k.wa}</Pill></td>
            <Cell>{k.issued}</Cell><Cell>{k.pc}</Cell>
            <td className="acts">{k.actions.map((a) => <LinkBtn key={a}>{a}</LinkBtn>)}</td>
          </>
        )}
        note="Keys are shown masked. The owner enters the full key and the same mobile number in the app, once. Resend uses the number on the shop record." />
    </>
  )
}

export function Licences() {
  return (
    <>
      <PageHead title="Licences" sub={sub('/licences')} />
      <ListTable rows={LICENCES} searchHint="Shop or key" text={(l) => `${l.shop} ${l.city}`}
        filters={[
          { label: 'Status', options: ['All', 'Active', 'Ending in 14 days', 'Expired', 'Trial'], match: (l, v) => (v === 'Ending in 14 days' ? l.status.startsWith('Ends') : l.status.startsWith(v)) },
          { label: 'Plan', options: ['All plans', 'Starter', 'Growth', 'Trial'], match: (l, v) => l.plan === v }
        ]}
        head={['Shop', 'Plan', 'Backup', 'Counters', 'Valid till', 'Status', 'Last check', '']}
        row={(l) => (
          <>
            <td><b>{l.shop}</b><div className="muted small">{l.city}</div></td>
            <Cell>{l.plan}</Cell><Cell>{l.backup}</Cell><Cell>{l.counters}</Cell><Cell>{l.till}</Cell>
            <td><Pill tone={l.tone}>{l.status}</Pill></td><Cell>{l.check}</Cell>
            <td>{l.action && <LinkBtn>{l.action}</LinkBtn>}</td>
          </>
        )}
        note="Renewal over the internet reaches the app by itself. For a shop with no internet, issue a renewal code here and read it out; the owner types it into the app." />
    </>
  )
}

export function PinResets() {
  return (
    <>
      <PageHead title="PIN resets" sub={sub('/pin-resets')} />
      <ListTable rows={PIN_RESETS} searchHint="Shop" text={(r) => r.shop}
        filters={[{ label: 'Status', options: ['All', 'Waiting for the owner', 'New PIN saved', 'Applied on the PC', 'Expired'], match: (r, v) => r.status === v }]}
        head={['Shop', 'Requested', 'From PC', 'Email sent to', 'Status', 'Finished']}
        row={(r) => (
          <>
            <Cell strong>{r.shop}</Cell><Cell>{r.at}</Cell><td className="mono">{r.pc}</td><Cell>{r.email}</Cell>
            <td><Pill tone={r.tone}>{r.status}</Pill></td><Cell>{r.done}</Cell>
          </>
        )}
        note={<>Watch for: three or more requests for one shop in 24 hours (shown on the Dashboard). Requests are limited to 3 per hour, links work once, and every step is in the audit log. The page the owner sees: <Link to="/reset-pin">open the PIN reset page</Link>.</>} />
    </>
  )
}

export function Messages() {
  return (
    <>
      <PageHead title="Messages" sub={sub('/messages')} />
      <ListTable rows={MESSAGES} searchHint="Shop or recipient" text={(m) => `${m.shop} ${m.to}`}
        filters={[
          { label: 'Type', options: ['All', 'Activation key', 'Verification code', 'PIN reset email', 'PIN changed'], match: (m, v) => m.type === v },
          { label: 'Channel', options: ['All', 'WhatsApp', 'Email', 'SMS'], match: (m, v) => m.channel === v },
          { label: 'Status', options: ['All', 'Delivered', 'Sent', 'Failed'], match: (m, v) => m.status.startsWith(v) }
        ]}
        head={['Time', 'Shop', 'Type', 'Channel', 'To', 'Status', '']}
        row={(m) => (
          <>
            <Cell>{m.time}</Cell><Cell strong>{m.shop}</Cell><Cell>{m.type}</Cell><Cell>{m.channel}</Cell><Cell>{m.to}</Cell>
            <td><Pill tone={m.tone}>{m.status}</Pill></td><td>{m.action && <LinkBtn>{m.action}</LinkBtn>}</td>
          </>
        )}
        note="Recipients are always masked. Failed messages can be retried; a failed WhatsApp key shows on the Dashboard until it is fixed." />
    </>
  )
}

export function AuditLog() {
  return (
    <>
      <PageHead title="Audit log" sub={sub('/audit-log')} />
      <ListTable rows={AUDIT} searchHint="Shop, person or action" text={(a) => `${a.who} ${a.action} ${a.shop} ${a.detail}`}
        filters={[
          { label: 'Action', options: ['All', 'Shop created', 'Key sent', 'App activated', 'PC released', 'Licence renewed', 'PIN reset', 'Sign-in'], match: (a, v) => a.action.toLowerCase().includes(v.toLowerCase().replace(' sent', '')) },
          { label: 'Date', options: ['Last 7 days', 'Today', 'Last 30 days'], match: () => true }
        ]}
        head={['Time', 'Who', 'Action', 'Shop', 'Details']}
        row={(a) => <><Cell>{a.time}</Cell><Cell>{a.who}</Cell><Cell strong>{a.action}</Cell><Cell>{a.shop}</Cell><Cell>{a.detail}</Cell></>} />
    </>
  )
}

export function Plans() {
  return (
    <>
      <PageHead title="Plans" sub={sub('/plans')}><button className="btn primary" type="button">+ New plan</button></PageHead>
      <section className="plans">
        {PLANS.map((p) => (
          <div className="card plan" key={p.name}>
            <div className="row between"><h2>{p.name}</h2><span className="pill mute">{p.count}</span></div>
            <div className="price">{p.price}</div>
            <ul>{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <LinkBtn>Edit plan</LinkBtn>
          </div>
        ))}
      </section>
      <p className="note">Prices marked [PRICE] are still to be decided. Changing a plan affects new shops and renewals, not licences already issued.</p>
    </>
  )
}

export function AdminUsers() {
  return (
    <>
      <PageHead title="Admin users" sub={sub('/admin-users')}><button className="btn primary" type="button">+ Invite admin</button></PageHead>
      <div className="card table-card">
        <div className="scroll">
          <table>
            <thead><tr>{['Name', 'Email', 'Role', 'Last sign-in', 'Status', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>
              {ADMINS.map((a) => (
                <tr key={a.email}>
                  <Cell strong>{a.name}</Cell><Cell>{a.email}</Cell><td><Pill tone={a.role === 'Admin' ? 'ok' : 'mute'}>{a.role}</Pill></td><Cell>{a.last}</Cell>
                  <td><Pill tone="ok">Active</Pill></td><td className="acts">{a.actions.map((x) => <LinkBtn key={x}>{x}</LinkBtn>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted small">Sample data · showing {ADMINS.length} rows</div>
      </div>
      <p className="note"><b>Roles.</b> Admin: everything, including plans and users. Support: view shops, resend keys, release a PC, issue renewal codes. No one can read an owner PIN or password; they are never stored in a readable form.</p>
    </>
  )
}
