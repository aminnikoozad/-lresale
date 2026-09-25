"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";
import { verifyRecoverySession } from "@/lib/recovery-session";
import { PASSWORD_REQUIREMENTS_TEXT } from "@/lib/password-policy";
import { validateRecoveryPassword } from "../auth/actions";

const RECOVERY_MARKER = "rewear-password-recovery-verified";

export function RecoveryForm() {
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const verification = useRef<Promise<void> | null>(null);
  const client = useMemo(() => createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    isSingleton: false,
    auth: { detectSessionInUrl: false },
  }), []);

  useEffect(() => {
    let active = true;
    async function verify() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const hasFragment = window.location.hash.length > 1;
      if (hasFragment) window.history.replaceState(null, "", window.location.pathname);
      await verifyRecoverySession(client, fragment, hasFragment);
      try { window.sessionStorage.setItem(RECOVERY_MARKER, "1"); } catch {}
    }
    verification.current ??= verify();
    void verification.current
      .then(() => { if (active) setState("ready"); })
      .catch(() => { if (active) setState("invalid"); });
    return () => { active = false; };
  }, [client]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("password_confirmation") ?? "");

    try {
      const safety = await validateRecoveryPassword(password, confirmation);
      if (!safety.ok) {
        setMessage(safety.message);
        setSubmitting(false);
        return;
      }

      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData.user) {
        setState("invalid");
        setSubmitting(false);
        return;
      }

      const { error } = await client.auth.updateUser({ password });
      if (error) {
        setMessage("This reset link is invalid or expired. Request a new reset link and try again.");
        setSubmitting(false);
        return;
      }

      try { window.sessionStorage.removeItem(RECOVERY_MARKER); } catch {}
      await client.auth.signOut();
      window.location.replace("/login?type=success&message=Password%20updated.%20You%20can%20now%20sign%20in.");
    } catch {
      setMessage("We could not update your password. Please request a new reset link and try again.");
      setSubmitting(false);
    }
  }

  if (state === "checking") return <p role="status">Verifying your reset link…</p>;
  if (state === "invalid") return <div role="alert"><p>This reset link could not be verified. Request a new link and open the latest email.</p><Link href="/forgot-password">Send a new reset link</Link></div>;
  return <form className="auth-form" onSubmit={submit}>
    {message ? <div className="auth-message error" role="alert">{message}</div> : null}
    <label htmlFor="password">New password<input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required disabled={submitting} aria-describedby="reset-password-rules" /><small id="reset-password-rules" className="auth-field-note">{PASSWORD_REQUIREMENTS_TEXT}</small></label>
    <label htmlFor="password_confirmation">Confirm password<input id="password_confirmation" name="password_confirmation" type="password" minLength={8} autoComplete="new-password" required disabled={submitting} /></label>
    <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Updating…" : "Update password"}</button>
  </form>;
}
