"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ErrorItem = {
  wrong: string;
  right: string;
  category: string;
  note: string;
};

type Word = {
  id: number;
  word: string;
  translation: string;
  example: string;
  level: number;
};

const seedWords: Word[] = [
  { id: 1, word: "thoughtful", translation: "troskliwy, przemyślany", example: "That was a thoughtful answer.", level: 1 },
  { id: 2, word: "reliable", translation: "niezawodny", example: "She is a reliable teammate.", level: 2 },
  { id: 3, word: "overlook", translation: "przeoczyć", example: "I overlooked one small detail.", level: 1 },
];

const rules: Array<{ pattern: RegExp; replacement: string; category: string; note: string }> = [
  { pattern: /\bI send\b/i, replacement: "I sent", category: "Verb tense", note: "Use the past form “sent” for a finished action yesterday." },
  { pattern: /\bshe don't\b/i, replacement: "she hasn’t", category: "Subject–verb agreement", note: "With “she,” use “doesn’t” or, here, the present perfect “hasn’t.”" },
  { pattern: /\bhasn’t replied yet\b/i, replacement: "hasn’t replied yet", category: "Verb tense", note: "The present perfect connects the past action to the situation now." },
  { pattern: /\bdon't replied\b/i, replacement: "hasn’t replied", category: "Verb tense", note: "Use “hasn’t + past participle” when the result is still pending." },
  { pattern: /\ba sentences\b/i, replacement: "a sentence", category: "Singular & plural", note: "The article “a” must be followed by a singular noun." },
  { pattern: /\bhelps me to improve\b/i, replacement: "helps me improve", category: "Natural phrasing", note: "After “help,” English usually omits “to” in everyday writing." },
  { pattern: /\bautomaticaly\b/gi, replacement: "automatically", category: "Spelling", note: "“Automatically” has two l’s and ends in -ically." },
  { pattern: /\benglish\b/g, replacement: "English", category: "Capitalization", note: "Languages and nationalities always begin with a capital letter." },
  { pattern: /\bI have (\w+) yesterday\b/i, replacement: "I had $1 yesterday", category: "Verb tense", note: "Use the past tense with a finished time such as “yesterday.”" },
  { pattern: /\bdiscuss about\b/i, replacement: "discuss", category: "Prepositions", note: "“Discuss” takes a direct object; it does not need “about.”" },
];

const demo = "Yesterday I send the report to my manager, but she don't replied yet.";

function analyse(input: string) {
  let corrected = input.trim();
  const found: ErrorItem[] = [];

  for (const rule of rules) {
    const match = corrected.match(rule.pattern);
    if (!match) continue;
    const wrong = match[0];
    const right = wrong.replace(rule.pattern, rule.replacement);
    if (wrong.toLowerCase() !== right.toLowerCase() || wrong !== right) {
      found.push({ wrong, right, category: rule.category, note: rule.note });
    }
    corrected = corrected.replace(rule.pattern, rule.replacement);
  }

  if (corrected && !/[.!?]$/.test(corrected)) corrected += ".";
  return { corrected, found };
}

function HighlightedText({ text, errors }: { text: string; errors: ErrorItem[] }) {
  if (!errors.length) return <>{text}</>;
  const escaped = errors.map((e) => e.wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  return (
    <>
      {text.split(regex).map((part, i) =>
        errors.some((e) => e.wrong.toLowerCase() === part.toLowerCase()) ? <mark key={i}>{part}</mark> : part,
      )}
    </>
  );
}

export default function Home() {
  const [section, setSection] = useState<"writing" | "words">("writing");
  const [text, setText] = useState(demo);
  const [result, setResult] = useState(() => analyse(demo));
  const [analysedText, setAnalysedText] = useState(demo);
  const [words, setWords] = useState<Word[]>(seedWords);
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [example, setExample] = useState("");
  const [currentWord, setCurrentWord] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("fluent-words");
    if (stored) setWords(JSON.parse(stored));
  }, []);

  useEffect(() => {
    localStorage.setItem("fluent-words", JSON.stringify(words));
  }, [words]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    result.found.forEach((e) => counts.set(e.category, (counts.get(e.category) || 0) + 1));
    return [...counts.entries()];
  }, [result]);

  function checkWriting() {
    if (!text.trim()) return;
    setAnalysedText(text.trim());
    setResult(analyse(text));
    setSaved(false);
  }

  function addWord(event: FormEvent) {
    event.preventDefault();
    if (!word.trim() || !translation.trim()) return;
    setWords((all) => [{ id: Date.now(), word: word.trim(), translation: translation.trim(), example: example.trim(), level: 1 }, ...all]);
    setWord("");
    setTranslation("");
    setExample("");
  }

  function removeWord(id: number) {
    setWords((all) => all.filter((item) => item.id !== id));
    setCurrentWord(0);
  }

  const featured = words[currentWord % Math.max(words.length, 1)];

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setSection("writing")} aria-label="Fluent home">
          <span className="brand-mark">f.</span><span>fluent</span>
        </button>
        <nav aria-label="Main navigation">
          <button className={section === "writing" ? "nav-active" : ""} onClick={() => setSection("writing")}><span>✎</span> Writing coach</button>
          <button className={section === "words" ? "nav-active" : ""} onClick={() => setSection("words")}><span>◫</span> My words <b>{words.length}</b></button>
        </nav>
        <div className="streak"><span>◆</span><strong>7</strong><small>day streak</small></div>
        <Link className="avatar" href="/profile" aria-label="Open profile">AK</Link>
      </header>

      {section === "writing" ? (
        <div className="page-shell writing-page">
          <section className="intro">
            <div>
              <p className="eyebrow">YOUR DAILY PRACTICE</p>
              <h1>Write with more <em>confidence.</em></h1>
              <p>Paste a sentence from your work. We’ll correct it, explain the why, and remember what you need to practise.</p>
            </div>
            <div className="weekly-card">
              <div><span>This week</span><strong>12</strong><small>sentences checked</small></div>
              <div className="mini-chart" aria-label="Weekly practice chart">
                {[32, 60, 42, 78, 55, 88, 26].map((height, i) => <i key={i} style={{ height: `${height}%` }} className={i === 5 ? "today" : ""} />)}
              </div>
              <div className="days"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
            </div>
          </section>

          <section className="workspace-grid">
            <div className="editor-card">
              <div className="card-heading"><div><span className="step">01</span><h2>Your sentence</h2></div><span className="shortcut">Ctrl + Enter</span></div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") checkWriting(); }} maxLength={500} aria-label="Sentence to check" />
              <div className="editor-footer"><span>{text.length} / 500</span><button className="primary" onClick={checkWriting}>Check my English <span>→</span></button></div>
            </div>

            <div className="result-card">
              <div className="card-heading"><div><span className="step mint">02</span><h2>Improved version</h2></div><button className="icon-button" onClick={() => navigator.clipboard?.writeText(result.corrected)} aria-label="Copy improved sentence">□</button></div>
              <p className="corrected">{result.corrected}</p>
              <div className="tone-row"><span>Professional</span><span>Clear</span><span>Natural</span></div>
              <button className={saved ? "save-button saved" : "save-button"} onClick={() => setSaved(true)}>{saved ? "✓ Saved to practice" : "+ Save for practice"}</button>
            </div>
          </section>

          <section className="feedback-grid">
            <div className="mistakes-panel">
              <div className="section-title"><div><p className="eyebrow">YOUR FEEDBACK</p><h2>{result.found.length ? `${result.found.length} things to learn` : "Beautifully written"}</h2></div><span className="score">{result.found.length ? Math.max(72, 100 - result.found.length * 7) : 100}<small>/100</small></span></div>
              <p className="original"><HighlightedText text={analysedText} errors={result.found} /></p>
              <div className="error-list">
                {result.found.length ? result.found.map((error, index) => (
                  <article key={`${error.wrong}-${index}`}>
                    <span className="error-number">{String(index + 1).padStart(2, "0")}</span>
                    <div><span className="category">{error.category}</span><h3><del>{error.wrong}</del><span>→</span>{error.right}</h3><p>{error.note}</p></div>
                  </article>
                )) : <div className="empty-feedback">No clear errors found. Your sentence is ready to send.</div>}
              </div>
            </div>

            <aside className="focus-panel">
              <p className="eyebrow">YOUR FOCUS</p><h2>Topics to practise</h2>
              {categories.length ? categories.map(([name, count], index) => (
                <div className="topic" key={name}><div className={`topic-icon c${index % 3}`}>{name.charAt(0)}</div><div><strong>{name}</strong><span>{count} {count === 1 ? "mistake" : "mistakes"} today</span></div><span>›</span></div>
              )) : <p className="all-good">No new weak spots today. Keep writing!</p>}
              <div className="tip"><span>✦</span><div><strong>Small habit, big progress</strong><p>Check three real work messages every day. You’ll start noticing the patterns yourself.</p></div></div>
            </aside>
          </section>
        </div>
      ) : (
        <div className="page-shell words-page">
          <section className="words-intro"><div><p className="eyebrow">BUILD YOUR VOCABULARY</p><h1>Words that finally <em>stick.</em></h1><p>Add useful words from your day. The focus widget keeps them in sight until they feel familiar.</p></div><button className="primary" onClick={() => document.getElementById("new-word")?.focus()}>+ Add a new word</button></section>
          <div className="vocab-grid">
            <section>
              <form className="word-form" onSubmit={addWord}>
                <div className="card-heading"><div><span className="step">01</span><h2>Add to your collection</h2></div></div>
                <label>English word<input id="new-word" value={word} onChange={(e) => setWord(e.target.value)} placeholder="e.g. thoughtful" /></label>
                <label>Translation<input value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder="e.g. troskliwy" /></label>
                <label>Example sentence <span>(optional)</span><input value={example} onChange={(e) => setExample(e.target.value)} placeholder="Use it in a sentence you’ll remember" /></label>
                <button className="primary" type="submit">Add word <span>→</span></button>
              </form>

              <div className="collection-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h2>{words.length} words in rotation</h2></div><span>Saved on this device</span></div>
              <div className="word-list">
                {words.map((item) => <article key={item.id}><div className="word-letter">{item.word.charAt(0).toUpperCase()}</div><div className="word-copy"><h3>{item.word}</h3><strong>{item.translation}</strong><p>{item.example || "Add an example when this word appears in your day."}</p></div><div className="level"><span>Level {item.level}</span><div><i /><i className={item.level > 1 ? "on" : ""} /><i className={item.level > 2 ? "on" : ""} /></div></div><button className="remove" onClick={() => removeWord(item.id)} aria-label={`Remove ${item.word}`}>×</button></article>)}
              </div>
            </section>

            <aside className="widget-column">
              <div className="widget-label"><p className="eyebrow">FOCUS WIDGET</p><span>Preview</span></div>
              <div className="desktop-frame">
                <div className="window-bar"><i /><i /><i /><span>Fluent · Focus word</span></div>
                {featured ? <div className="focus-widget"><div className="widget-top"><span>WORD {currentWord + 1} OF {words.length}</span><button aria-label="Widget menu">•••</button></div><h2>{featured.word}</h2><h3>{featured.translation}</h3><p>“{featured.example || `Make your own sentence with “${featured.word}”.`}”</p><div className="widget-actions"><button onClick={() => setCurrentWord((i) => (i - 1 + words.length) % words.length)}>‹</button><button className="remember" onClick={() => { setWords((all) => all.map((w) => w.id === featured.id ? { ...w, level: Math.min(3, w.level + 1) } : w)); setCurrentWord((i) => (i + 1) % words.length); }}>I remember this</button><button onClick={() => setCurrentWord((i) => (i + 1) % words.length)}>›</button></div></div> : <div className="focus-widget empty-widget"><h2>Add your first word</h2><p>It will appear here throughout your day.</p></div>}
              </div>
              <div className="widget-note"><span>◎</span><div><strong>Web widget mode</strong><p>Keep this page open in a small browser window. A true always-on-top widget can come later with the desktop version.</p></div></div>
            </aside>
          </div>
        </div>
      )}
    </main>
  );
}
