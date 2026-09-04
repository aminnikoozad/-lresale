import Link from "next/link";
import { requestPasswordReset } from "../auth/actions";
import "../auth.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "success" ? "success" : "error";

  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Reset your password</h1>
    <p>Enter the email used for your Rewear account.</p>
    {message && <div className={`auth-message ${type}`}>{message}</div>}
    <form className="auth-form" action={requestPasswordReset}>
      <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" required /></label>
      <button className="auth-submit" type="submit">Send reset link</button>
    </form>
    <Link className="auth-back" href="/login">← Back to sign in</Link>
  </section></main>;
}
