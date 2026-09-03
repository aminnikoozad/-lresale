import Link from "next/link";
import "../auth.css";

export default function LoginPage(){
  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Sign-in is not live yet.</h1>
    <p>We have disabled credential entry until secure authentication and private customer storage are connected.</p>
    <div className="auth-form">
      <Link className="auth-submit" href="/demo-account">Preview the customer dashboard</Link>
      <small className="auth-note">Do not enter or send passwords to Rewear while account access is unavailable.</small>
    </div>
    <p className="auth-switch">New to Rewear? <Link href="/signup">Account status</Link></p>
    <Link className="auth-back" href="/">← Back to marketplace</Link>
  </section></main>
}
