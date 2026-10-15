import Link from "next/link";
import { redirect } from "next/navigation";
import { Localize } from "@/components/site-language";
import { createClient } from "@/lib/supabase/server";
import { changeUsername } from "./actions";
import "../../auth.css";

export default async function Profile({searchParams}:{searchParams:Promise<{message?:string}>}) {
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/profile");
  const [{data:profile,error},params] = await Promise.all([
    supabase.from("profiles").select("username").eq("id",user.id).single(), searchParams,
  ]);
  return <Localize><main className="account-shared-page">
    <p className="eyebrow dark">Shared account settings</p><h1>Profile &amp; security</h1>
    <p>Your profile belongs to one account and is shared between buying and selling.</p>
    <section className="account-shared-card"><h2>Account details</h2>
      <p translate="no">{user.email}</p>
      {params.message ? <p role="status">{params.message}</p> : null}
      {error ? <p role="alert">Your profile could not be loaded. Please try again.</p> : <form action={changeUsername} className="auth-form">
        <label>Username<input name="username" defaultValue={profile?.username??""} pattern="[a-z0-9][a-z0-9._]{2,29}" minLength={3} maxLength={30} required autoCapitalize="none" /></label>
        <small>3–30 lowercase letters, numbers, dots or underscores.</small><button type="submit">Save username</button>
      </form>}
    </section>
    <section className="account-shared-card"><h2>Password &amp; security</h2><p>Use a password recovery link sent to your account email to reset your password.</p><Link href="/forgot-password">Recover my password</Link></section>
    <section className="account-shared-card"><h2>Messages &amp; support</h2><p>Your conversations stay available whichever account workspace you use.</p><Link href="/account/messages">Open messages &amp; support</Link></section>
  </main></Localize>;
}
