import { PendingSubmitButton } from "@/components/pending-submit-button";
import { safeRedirectPath } from "@/lib/safe-redirect";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCanadianPhone, isPhoneVerificationRequired } from "@/lib/canadian-phone";
import { createClient } from "@/lib/supabase/server";
import { logout, sendPhoneVerification, verifyPhone } from "../auth/actions";
import "../auth.css";
import "./verify-phone.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function VerifyPhonePage({ searchParams }: Props) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null, "https://rewear.invalid");
  if (!isPhoneVerificationRequired()) redirect(next);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?${new URLSearchParams({ next })}`);
  if (user.phone_confirmed_at) redirect(next);

  const [{ data: profile }] = await Promise.all([
    supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
  ]);
  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "success" ? "success" : "error";
  const savedPhone = profile?.phone ?? "";

  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Verify your phone.</h1>
    <p>Only Canadian phone numbers can be used to activate a Rewear account.</p>
    {message?<div className={`auth-message ${type}`}>{message}</div>:null}
    <form className="auth-form" action={sendPhoneVerification}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="phone">Canadian phone number<input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(514) 555-0123" defaultValue={savedPhone?formatCanadianPhone(savedPhone):""} maxLength={24} required /></label>
      <PendingSubmitButton className="auth-submit" pendingLabel="Sending code…">Send verification code</PendingSubmitButton>
      <small className="auth-note">By continuing, you agree to receive a one-time verification text. Message and data rates may apply.</small>
    </form>
    <div className="auth-divider"><span>Enter the code</span></div>
    <form className="auth-form" action={verifyPhone}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="token">6-digit code<input id="token" name="token" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="123456" required /></label>
      <PendingSubmitButton className="auth-submit secondary" pendingLabel="Verifying…">Verify and continue</PendingSubmitButton>
    </form>
    <form action={logout}><button className="auth-link-button" type="submit">Use another account</button></form>
  </section></main>;
}
