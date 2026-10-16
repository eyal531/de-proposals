"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") ?? "/" : "/";
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setBusy(true);
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) {
      setMsg(error.message);
      setBusy(false);
    }
  }

  async function magic(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    setMsg(error ? error.message : "שלחנו קישור כניסה לתיבת הדואר שלך.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-xl font-bold text-brand">הצעות מחיר</h1>
          <p className="text-sm text-muted">דיגיטל אפקטיב – כניסה לצוות</p>
        </div>
        <button className="btn btn-primary w-full" onClick={google} disabled={busy}>
          כניסה עם Google
        </button>
        <div className="text-center text-xs text-muted">או קישור כניסה במייל</div>
        <form onSubmit={magic} className="space-y-2">
          <input className="input" type="email" dir="ltr" placeholder="name@company.co.il" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="btn w-full" disabled={busy}>
            שלחו לי קישור
          </button>
        </form>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </div>
    </main>
  );
}
