import Link from "next/link";
import { RecoveryForm } from "./recovery-form";
import { PASSWORD_REQUIREMENTS_TEXT } from "@/lib/password-policy";
import "../auth.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function UpdatePasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;

  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="brand">REWEAR<span>.</span></Link>
    <h1>Choose a new password</h1>
    <p>{PASSWORD_REQUIREMENTS_TEXT}</p>
    {message && <div className="auth-message error">{message}</div>}
    <RecoveryForm />
  </section></main>;
}
