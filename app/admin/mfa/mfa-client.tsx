"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AdminMfaClient() {
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"loading" | "enroll" | "verify">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setError("Could not load MFA settings.");
        return;
      }
      const verified = data.totp.find((factor) => factor.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setMode("verify");
        return;
      }

      for (const pending of data.totp.filter((factor) => factor.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: pending.id });
      }

      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Rewear Admin",
      });
      if (enrollError) {
        setError("Could not start authenticator setup.");
        return;
      }
      setFactorId(enrollment.id);
      setQr(enrollment.totp.qr_code);
      setSecret(enrollment.totp.secret);
      setMode("enroll");
    })();
  }, []);

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

  if (mode === "loading") return <p>Preparing secure verification…</p>;

  return (
    <div className="mfa-box">
      {mode === "enroll" ? (
        <>
          <h2>Set up your authenticator</h2>
          <p>Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</p>
          {qr ? <img src={qr} alt="Authenticator QR code" width={220} height={220} /> : null}
          {secret ? <details><summary>Can’t scan the QR code?</summary><code>{secret}</code></details> : null}
        </>
      ) : (
        <>
          <h2>Two-step verification</h2>
          <p>Enter the current code from your authenticator app.</p>
        </>
      )}
      {error ? <div className="auth-message error">{error}</div> : null}
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="mfa-code">6-digit code
          <input id="mfa-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required />
        </label>
        <button className="auth-submit" type="submit">Verify & open Admin</button>
      </form>
    </div>
  );
}
