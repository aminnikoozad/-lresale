import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCanadianPhone, isPhoneVerificationRequired } from "@/lib/canadian-phone";
import { createClient } from "@/lib/supabase/server";
import { logout, sendPhoneVerification, verifyPhone } from "../auth/actions";
import "../auth.css";
import "./verify-phone.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function VerifyPhonePage({ searchParams }: Props) {
  if (!isPhoneVerificationRequired()) redirect("/account");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.phone_confirmed_at) redirect("/account");

  const [{ data: profile }, params] = await Promise.all([
    supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
    searchParams,
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
      <label htmlFor="phone">Canadian phone number<input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(514) 555-0123" defaultValue={savedPhone?formatCanadianPhone(savedPhone):""} maxLength={24} required /></label>
      <button className="auth-submit" type="submit">Send verification code</button>
      <small className="auth-note">By continuing, you agree to receive a one-time verification text. Message and data rates may apply.</small>
    </form>
    <div className="auth-divider"><span>Enter the code</span></div>
    <form className="auth-form" action={verifyPhone}>
      <label htmlFor="token">6-digit code<input id="token" name="token" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="123456" required /></label>
      <button className="auth-submit secondary" type="submit">Verify and continue</button>
    </form>
    <form action={logout}><button className="auth-link-button" type="submit">Use another account</button></form>
  </section></main>;
}
