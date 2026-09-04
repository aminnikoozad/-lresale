import Link from "next/link";
import { login } from "../auth/actions";
import "../auth.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({searchParams}:Props){
  const params=await searchParams;
  const message=typeof params.message==="string"?params.message:null;
  const type=params.type==="success"?"success":"error";
  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Welcome back.</h1>
    <p>Sign in to follow your items, requests and available balance.</p>
    {message&&<div className={`auth-message ${type}`}>{message}</div>}
    <form className="auth-form" action={login}>
      <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" required /></label>
      <label htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
      <div className="auth-row"><Link href="/forgot-password">Forgot password?</Link></div>
      <button className="auth-submit" type="submit">Sign in</button>
    </form>
    <p className="auth-switch">New to Rewear? <Link href="/signup">Create an account</Link></p>
    <Link className="auth-back" href="/">← Back to marketplace</Link>
  </section></main>
}
