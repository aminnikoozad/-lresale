"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "./site-language";

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
const api = () => (window as Window & { turnstile?: Turnstile }).turnstile;
export function AuthCaptcha() {
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const { locale } = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  const mount = useCallback(() => {
    const turnstile = api();
    if (!turnstile || !container.current || widget.current || !sitekey) return;
    widget.current = turnstile.render(container.current, {
      sitekey, action: "site_form", language: locale, theme: "light",
      size: "flexible", appearance: "interaction-only", "response-field": false,
      callback: (value: string) => { setToken(value); setError(false); },
      "expired-callback": () => { setToken(""); },
      "error-callback": () => { setToken(""); setError(true); },
    });
  }, [sitekey, locale]);
  useEffect(() => {
    mount();
    return () => {
      if (widget.current) api()?.remove(widget.current);
      widget.current = undefined;
      setToken("");
    };
  }, [mount]);
  if (!sitekey) return null;
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={mount} onError={() => setError(true)} />
    <div ref={container} style={{ maxWidth: "100%" }} />
    <input type="hidden" name="captcha_token" value={token} />
    {error ? <div role="alert">
      <p>{locale === "fr" ? "La vérification n’a pas abouti. Réessayez ou rechargez la page." : "Verification could not be completed. Try again or reload the page."}</p>
      <button type="button" onClick={() => {
        setToken(""); setError(false);
        if (widget.current) api()?.reset(widget.current); else mount();
      }}>{locale === "fr" ? "Réessayer" : "Try again"}</button>
    </div> : null}
  </>;
}
