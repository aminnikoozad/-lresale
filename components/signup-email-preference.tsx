"use client";
import { useLocale } from "./site-language";

export function SignupEmailPreference() {
  const { locale } = useLocale();
  return <label className="auth-check">
    <input name="email_marketing" type="checkbox" value="accepted" />
    <span>{locale === "fr"
      ? "Je souhaite recevoir les nouveautés et offres de Shikimomo par courriel (facultatif). Je peux me désabonner en tout temps."
      : "Email me new arrivals and offers from Shikimomo (optional). I can unsubscribe at any time."}</span>
  </label>;
}
