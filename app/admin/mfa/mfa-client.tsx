"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "loading" | "enroll" | "verify" | "error";

function readableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Secure verification could not be prepared.";
}

export function AdminMfaClient() {
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState("");

  const prepareMfa = useCallback(async () => {
    setMode("loading");
    setError("");
    setFactorId("");
    setQr("");
    setSecret("");
    setCode("");

    const supabase = createClient();

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error("Your admin session has expired. Sign in again.");
      }

      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;

      const totpFactors = data?.totp ?? [];
      const verified = totpFactors.find((factor) => factor.status === "verified");

      if (verified) {
        setFactorId(verified.id);
        setMode("verify");
        return;
      }

      // A previous setup may have created an unverified factor before the browser
      // was refreshed or closed. Remove it and issue a fresh QR/secret so the
      // owner can complete enrollment cleanly.
      for (const pending of totpFactors.filter((factor) => factor.status !== "verified")) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({
          factorId: pending.id,
        });
        if (unenrollError) throw unenrollError;
      }

      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Rewear Admin",
      });
      if (enrollError) throw enrollError;

      const qrCode = enrollment?.totp?.qr_code;
      const enrollmentSecret = enrollment?.totp?.secret;
      if (!enrollment?.id || !qrCode || !enrollmentSecret) {
        throw new Error("Authenticator setup was created without a usable QR code. Please retry.");
      }

      setFactorId(enrollment.id);
      setQr(qrCode);
      setSecret(enrollmentSecret);
      setMode("enroll");
    } catch (caught) {
      setError(readableError(caught));
      setMode("error");
    }
  }, []);

  useEffect(() => {
    void prepareMfa();
  }, [prepareMfa]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(code) || !factorId) {
      setError("Enter the current 6-digit authenticator code.");
      return;
    }

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });

    if (verifyError) {
      setError("The code is incorrect or expired. Try the current code.");
      return;
    }

    window.location.assign("/admin");
  }

  if (mode === "loading") {
    return (
      <div className="mfa-box" aria-live="polite">
        <p>Preparing secure verification…</p>
        <small>This normally takes only a few seconds.</small>
      </div>
    );
  }

  if (mode === "error") {
    const sessionExpired = error.toLowerCase().includes("session");
    return (
      <div className="mfa-box" role="alert">
        <h2>Verification setup needs another try</h2>
        <div className="auth-message error">{error}</div>
        <div className="auth-form">
          {sessionExpired ? (
            <button
              className="auth-submit"
              type="button"
              onClick={() => window.location.assign("/secure-admin-login")}
            >
              Sign in again
            </button>
          ) : (
            <button className="auth-submit" type="button" onClick={() => void prepareMfa()}>
              Retry secure setup
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mfa-box">
      {mode === "enroll" ? (
        <>
          <h2>Set up your authenticator</h2>
          <p>
            Scan this QR code with Google Authenticator, Microsoft Authenticator,
            1Password, or another TOTP app.
          </p>
          <img src={qr} alt="Authenticator QR code" width={220} height={220} />
          <details>
            <summary>Can’t scan the QR code?</summary>
            <code>{secret}</code>
          </details>
        </>
      ) : (
        <>
          <h2>Two-step verification</h2>
          <p>Enter the current code from your authenticator app.</p>
        </>
      )}

      {error ? <div className="auth-message error">{error}</div> : null}

      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="mfa-code">
          6-digit code
          <input
            id="mfa-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
          />
        </label>
        <button className="auth-submit" type="submit">
          Verify & open Admin
        </button>
      </form>
    </div>
  );
}
