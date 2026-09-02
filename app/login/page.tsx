"use client";
import Link from "next/link";
import "../auth.css";

export default function LoginPage(){
  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Welcome back</h1>
    <p>Sign in to view your balance, items, requests and payouts.</p>
    <form className="auth-form" onSubmit={(event)=>{event.preventDefault();window.alert("Email sign-in will be available after the secure authentication service is connected.");}}>
      <label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com"/></label>
      <label>Password<input name="password" type="password" required autoComplete="current-password" placeholder="Your password"/></label>
      <button className="auth-submit" type="submit">Sign in</button>
      <small className="auth-note">Secure email accounts are being connected. No information entered here is stored yet.</small>
    </form>
    <p className="auth-switch">New to Rewear? <Link href="/signup">Create an account</Link></p>
    <Link className="auth-back" href="/">← Back to marketplace</Link>
  </section></main>
}