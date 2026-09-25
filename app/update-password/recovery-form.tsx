"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";
import { verifyRecoverySession } from "@/lib/recovery-session";
import { PASSWORD_HTML_PATTERN, PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENT_TEXT } from "@/lib/password-policy";
import { updatePassword } from "../auth/actions";

type RecoveryState = "checking" | "mfa" | "ready" | "invalid";
type BrowserClient = ReturnType<typeof createBrowserClient>;
type MfaFactor = { id: string; status: string };

export function RecoveryForm() {
  const [state, setState] = useState<RecoveryState>("checking");
  const [factorId, setFactorId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const verification = useRef<Promise<void> | null>(null);
  const clientRef = useRef<BrowserClient | null>(null);

  useEffect(() => {
    let active = true;

    async function verify() {
      try {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const hasFragment = window.location.hash.length > 1;
        // Remove recovery credentials from the visible URL before any later navigation.
        if (hasFragment) window.history.replaceState(null, "", window.location.pathname);

        const client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          isSingleton: false,
          auth: { detectSessionInUrl: false },
        });
        clientRef.current = client;

        await verifyRecoverySession(client, fragment, hasFragment);

        const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance?.currentLevel === "aal2") {
          if (active) setState("ready");
          return;
        }

        const { data: factors, error: factorError } = await client.auth.mfa.listFactors();
        if (factorError) throw factorError;
        const verifiedTotp = (factors?.totp ?? []).find((factor: MfaFactor) => factor.status === "verified");

        if (verifiedTotp) {
          if (active) {
            setFactorId(verifiedTotp.id);
            setState("mfa");
          }
          return;
        }

        if (active) setState("ready");
      } catch {
        if (active) setState("invalid");
      }
    }

    verification.current ??= verify();
    return () => { active = false; };
  }, []);

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!factorId || !/^\d{6}$/.test(mfaCode)) {
      setError("Enter the current 6-digit code from your authenticator app.");
      return;
    }

    const client = clientRef.current;
    if (!client) {
      setState("invalid");
      return;
    }

    setBusy(true);
    const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
      factorId,
      code: mfaCode,
    });
    setBusy(false);

    if (verifyError) {
      setError("The authenticator code is incorrect or expired. Try the current code.");
      return;
    }

    setMfaCode("");
    setError("");
    setState("ready");
  }

  if (state === "checking") return <p role="status">Verifying your reset link…</p>;

  if (state === "invalid") return <div role="alert">
    <p>This reset link could not be verified. Request a new link and open the latest email.</p>
    <Link href="/forgot-password">Send a new reset link</Link>
  </div>;

  if (state === "mfa") return <div className="mfa-box">
    <h2>Two-step verification</h2>
    <p>This account has an authenticator enabled. Enter the current 6-digit code before choosing a new password.</p>
    {error ? <div className="auth-message error">{error}</div> : null}
    <form className="auth-form" onSubmit={verifyMfa}>
      <label htmlFor="recovery-mfa-code">Authenticator code<input id="recovery-mfa-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify & continue"}</button>
    </form>
  </div>;

  return <form className="auth-form" action={updatePassword}>
    <label htmlFor="password">New password<input id="password" name="password" type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} pattern={PASSWORD_HTML_PATTERN} title={PASSWORD_REQUIREMENT_TEXT} autoComplete="new-password" required /></label>
    <small className="auth-note">{PASSWORD_REQUIREMENT_TEXT}</small>
    <label htmlFor="password_confirmation">Confirm password<input id="password_confirmation" name="password_confirmation" type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} pattern={PASSWORD_HTML_PATTERN} title={PASSWORD_REQUIREMENT_TEXT} autoComplete="new-password" required /></label>
    <button className="auth-submit" type="submit">Update password</button>
  </form>;
}
