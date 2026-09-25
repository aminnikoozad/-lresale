import {AuthCaptcha} from "@/components/auth-captcha";
import Link from "next/link";
import { signup } from "../auth/actions";
import { isPhoneVerificationRequired } from "@/lib/canadian-phone";
import "../auth.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignUpPage({searchParams}:Props){
  const params=await searchParams;
  const phoneRequired=isPhoneVerificationRequired();
  const message=typeof params.message==="string"?params.message:null;
  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Create your account.</h1>
    <p>Track collections, items, earnings and your Rewear balance securely.</p>
    {message&&<div className="auth-message error">{message}</div>}
    <form className="auth-form" action={signup}>
      <label htmlFor="full_name">Full name<input id="full_name" name="full_name" type="text" minLength={2} maxLength={100} autoComplete="name" required /></label>
      <label htmlFor="username">Username<input id="username" name="username" minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9._]{2,29}" autoCapitalize="none" autoComplete="username" placeholder="e.g. amin.montreal" required/><small>Unique, 3–30 lowercase letters, numbers, dots or underscores.</small></label>
      <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" required /></label>
      {phoneRequired?<label htmlFor="phone">Canadian phone number<input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(514) 555-0123" maxLength={24} required /></label>:null}
      <label htmlFor="password">Password<input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label htmlFor="password_confirmation">Confirm password<input id="password_confirmation" name="password_confirmation" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label className="auth-check"><input name="terms" type="checkbox" value="accepted" required/> I agree to the account and privacy terms.</label>
      <AuthCaptcha/><button className="auth-submit" type="submit">Create account</button>
      <small className="auth-note">We’ll verify your email{phoneRequired?" and Canadian phone number":""} before the account becomes active.</small>
    </form>
    <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    <Link className="auth-back" href="/">← Back to marketplace</Link>
  </section></main>
}
