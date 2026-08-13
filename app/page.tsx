"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ErrorItem = { wrong: string; right: string; category: string; note: string };
type CorrectionResult = { corrected: string; found: ErrorItem[]; score: number };
type Word = { id: string; word: string; translation: string; example: string; cefrLevel: string; reviewCount: number };
type Preferences = { dialect: string; explanationLanguage: string; translationLanguage: string; storeSentences: boolean };
type ProfileData = { profile: Preferences & { name: string }; stats: { sentences: number; streak: number } };

function HighlightedText({ text, errors }: { text: string; errors: ErrorItem[] }) {
  if (!errors.length) return <>{text}</>;
  const escaped = errors.map((error) => error.wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  if (!escaped.length) return <>{text}</>;
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  return <>{text.split(regex).map((part, index) => errors.some((error) => error.wrong.toLowerCase() === part.toLowerCase()) ? <mark key={index}>{part}</mark> : part)}</>;
}

export default function Home() {
  const [section, setSection] = useState<"writing" | "words">("writing");
  const [text, setText] = useState("");
  const [analysedText, setAnalysedText] = useState("");
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [example, setExample] = useState("");
  const [currentWord, setCurrentWord] = useState(0);
  const [checking, setChecking] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [vocabLoading, setVocabLoading] = useState(false);
  const [vocabMessage, setVocabMessage] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/profile"), fetch("/api/vocabulary")]).then(async ([profileResponse, wordsResponse]) => {
      if (profileResponse.ok) setProfile(await profileResponse.json() as ProfileData);
      if (wordsResponse.ok) setWords((await wordsResponse.json() as { words: Word[] }).words);
    }).catch(() => setVocabMessage("Could not load your saved data. Refresh to try again."));
  }, []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    result?.found.forEach((error) => counts.set(error.category, (counts.get(error.category) ?? 0) + 1));
    return [...counts.entries()];
  }, [result]);

  async function checkWriting() {
    const input = text.trim();
    if (!input) return;
    setChecking(true); setAiMessage("");
    try {
      const preferences = profile?.profile;
      const response = await fetch("/api/corrections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, dialect: preferences?.dialect ?? "en-US", tone: "professional-natural", explanationLanguage: preferences?.explanationLanguage ?? "English", proficiency: "B1-B2", storeSentence: preferences?.storeSentences === true }),
      });
      const payload = await response.json() as { corrected?: string; found?: ErrorItem[]; score?: number; error?: string };
      if (!response.ok || !payload.corrected || !Array.isArray(payload.found)) throw new Error(payload.error || "AI correction is unavailable.");
      setAnalysedText(input);
      setResult({ corrected: payload.corrected, found: payload.found, score: payload.score ?? 100 });
      setAiMessage(preferences?.storeSentences ? "Analysis saved with sentence history." : "Analysis complete. Only your score and mistake categories were retained.");
      setProfile((current) => current ? { ...current, stats: { ...current.stats, sentences: current.stats.sentences + 1 } } : current);
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "AI correction is unavailable.");
    } finally { setChecking(false); }
  }

  async function addWord(event: FormEvent) {
    event.preventDefault();
    if (!word.trim()) return;
    setVocabLoading(true); setVocabMessage("");
    try {
      const manual = Boolean(translation.trim());
      const response = await fetch(manual ? "/api/vocabulary" : "/api/vocabulary/enrich", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manual
          ? { word, translation, example, targetLanguage: profile?.profile.translationLanguage ?? "English" }
          : { word, context: example, targetLanguage: profile?.profile.translationLanguage ?? "English" }),
      });
      const payload = await response.json() as { word?: Word; error?: string };
      if (!response.ok || !payload.word) throw new Error(payload.error || "Could not save this word.");
      setWords((items) => [payload.word!, ...items]);
      setWord(""); setTranslation(""); setExample("");
      setVocabMessage(manual ? "Word saved to your account." : "AI created and saved the translation and example.");
    } catch (error) { setVocabMessage(error instanceof Error ? error.message : "Could not save this word."); }
    finally { setVocabLoading(false); }
  }

  async function removeWord(id: string) {
    const response = await fetch(`/api/vocabulary/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) { setVocabMessage("Could not remove this word. Please try again."); return; }
    setWords((items) => items.filter((item) => item.id !== id)); setCurrentWord(0);
  }

  async function rememberWord(item: Word) {
    const response = await fetch(`/api/vocabulary/${encodeURIComponent(item.id)}/review`, { method: "POST" });
    if (!response.ok) { setVocabMessage("Could not record this review. Please try again."); return; }
    setWords((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, reviewCount: candidate.reviewCount + 1 } : candidate));
    setCurrentWord((index) => words.length ? (index + 1) % words.length : 0);
  }

  const featured = words.length ? words[currentWord % words.length] : undefined;
  const displayName = profile?.profile.name ?? "Fluent learner";
  const initials = displayName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "FL";

  return <main>
    <header className="topbar">
      <button className="brand" onClick={() => setSection("writing")} aria-label="Fluent home"><span className="brand-mark">f.</span><span>fluent</span></button>
      <nav aria-label="Main navigation">
        <button className={section === "writing" ? "nav-active" : ""} onClick={() => setSection("writing")}><span>✎</span> Writing coach</button>
        <button className={section === "words" ? "nav-active" : ""} onClick={() => setSection("words")}><span>◫</span> My words <b>{words.length}</b></button>
      </nav>
      <div className="streak"><span>◆</span><strong>{profile?.stats.streak ?? 0}</strong><small>day streak</small></div>
      <Link className="avatar" href="/profile" aria-label="Open profile">{initials}</Link>
    </header>

    {section === "writing" ? <div className="page-shell writing-page">
      <section className="intro"><div><p className="eyebrow">YOUR DAILY PRACTICE</p><h1>Write with more <em>confidence.</em></h1><p>Paste a sentence from your work. Fluent corrects it, explains why, and tracks the topics you need to practise.</p></div><div className="weekly-card"><div><span>All time</span><strong>{profile?.stats.sentences ?? 0}</strong><small>sentences checked</small></div></div></section>
      <section className="workspace-grid">
        <div className="editor-card"><div className="card-heading"><div><span className="step">01</span><h2>Your sentence</h2></div><span className="shortcut">Ctrl + Enter</span></div><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter") checkWriting(); }} maxLength={2000} aria-label="Sentence to check" placeholder="Write or paste an English sentence…" /><div className="editor-footer"><span>{text.length} / 2000</span><button className="primary" onClick={checkWriting} disabled={checking || !text.trim()}>{checking ? "Analysing…" : "Check my English"} <span>→</span></button></div>{aiMessage && <p className={result ? "service-message" : "service-message warning"}>{aiMessage}</p>}</div>
        <div className="result-card"><div className="card-heading"><div><span className="step mint">02</span><h2>Improved version</h2></div>{result && <button className="icon-button" onClick={() => navigator.clipboard?.writeText(result.corrected)} aria-label="Copy improved sentence">□</button>}</div>{result ? <><p className="corrected">{result.corrected}</p><div className="tone-row"><span>Professional</span><span>Clear</span><span>Natural</span></div></> : <p className="corrected">Your AI-corrected sentence will appear here.</p>}</div>
      </section>
      {result && <section className="feedback-grid"><div className="mistakes-panel"><div className="section-title"><div><p className="eyebrow">YOUR FEEDBACK</p><h2>{result.found.length ? `${result.found.length} things to learn` : "Beautifully written"}</h2></div><span className="score">{result.score}<small>/100</small></span></div><p className="original"><HighlightedText text={analysedText} errors={result.found} /></p><div className="error-list">{result.found.length ? result.found.map((error, index) => <article key={`${error.wrong}-${index}`}><span className="error-number">{String(index + 1).padStart(2, "0")}</span><div><span className="category">{error.category}</span><h3><del>{error.wrong}</del><span>→</span>{error.right}</h3><p>{error.note}</p></div></article>) : <div className="empty-feedback">No clear errors found. Your sentence is ready to send.</div>}</div></div><aside className="focus-panel"><p className="eyebrow">YOUR FOCUS</p><h2>Topics to practise</h2>{categories.length ? categories.map(([name, count], index) => <div className="topic" key={name}><div className={`topic-icon c${index % 3}`}>{name.charAt(0)}</div><div><strong>{name}</strong><span>{count} {count === 1 ? "mistake" : "mistakes"}</span></div></div>) : <p className="all-good">No weak spots in this sentence.</p>}</aside></section>}
    </div> : <div className="page-shell words-page">
      <section className="words-intro"><div><p className="eyebrow">BUILD YOUR VOCABULARY</p><h1>Words that finally <em>stick.</em></h1><p>Add useful words from your day. They are saved to your account and scheduled for spaced review.</p></div><button className="primary" onClick={() => document.getElementById("new-word")?.focus()}>+ Add a new word</button></section>
      <div className="vocab-grid"><section><form className="word-form" onSubmit={addWord}><div className="card-heading"><div><span className="step">01</span><h2>Add to your collection</h2></div></div><label>English word<input id="new-word" value={word} onChange={(event) => setWord(event.target.value)} placeholder="e.g. thoughtful" required /></label><label>Translation <span>(optional; AI fills it when blank)</span><input value={translation} onChange={(event) => setTranslation(event.target.value)} placeholder="Leave blank for AI" /></label><label>Example sentence <span>(optional)</span><input value={example} onChange={(event) => setExample(event.target.value)} placeholder="Use it in a sentence you’ll remember" /></label><button className="primary" type="submit" disabled={vocabLoading}>{vocabLoading ? "Saving…" : "Add word"} <span>→</span></button>{vocabMessage && <p className="service-message vocab-service-message">{vocabMessage}</p>}</form><div className="collection-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h2>{words.length} words in rotation</h2></div><span>Saved to your account</span></div><div className="word-list">{words.length ? words.map((item) => <article key={item.id}><div className="word-letter">{item.word.charAt(0).toUpperCase()}</div><div className="word-copy"><h3>{item.word}</h3><strong>{item.translation}</strong><p>{item.example || "No example added."}</p></div><div className="level"><span>{item.cefrLevel} · {item.reviewCount} reviews</span><div><i /><i className={item.reviewCount > 0 ? "on" : ""} /><i className={item.reviewCount > 2 ? "on" : ""} /></div></div><button className="remove" onClick={() => removeWord(item.id)} aria-label={`Remove ${item.word}`}>×</button></article>) : <div className="empty-feedback">No saved words yet.</div>}</div></section>
        <aside className="widget-column"><div className="widget-label"><p className="eyebrow">FOCUS WIDGET</p><span>Web mode</span></div><div className="desktop-frame"><div className="window-bar"><i /><i /><i /><span>Fluent · Focus word</span></div>{featured ? <div className="focus-widget"><div className="widget-top"><span>WORD {currentWord + 1} OF {words.length}</span></div><h2>{featured.word}</h2><h3>{featured.translation}</h3><p>“{featured.example || `Make your own sentence with “${featured.word}”.`}”</p><div className="widget-actions"><button onClick={() => setCurrentWord((index) => (index - 1 + words.length) % words.length)}>‹</button><button className="remember" onClick={() => rememberWord(featured)}>I remember this</button><button onClick={() => setCurrentWord((index) => (index + 1) % words.length)}>›</button></div></div> : <div className="focus-widget empty-widget"><h2>Add your first word</h2><p>It will appear here after it is saved.</p></div>}</div><div className="widget-note"><span>◫</span><div><strong>Desktop widget not implemented yet</strong><p>For now, keep this page open in a small browser window. Always-on-top behavior requires a future desktop app.</p></div></div></aside>
      </div>
    </div>}
  </main>;
}
