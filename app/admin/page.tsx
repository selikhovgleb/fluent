import Link from "next/link";
import { requireAdmin } from "../../lib/auth/guards";
import { loadAdminDashboard } from "../../lib/admin/dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAdmin("/admin");
  const data = await loadAdminDashboard();
  const displayName = user.displayName ?? user.email ?? "Administrator";
  const maxCategory = Math.max(...data.categories.map((item) => item.count), 1);

  return (
    <main>
      <header className="topbar profile-topbar">
        <Link className="brand" href="/" aria-label="Fluent home"><span className="brand-mark">f.</span><span>fluent</span></Link>
        <nav aria-label="Admin navigation"><Link href="/"><span>✎</span> App</Link><Link href="/profile"><span>◫</span> Profile</Link><span className="admin-nav-active">Admin</span></nav>
        <div className="admin-user"><small>Signed in as</small><strong>{displayName}</strong></div>
        <span className="avatar profile-avatar-small">{initials(displayName)}</span>
      </header>

      <div className="page-shell admin-page">
        <section className="admin-intro">
          <div><p className="eyebrow">FLUENT OPERATIONS</p><h1>Admin <em>overview.</em></h1><p>A privacy-safe view of database health, learning activity, and AI usage.</p></div>
          <div className={data.status === "connected" ? "db-status connected" : "db-status error"}><i /><div><strong>{data.status === "connected" ? "Database connected" : "Database needs attention"}</strong><span>{data.status === "connected" ? "Aurora PostgreSQL · AWS" : data.error}</span></div></div>
        </section>

        <section className="admin-stats">
          <article className="admin-stat"><span>USERS</span><strong>{data.users}</strong><small>identified learners</small></article>
          <article className="admin-stat"><span>CORRECTIONS</span><strong>{data.corrections}</strong><small>successful AI checks</small></article>
          <article className="admin-stat"><span>AVERAGE SCORE</span><strong>{data.averageScore || "—"}</strong><small>out of 100</small></article>
          <article className="admin-stat"><span>VOCABULARY</span><strong>{data.words}</strong><small>{data.dueWords} due for review</small></article>
        </section>

        <div className="admin-grid">
          <section className="admin-main">
            <article className="admin-card">
              <div className="admin-card-title"><div><p className="eyebrow">LEARNING SIGNALS</p><h2>Most common mistakes</h2></div><span>All time</span></div>
              {data.categories.length ? <div className="admin-categories">{data.categories.map((item) => <div className="admin-category" key={item.category}><strong>{humanize(item.category)}</strong><div><i style={{ width: `${Math.round(item.count / maxCategory * 100)}%` }} /></div><b>{item.count}</b></div>)}</div> : <EmptyState text="Mistake trends will appear after the first successful AI correction." />}
            </article>

            <article className="admin-card recent-card">
              <div className="admin-card-title"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Correction events</h2></div><span>Sentence text hidden</span></div>
              {data.recent.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Score</th><th>Mistakes</th><th>Text stored</th><th>Model</th><th>Date</th></tr></thead><tbody>{data.recent.map((event) => <tr key={event.id}><td>{event.user}</td><td><b className="admin-table-score">{event.score}</b></td><td>{event.mistakes}</td><td><span className={event.sentenceStored ? "admin-pill admin-pill-stored" : "admin-pill"}>{event.sentenceStored ? "Yes" : "No"}</span></td><td><small>{event.model}</small></td><td><small>{formatDate(event.createdAt)}</small></td></tr>)}</tbody></table></div> : <EmptyState text="No correction events have been recorded yet." />}
            </article>
          </section>

          <aside className="admin-side">
            <article className="admin-card admin-privacy"><p className="eyebrow">PRIVACY CHECK</p><div className="admin-privacy-stat"><strong>{data.storedSentences}</strong><span>sentences<br />stored</span></div><p>{data.storedSentences === 0 ? "Privacy mode is working: only scores and category counts are retained." : "These records belong to users who explicitly enabled sentence history."}</p></article>
            <article className="admin-card"><div className="admin-card-title"><div><p className="eyebrow">AI CONTRACTS</p><h2>Models in use</h2></div></div>{data.models.length ? <div className="admin-models">{data.models.map((item) => <div className="admin-model" key={`${item.model}-${item.promptVersion}`}><strong>{item.model}</strong><span>{item.count}</span><small>{item.promptVersion}</small></div>)}</div> : <EmptyState text="Models will be listed after AI is activated." />}</article>
            <article className="admin-card admin-access"><p className="eyebrow">ACCESS</p><h2>Google-protected dashboard</h2><p>Only Google accounts listed in the ADMIN_EMAILS environment variable can open this page.</p><Link href="/profile">Account settings <span>→</span></Link></article>
          </aside>
        </div>
      </div>
    </main>
  );
}

function EmptyState({ text }: { text: string }) { return <div className="admin-empty"><span>◎</span><p>{text}</p></div>; }
function humanize(value: string) { return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function initials(value: string) { return value.split(/[\s@.]+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatDate(value: string) { const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
