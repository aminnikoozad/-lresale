import Link from "next/link";
import "../auth.css";

export default function SignUpPage(){
  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Secure accounts are coming.</h1>
    <p>Email registration is disabled until the authentication service and database are connected. We will never ask you to enter a password into a demo form.</p>
    <div className="auth-form">
      <Link className="auth-submit" href="/demo-account">Preview the customer dashboard</Link>
      <small className="auth-note">The preview contains sample information only and does not create an account.</small>
    </div>
    <p className="auth-switch">Already registered later? <Link href="/login">Sign in</Link></p>
    <Link className="auth-back" href="/">← Back to marketplace</Link>
  </section></main>
}
