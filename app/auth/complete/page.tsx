"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";
import { useLocale } from "@/components/site-language";
import "../../auth.css";

export default function CompleteEmailConfirmation() {
  const { locale } = useLocale();
  const verification = useRef<Promise<void> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    verification.current ??= (async () => {
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.slice(1));
      // Remove credentials before any asynchronous work or navigation.
      window.history.replaceState(null, "", url.pathname);
      if (fragment.has("error") || fragment.has("error_code")) throw new Error("verification");
      const access_token = fragment.get("access_token");
      const refresh_token = fragment.get("refresh_token");
      if (!access_token || !refresh_token || fragment.get("type") !== "signup") throw new Error("verification");
      const client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        isSingleton: false, auth: { detectSessionInUrl: false },
      });
      const { error } = await client.auth.setSession({ access_token, refresh_token });
      if (error) throw error;
      const { data, error: userError } = await client.auth.getUser();
      if (userError || !data.user?.email_confirmed_at) throw new Error("verification");
      window.location.replace("/account");
    })();
    void verification.current.catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  const fr = locale === "fr";
  return <main className="auth-page"><section className="auth-card">
    <h1>{fr ? "Confirmation du courriel" : "Email confirmation"}</h1>
    {failed ? <div role="alert">
      <p>{fr ? "Nous n’avons pas pu terminer la connexion avec ce lien. Si vous avez déjà confirmé votre courriel, connectez-vous avec votre mot de passe. Sinon, utilisez le dernier courriel de confirmation." : "We could not complete sign-in with this link. If you have already confirmed your email, sign in with your password. Otherwise, use the latest confirmation email."}</p>
      <Link className="auth-submit" href="/login">{fr ? "Se connecter" : "Sign in"}</Link>
    </div> : <p role="status">{fr ? "Vérification de votre courriel…" : "Verifying your email…"}</p>}
  </section></main>;
}
