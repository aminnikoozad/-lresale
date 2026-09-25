import Link from "next/link";
import { resendSignupVerification } from "../auth/actions";
import "../auth.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ResendVerificationPage({ searchParams }: Props) {
  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "success" ? "success" : "error";

  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Resend verification email</h1>
    <p>Enter the email address you used when creating your account.</p>
    {message && <div className={`auth-message ${type}`}>{message}</div>}
    <form className="auth-form" action={resendSignupVerification}>
      <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" required /></label>
      <button className="auth-submit" type="submit">Send verification email</button>
    </form>
    <p className="auth-switch">Already verified? <Link href="/login">Sign in</Link></p>
    <Link className="auth-back" href="/">← Back to marketplace</Link>
  </section></main>;
}
