
import { GoogleSignIn } from "@/components/google-sign-in";
import { Localize } from "@/components/site-language";
import { BrandWordmark } from "@/components/brand-wordmark";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { AuthHumanCheck } from "@/components/auth-human-check";
import Link from "next/link";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { login } from "../auth/actions";
import "../auth.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null, "https://shikimomo.invalid");
  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "success" ? "success" : "error";
  return <Localize>{<main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand"><BrandWordmark /></Link>
    <h1>Welcome back.</h1>
    <p>Sign in to shop, track orders or manage the items you sell.</p>
    {message && <div className={`auth-message ${type}`}>{message}</div>}
    <GoogleSignIn next={next} />
    <form className="auth-form" action={login}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" required /></label>
      <label htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
      <div className="auth-row"><Link href="/forgot-password">Forgot password?</Link></div>
      <AuthHumanCheck />
      <PendingSubmitButton className="auth-submit" pendingLabel="Signing in…">Sign in</PendingSubmitButton>
    </form>
    <p className="auth-switch">New to Shikimomo? <Link href="/signup">Create an account</Link></p>
    <Link className="auth-back" href="/">← Back to marketplace</Link>
  </section></main>}</Localize>;
}
