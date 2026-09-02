"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "../auth.css";

export default function SignUpPage(){
  const router=useRouter();
  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Create your account</h1>
    <p>Track your items, request a Bag or pickup, and use your balance to shop.</p>
    <form className="auth-form" onSubmit={(event)=>{event.preventDefault();router.push("/account");}}>
      <label>Full name<input name="name" required autoComplete="name" placeholder="Your full name"/></label>
      <label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com"/></label>
      <label>Password<input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters"/></label>
      <button className="auth-submit" type="submit">Create account</button>
      <small className="auth-note">Secure account storage will be activated when the production database is connected.</small>
    </form>
    <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    <Link className="auth-back" href="/">← Back to marketplace</Link>
  </section></main>
}