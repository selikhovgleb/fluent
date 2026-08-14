"use client";

import { FormEvent, useState } from "react";
import { signInWithGoogle } from "./actions";

type Mode = "signin" | "signup";

function GoogleMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.39 13.87A6.01 6.01 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.61Z" />
    <path fill="#EA4335" d="M12 6c1.47 0 2.79.51 3.82 1.5l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.61C7.18 7.76 9.39 6 12 6Z" />
  </svg>;
}

export default function LoginExperience({ callbackUrl, oauthError }: { callbackUrl: string; oauthError: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [message, setMessage] = useState("");

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage("");
  }

  function handleLocalAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(mode === "signin"
      ? "Email sign-in is coming soon. For now, continue securely with Google."
      : "Your details look good. Account creation will be available in the next release.");
  }

  return <main className="login-shell">
    <section className="login-visual" aria-label="A preview of Fluent writing feedback">
      <div className="login-visual-glow login-visual-glow-one" />
      <div className="login-visual-glow login-visual-glow-two" />

      <a className="login-brand login-brand-light" href="/login" aria-label="Fluent login">
        <span className="brand-mark">f.</span><span>fluent</span>
      </a>

      <div className="login-visual-copy">
        <p className="login-kicker">YOUR ENGLISH, EVERY DAY</p>
        <h1>Sound like yourself.<br /><em>Only clearer.</em></h1>
        <p>Turn real work messages into confident English, one thoughtful correction at a time.</p>
      </div>

      <div className="login-coach-preview" aria-hidden="true">
        <div className="login-preview-top">
          <span><i /> LIVE WRITING COACH</span>
          <b>01</b>
        </div>
        <p className="login-draft">“I look forward to <del>hear</del> <mark>hearing</mark> from you.”</p>
        <div className="login-correction-note">
          <span>✓</span>
          <div><strong>Gerund after “look forward to”</strong><small>Natural, professional American English</small></div>
          <b>+12</b>
        </div>
      </div>

      <div className="login-word-card" aria-hidden="true">
        <span>WORD OF THE DAY</span>
        <strong>articulate</strong>
        <small>/ɑːrˈtɪkjələt/ · clear and effective</small>
      </div>

      <p className="login-visual-footnote"><span>✦</span> Small corrections. Lasting confidence.</p>
    </section>

    <section className="login-panel">
      <a className="login-brand login-brand-mobile" href="/login" aria-label="Fluent login">
        <span className="brand-mark">f.</span><span>fluent</span>
      </a>

      <div className="login-form-wrap">
        <p className="login-kicker">WELCOME TO FLUENT</p>
        <h2>{mode === "signin" ? "Keep building your confidence." : "Start speaking with confidence."}</h2>
        <p className="login-subtitle">{mode === "signin"
          ? "Sign in to continue your writing practice and review your words."
          : "Create your learning space. It only takes a moment."}</p>

        <div className="login-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => switchMode("signin")}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>Create account</button>
        </div>

        {oauthError && <p className="login-alert" role="alert">Google sign-in could not be completed. Please try again.</p>}

        <form action={signInWithGoogle}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button className="google-login-button" type="submit"><GoogleMark /><span>Continue with Google</span><b>→</b></button>
        </form>

        <div className="login-divider"><span>or continue with email</span></div>

        <form className="email-auth-form" onSubmit={handleLocalAuth}>
          {mode === "signup" && <label>
            <span>Your name</span>
            <input name="name" type="text" autoComplete="name" placeholder="Alex Morgan" required />
          </label>}

          <label>
            <span>Email address</span>
            <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          </label>

          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder={mode === "signin" ? "Enter your password" : "At least 8 characters"} minLength={8} required />
          </label>

          {mode === "signin" ? <div className="login-options">
            <label className="login-check"><input type="checkbox" name="remember" /><span>Remember me</span></label>
            <button type="button" onClick={() => setMessage("Password recovery will be available when email sign-in launches.")}>Forgot password?</button>
          </div> : <label className="login-check login-terms">
            <input type="checkbox" required /><span>I agree to the Terms and Privacy Policy.</span>
          </label>}

          <button className="email-login-button" type="submit">
            <span>{mode === "signin" ? "Sign in with email" : "Create my account"}</span><b>→</b>
          </button>
        </form>

        <p className="login-form-message" aria-live="polite">{message}</p>
        <p className="login-mode-prompt">{mode === "signin" ? "New to Fluent?" : "Already have an account?"} <button type="button" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create an account" : "Sign in"}</button></p>
      </div>

      <p className="login-legal">By continuing, you agree to Fluent’s Terms of Use and Privacy Policy.</p>
    </section>
  </main>;
}
