import Link from "next/link";
import { updatePassword } from "../auth/actions";
import "../auth.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function UpdatePasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;

  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Choose a new password</h1>
    <p>Use at least 8 characters and do not reuse an old password.</p>
    {message && <div className="auth-message error">{message}</div>}
    <form className="auth-form" action={updatePassword}>
      <label htmlFor="password">New password<input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label htmlFor="password_confirmation">Confirm password<input id="password_confirmation" name="password_confirmation" type="password" minLength={8} autoComplete="new-password" required /></label>
      <button className="auth-submit" type="submit">Update password</button>
    </form>
  </section></main>;
}
