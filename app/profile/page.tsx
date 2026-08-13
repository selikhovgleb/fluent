"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Profile = { name: string; email: string | null; dialect: string; explanationLanguage: string; translationLanguage: string; storeSentences: boolean };
type Dashboard = {
  profile: Profile;
  stats: { sentences: number; averageScore: number; words: number; remembered: number; due: number; streak: number };
  topics: Array<{ name: string; count: number }>;
  activity: Array<{ date: string; count: number }>;
};

const emptyProfile: Profile = { name: "", email: null, dialect: "en-US", explanationLanguage: "English", translationLanguage: "English", storeSentences: false };
const languages = ["English", "Polish", "Spanish", "German", "French", "Ukrainian"];

export default function ProfilePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [draft, setDraft] = useState<Profile>(emptyProfile);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { fetch("/api/profile").then(async (response) => {
    if (!response.ok) throw new Error("Could not load your profile.");
    const payload = await response.json() as Dashboard; setData(payload); setDraft(payload.profile);
  }).catch((error: Error) => setMessage(error.message)); }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const payload = await response.json() as { profile?: Profile; error?: string };
    if (!response.ok || !payload.profile) { setMessage(payload.error || "Could not save your preferences."); return; }
    setData((current) => current ? { ...current, profile: payload.profile! } : current);
    setDraft(payload.profile); setEditing(false); setMessage("Preferences saved.");
  }

  async function toggleSentenceStorage() {
    if (!data) return;
    const next = { ...data.profile, storeSentences: !data.profile.storeSentences };
    const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!response.ok) { setMessage("Could not update privacy settings."); return; }
    setData({ ...data, profile: next }); setDraft(next);
  }

  const activity = useMemo(() => {
    const byDate = new Map(data?.activity.map((item) => [item.date, item.count]) ?? []);
    return Array.from({ length: 35 }, (_, offset) => { const date = new Date(); date.setUTCDate(date.getUTCDate() - (34 - offset)); const key = date.toISOString().slice(0, 10); return { date: key, count: byDate.get(key) ?? 0 }; });
  }, [data]);
  const maxTopic = Math.max(...(data?.topics.map((topic) => topic.count) ?? []), 1);
  const displayName = data?.profile.name || "Fluent learner";
  const initials = displayName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "FL";

  return <main>
    <header className="topbar profile-topbar"><Link className="brand" href="/" aria-label="Fluent home"><span className="brand-mark">f.</span><span>fluent</span></Link><nav aria-label="Main navigation"><Link href="/"><span>✎</span> Writing coach</Link><Link href="/"><span>◫</span> My words</Link></nav><div className="streak"><span>◆</span><strong>{data?.stats.streak ?? 0}</strong><small>day streak</small></div><span className="avatar profile-avatar-small">{initials}</span></header>
    <div className="page-shell profile-page">
      <section className="profile-hero"><div className="profile-identity"><div className="profile-avatar-large">{initials}</div><div><p className="eyebrow">YOUR PROFILE</p><h1>{displayName}</h1><p>{data?.profile.email ?? "Google account"} · American English by default</p></div></div><button className="edit-profile" onClick={() => { if (data) { setDraft(data.profile); setEditing(true); } }}>✎ Edit preferences</button></section>
      {message && <p className="service-message">{message}</p>}
      <section className="profile-stats" aria-label="Learning statistics"><article><span className="stat-symbol">✎</span><div><strong>{data?.stats.sentences ?? 0}</strong><small>sentences checked</small></div></article><article><span className="stat-symbol yellow">◫</span><div><strong>{data?.stats.words ?? 0}</strong><small>words collected</small></div><em>{data?.stats.remembered ?? 0} reviewed</em></article><article><span className="stat-symbol coral">◆</span><div><strong>{data?.stats.streak ?? 0}</strong><small>day streak</small></div></article><article><span className="stat-symbol mint">↗</span><div><strong>{data?.stats.averageScore || "—"}</strong><small>average score</small></div></article></section>
      <div className="profile-grid"><section className="profile-main-column">
        <article className="progress-card"><div className="profile-section-title"><div><p className="eyebrow">YOUR PROGRESS</p><h2>Last 35 days</h2></div><span>Real correction activity</span></div><div className="activity-summary"><div><strong>{data?.stats.sentences ?? 0}</strong><span>all-time sentences</span></div><div><strong>{data?.stats.due ?? 0}</strong><span>words due</span></div></div><div className="activity-grid" aria-label="Correction activity over the last 35 days">{activity.map((item) => <i key={item.date} title={`${item.date}: ${item.count} corrections`} className={item.count > 2 ? "activity-high" : item.count > 0 ? "activity-mid" : ""} />)}</div><div className="activity-legend"><span>Less</span><i /><i className="activity-mid" /><i className="activity-high" /><span>More</span></div></article>
        <article className="mistake-card"><div className="profile-section-title"><div><p className="eyebrow">LEARNING INSIGHTS</p><h2>Your recurring topics</h2></div><span>Last 30 days</span></div><p className="section-description">These counts come from your real AI corrections. Sentence text stays private unless you explicitly enable history.</p>{data?.topics.length ? <div className="mistake-bars">{data.topics.map((topic, index) => <div key={topic.name}><span>{humanize(topic.name)}</span><div><i className={["coral", "yellow", "green", "mint"][index % 4]} style={{ width: `${Math.round(topic.count / maxTopic * 100)}%` }} /></div><strong>{topic.count}</strong></div>)}</div> : <div className="admin-empty"><p>No mistake trends yet. Check a few real work sentences to start tracking progress.</p></div>}<Link className="practice-link" href="/">Check another sentence <span>→</span></Link></article>
      </section><aside className="profile-side-column">
        <article className="goal-card"><p className="eyebrow">COACH SETTINGS</p><h2>{data?.profile.dialect === "en-GB" ? "British English" : "American English"}</h2><p>Explanations in {data?.profile.explanationLanguage ?? "English"}; vocabulary translations in {data?.profile.translationLanguage ?? "English"}.</p></article>
        <article className="preferences-card"><div className="preference-row privacy-row"><span>Save sentence history</span><button className={data?.profile.storeSentences ? "toggle on" : "toggle"} onClick={toggleSentenceStorage} aria-label="Toggle sentence history"><i /></button></div><p>{data?.profile.storeSentences ? "Original and corrected sentences are retained for future practice." : "Only scores and mistake categories are retained."}</p></article>
        <article className="achievements-card"><div className="profile-section-title"><div><p className="eyebrow">NOTIFICATIONS</p><h2>Not implemented yet</h2></div></div><p className="section-description">Browser and desktop notifications will stay off until you explicitly enable them in a future release.</p></article>
        <Link className="admin-entry-link" href="/admin"><span>◫</span><div><strong>Admin dashboard</strong><small>Available to allowlisted Google accounts</small></div><b>→</b></Link>
      </aside></div>
    </div>
    {editing && <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}><form className="profile-modal" role="dialog" aria-modal="true" aria-label="Edit preferences" onSubmit={saveProfile}><div className="modal-heading"><div><p className="eyebrow">PERSONALISE FLUENT</p><h2>Edit preferences</h2></div><button type="button" onClick={() => setEditing(false)} aria-label="Close profile editor">×</button></div><label>English dialect<select value={draft.dialect} onChange={(event) => setDraft({ ...draft, dialect: event.target.value })}><option value="en-US">American English</option><option value="en-GB">British English</option></select></label><label>Explanation language<select value={draft.explanationLanguage} onChange={(event) => setDraft({ ...draft, explanationLanguage: event.target.value })}>{languages.map((language) => <option key={language}>{language}</option>)}</select></label><label>Translation language<select value={draft.translationLanguage} onChange={(event) => setDraft({ ...draft, translationLanguage: event.target.value })}>{languages.map((language) => <option key={language}>{language}</option>)}</select></label><label>Sentence history<select value={draft.storeSentences ? "on" : "off"} onChange={(event) => setDraft({ ...draft, storeSentences: event.target.value === "on" })}><option value="off">Off — analytics only</option><option value="on">On — retain sentences</option></select></label><div className="modal-actions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button className="primary" type="submit">Save changes <span>→</span></button></div></form></div>}
  </main>;
}

function humanize(value: string) { return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
