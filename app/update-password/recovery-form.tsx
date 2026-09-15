"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";
import { verifyRecoverySession } from "@/lib/recovery-session";
import { updatePassword } from "../auth/actions";

export function RecoveryForm() {
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const verification = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let active = true;
    async function verify() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const hasFragment = window.location.hash.length > 1;
      // Remove credentials from the address bar before asynchronous work.
      if (hasFragment) window.history.replaceState(null, "", window.location.pathname);
      const client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        isSingleton: false, auth: { detectSessionInUrl: false },
      });
      await verifyRecoverySession(client, fragment, hasFragment);

    }
    verification.current ??= verify();
    void verification.current.then(() => { if (active) setState("ready"); }).catch(() => { if (active) setState("invalid"); });
    return () => { active = false; };
  }, []);

  if (state === "checking") return <p role="status">Verifying your reset link…</p>;
  if (state === "invalid") return <div role="alert"><p>This reset link could not be verified. Request a new link and open the latest email.</p><Link href="/forgot-password">Send a new reset link</Link></div>;
  return <form className="auth-form" action={updatePassword}>
    <label htmlFor="password">New password<input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
    <label htmlFor="password_confirmation">Confirm password<input id="password_confirmation" name="password_confirmation" type="password" minLength={8} autoComplete="new-password" required /></label>
    <button className="auth-submit" type="submit">Update password</button>
  </form>;
}
