"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Profile = {
  name: string;
  role: string;
  level: string;
  goal: string;
  dailyTarget: string;
  nativeLanguage: string;
  explanationLanguage: string;
  translationLanguage: string;
  storeSentences: boolean;
  reminder: boolean;
};

const initialProfile: Profile = {
  name: "Alex Kowalski",
  role: "Product designer",
  level: "Intermediate (B1–B2)",
  goal: "Write clearer messages at work",
  dailyTarget: "3 sentences",
  nativeLanguage: "Polish",
  explanationLanguage: "English",
  translationLanguage: "Polish",
  storeSentences: false,
  reminder: true,
};

const mistakeTopics = [
  { name: "Verb tense", value: 68, count: 14, color: "coral" },
  { name: "Articles", value: 48, count: 10, color: "yellow" },
  { name: "Prepositions", value: 34, count: 7, color: "green" },
  { name: "Word order", value: 20, count: 4, color: "mint" },
];

export default function ProfilePage() {
  const [profile, setProfile] = useState(initialProfile);
  const [draft, setDraft] = useState(initialProfile);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("fluent-profile");
    if (stored) {
      const parsed = { ...initialProfile, ...JSON.parse(stored) } as Profile;
      setProfile(parsed);
      setDraft(parsed);
    }
  }, []);

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfile(draft);
    localStorage.setItem("fluent-profile", JSON.stringify(draft));
    setEditing(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  const initials = profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main>
      <header className="topbar profile-topbar">
        <Link className="brand" href="/" aria-label="Fluent home"><span className="brand-mark">f.</span><span>fluent</span></Link>
        <nav aria-label="Main navigation">
          <Link href="/"><span>✎</span> Writing coach</Link>
          <Link href="/"><span>◫</span> My words</Link>
        </nav>
        <div className="streak"><span>◆</span><strong>7</strong><small>day streak</small></div>
        <span className="avatar profile-avatar-small">{initials}</span>
      </header>

      <div className="page-shell profile-page">
        <section className="profile-hero">
          <div className="profile-identity">
            <div className="profile-avatar-large">{initials}<span>7</span></div>
            <div><p className="eyebrow">YOUR PROFILE</p><h1>{profile.name}</h1><p>{profile.role} · Learning from {profile.nativeLanguage}</p></div>
          </div>
          <button className="edit-profile" onClick={() => { setDraft(profile); setEditing(true); }}>✎ Edit profile</button>
        </section>

        <section className="profile-stats" aria-label="Learning statistics">
          <article><span className="stat-symbol">✎</span><div><strong>47</strong><small>sentences checked</small></div><em>+12 this week</em></article>
          <article><span className="stat-symbol yellow">◫</span><div><strong>36</strong><small>words collected</small></div><em>9 remembered</em></article>
          <article><span className="stat-symbol coral">◆</span><div><strong>7</strong><small>day streak</small></div><em>Best: 11 days</em></article>
          <article><span className="stat-symbol mint">↗</span><div><strong>84</strong><small>average score</small></div><em>+6 this month</em></article>
        </section>

        <div className="profile-grid">
          <section className="profile-main-column">
            <article className="progress-card">
              <div className="profile-section-title"><div><p className="eyebrow">YOUR PROGRESS</p><h2>August activity</h2></div><span>18 active days</span></div>
              <div className="activity-summary"><div><strong>23</strong><span>sentences</span></div><div><strong>14</strong><span>new words</span></div><div><strong>82%</strong><span>weekly goal</span></div></div>
              <div className="activity-grid" aria-label="Activity calendar for August">
                {Array.from({ length: 35 }, (_, index) => <i key={index} className={index % 6 === 0 || [2,3,9,10,16,17,18,24,25,30].includes(index) ? (index % 3 === 0 ? "activity-high" : "activity-mid") : ""} />)}
              </div>
              <div className="activity-legend"><span>Less</span><i /><i className="activity-mid" /><i className="activity-high" /><span>More</span></div>
            </article>

            <article className="mistake-card">
              <div className="profile-section-title"><div><p className="eyebrow">LEARNING INSIGHTS</p><h2>Your recurring topics</h2></div><span>Last 30 days</span></div>
              <p className="section-description">These are the patterns that appear most often in your writing. Focus on the first two for the fastest improvement.</p>
              <div className="mistake-bars">
                {mistakeTopics.map((topic) => <div key={topic.name}><span>{topic.name}</span><div><i className={topic.color} style={{ width: `${topic.value}%` }} /></div><strong>{topic.count}</strong></div>)}
              </div>
              <Link className="practice-link" href="/">Practise your weakest topic <span>→</span></Link>
            </article>
          </section>

          <aside className="profile-side-column">
            <article className="goal-card">
              <p className="eyebrow">CURRENT GOAL</p><h2>Write with confidence at work</h2><p>{profile.goal}. Keep checking real messages and reach your daily target.</p>
              <div className="goal-progress"><div><i /></div><span>18 / 22 practice days</span></div>
              <div className="goal-meta"><span>Daily target<strong>{profile.dailyTarget}</strong></span><span>Level<strong>{profile.level.split(" ")[0]}</strong></span></div>
            </article>

            <article className="achievements-card">
              <div className="profile-section-title"><div><p className="eyebrow">ACHIEVEMENTS</p><h2>Small wins</h2></div><span>3 / 8</span></div>
              <div className="badges"><div><span>7</span><strong>Week strong</strong><small>7-day streak</small></div><div><span>✦</span><strong>Word collector</strong><small>25 words saved</small></div><div><span>✓</span><strong>Clear writer</strong><small>Score above 90</small></div></div>
            </article>

            <article className="preferences-card">
              <div className="preference-row"><span>Daily reminder</span><button className={profile.reminder ? "toggle on" : "toggle"} onClick={() => { const next = { ...profile, reminder: !profile.reminder }; setProfile(next); setDraft(next); localStorage.setItem("fluent-profile", JSON.stringify(next)); }} aria-label="Toggle daily reminder"><i /></button></div>
              <p>{profile.reminder ? "We’ll remind you to practise at 9:00 AM." : "Daily practice reminders are off."}</p>
              <div className="preference-row privacy-row"><span>Save sentence history</span><button className={profile.storeSentences ? "toggle on" : "toggle"} onClick={() => { const next = { ...profile, storeSentences: !profile.storeSentences }; setProfile(next); setDraft(next); localStorage.setItem("fluent-profile", JSON.stringify(next)); }} aria-label="Toggle sentence history"><i /></button></div>
              <p>{profile.storeSentences ? "Original and corrected sentences may be saved." : "Only scores and mistake categories are retained."}</p>
            </article>
          </aside>
        </div>
      </div>

      {editing && <div className="profile-modal-backdrop" onMouseDown={() => setEditing(false)}>
        <form className="profile-modal" onSubmit={saveProfile} onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-heading"><div><p className="eyebrow">PERSONALISE FLUENT</p><h2>Edit your profile</h2></div><button type="button" onClick={() => setEditing(false)} aria-label="Close profile editor">×</button></div>
          <label>Your name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
          <label>Your role<input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></label>
          <label>English level<select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })}><option>Beginner (A1–A2)</option><option>Intermediate (B1–B2)</option><option>Advanced (C1–C2)</option></select></label>
          <label>Native language<input value={draft.nativeLanguage} onChange={(e) => setDraft({ ...draft, nativeLanguage: e.target.value })} /></label>
          <label>Explanation language<select value={draft.explanationLanguage} onChange={(e) => setDraft({ ...draft, explanationLanguage: e.target.value })}><option>English</option><option>Polish</option><option>Spanish</option><option>German</option><option>French</option><option>Ukrainian</option></select></label>
          <label>Translation language<select value={draft.translationLanguage} onChange={(e) => setDraft({ ...draft, translationLanguage: e.target.value })}><option>Polish</option><option>English</option><option>Spanish</option><option>German</option><option>French</option><option>Ukrainian</option></select></label>
          <label className="full-field">Learning goal<input value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} /></label>
          <label className="full-field">Daily target<select value={draft.dailyTarget} onChange={(e) => setDraft({ ...draft, dailyTarget: e.target.value })}><option>1 sentence</option><option>3 sentences</option><option>5 sentences</option><option>10 sentences</option></select></label>
          <div className="modal-actions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button className="primary" type="submit">Save changes <span>→</span></button></div>
        </form>
      </div>}
      {saved && <div className="profile-toast">✓ Profile saved</div>}
    </main>
  );
}
