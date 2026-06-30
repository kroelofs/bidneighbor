import { useState } from "react";
import { api } from "../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Turnstile token would be collected by the widget; null is accepted in dev.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/request-link", { email, turnstileToken: null });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-gray-600 dark:text-gray-300">You need an account to post a job or respond.</p>

      <a href="/api/auth/google/start" className="btn-secondary mt-6 w-full">Continue with Google</a>

      <div className="my-5 flex items-center gap-3 text-sm text-gray-400">
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" /> or <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
      </div>

      {sent ? (
        <div className="card text-center">
          <p className="font-medium">Check your email</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">We sent a sign-in link to {email}.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">Email address</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
          </div>
          {/* Turnstile widget mounts here in production (data-sitekey). */}
          <div id="turnstile-container" />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}
    </div>
  );
}
