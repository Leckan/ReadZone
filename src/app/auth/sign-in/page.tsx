"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, LoaderCircle } from "lucide-react";
import { authClient, authEnabled } from "@/lib/auth/client";

function AuthForm() {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (data?.user) router.replace("/");
  }, [data?.user, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) setError(result.error.message || "We couldn’t complete that request.");
      else router.replace("/");
    } catch {
      setError("Authentication is unavailable right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError("");
    setBusy(true);
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (result.error) setError(result.error.message || "Google sign-in is unavailable.");
    } catch {
      setError("Google sign-in is unavailable right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (isPending) return <div className="auth-card auth-loading"><LoaderCircle className="loading-spinner" size={20} />Checking your session…</div>;

  return (
    <section className="auth-card">
      <span className="auth-logo"><BookOpen size={20} /></span>
      <div className="eyebrow"><span className="eyebrow-dot" /> YOUR PERSONAL LIBRARY</div>
      <h1>{mode === "sign-up" ? "Create your account" : "Welcome back"}<span className="heading-period">.</span></h1>
      <p className="auth-intro">Sign in to keep your books, bookmarks, and reading progress with you.</p>
      <button className="button button-light auth-google" onClick={() => void signInWithGoogle()} disabled={busy}>Continue with Google</button>
      <div className="auth-divider"><span>or use email</span></div>
      <form onSubmit={submit} className="auth-form">
        {mode === "sign-up" && <label>Name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></label>}
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy && <LoaderCircle className="loading-spinner" size={15} />}{mode === "sign-up" ? "Create account" : "Sign in"}</button>
      </form>
      <p className="auth-switch">{mode === "sign-up" ? "Already have an account?" : "New to ReadFlow?"}{" "}<button onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setError(""); }}>{mode === "sign-up" ? "Sign in" : "Create an account"}</button></p>
      <p className="auth-privacy">Your uploaded books are stored privately and tied to your account.</p>
    </section>
  );
}

export default function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-page-top"><Link href="/" className="auth-back"><ArrowLeft size={15} />Back to ReadFlow</Link><span>ReadFlow <b>AI</b></span></div>
      {!authEnabled ? (
        <section className="auth-card"><span className="auth-logo"><BookOpen size={20} /></span><h1>Account sign-in isn’t set up yet.</h1><p className="auth-intro">The local reading library is ready. Add the Neon Auth environment settings described in the README to turn on account access.</p><Link className="button button-primary auth-submit" href="/">Continue with local library</Link></section>
      ) : <AuthForm />}
      <div className="auth-page-footer">A quieter place to keep reading.</div>
    </main>
  );
}
