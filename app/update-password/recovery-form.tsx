"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";
import { verifyRecoverySession } from "@/lib/recovery-session";
import { PASSWORD_REQUIREMENTS_TEXT } from "@/lib/password-policy";
import { validateRecoveryPassword } from "../auth/actions";

const RECOVERY_MARKER = "rewear-password-recovery-verified";
type RecoveryState = "checking" | "mfa" | "ready" | "invalid";
type MfaFactor = { id: string; status: string };

export function RecoveryForm() {
  const [state, setState] = useState<RecoveryState>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [factorId, setFactorId] = useState("");
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

      const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance?.currentLevel === "aal2") return;

      const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const verifiedTotp = (factors?.totp ?? []).find((factor: MfaFactor) => factor.status === "verified");
      if (verifiedTotp && active) {
        setFactorId(verifiedTotp.id);
        setState("mfa");
      }
    }

    verification.current ??= verify();
    void verification.current
      .then(() => { if (active) setState((current) => current === "checking" ? "ready" : current); })
      .catch(() => { if (active) setState("invalid"); });

    return () => { active = false; };
  }, [client]);

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setMessage(null);

    if (!factorId || !/^\d{6}$/.test(mfaCode)) {
      setMessage("Enter the current 6-digit code from your authenticator app.");
      return;
    }

    setSubmitting(true);
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: mfaCode });
    setSubmitting(false);

    if (error) {
      setMessage("The authenticator code is incorrect or expired. Try the current code.");
      return;
    }

    setMfaCode("");
    setMessage(null);
    setState("ready");
  }

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
        return;
      }

      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData.user) {
        setState("invalid");
        return;
      }

      const { error } = await client.auth.updateUser({ password });
      if (error) {
        if (error.code === "insufficient_aal") {
          const { data: factors } = await client.auth.mfa.listFactors();
          const verifiedTotp = (factors?.totp ?? []).find((factor: MfaFactor) => factor.status === "verified");
          if (verifiedTotp) {
            setFactorId(verifiedTotp.id);
            setState("mfa");
            setMessage("Two-step verification is required before changing this password.");
            return;
          }
        }
        setMessage("The password could not be updated. Request a new reset link if the recovery session has expired.");
        return;
      }

      try { window.sessionStorage.removeItem(RECOVERY_MARKER); } catch {}
      await client.auth.signOut();
      window.location.replace("/login?type=success&message=Password%20updated.%20You%20can%20now%20sign%20in.");
    } catch {
      setMessage("We could not update your password. Please request a new reset link and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "checking") return <p role="status">Verifying your reset link…</p>;

  if (state === "invalid") return <div role="alert">
    <p>This reset link could not be verified. Request a new link and open the latest email.</p>
    <Link href="/forgot-password">Send a new reset link</Link>
  </div>;

  if (state === "mfa") return <div className="mfa-box">
    <h2>Two-step verification</h2>
    <p>This account has an authenticator enabled. Enter the current 6-digit code before choosing a new password.</p>
    {message ? <div className="auth-message error" role="alert">{message}</div> : null}
    <form className="auth-form" onSubmit={verifyMfa}>
      <label htmlFor="recovery-mfa-code">Authenticator code<input id="recovery-mfa-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required disabled={submitting} /></label>
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Verifying…" : "Verify & continue"}</button>
    </form>
  </div>;

  return <form className="auth-form" onSubmit={submit}>
    {message ? <div className="auth-message error" role="alert">{message}</div> : null}
    <label htmlFor="password">New password<input id="password" name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required disabled={submitting} aria-describedby="reset-password-rules" /><small id="reset-password-rules" className="auth-field-note">{PASSWORD_REQUIREMENTS_TEXT}</small></label>
    <label htmlFor="password_confirmation">Confirm password<input id="password_confirmation" name="password_confirmation" type="password" minLength={8} maxLength={128} autoComplete="new-password" required disabled={submitting} /></label>
    <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Updating…" : "Update password"}</button>
  </form>;
}
