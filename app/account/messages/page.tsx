import Link from "next/link";
import { redirect } from "next/navigation";
import { Localize } from "@/components/site-language";
import { AccountSupport } from "@/components/account-support";
import { createClient } from "@/lib/supabase/server";

export default async function AccountMessages() {
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/messages");
  const {data:updates,error} = await supabase.from("customer_account_updates").select("id,body,created_at")
    .eq("customer_id",user.id).eq("customer_visible",true).order("created_at",{ascending:false}).limit(100);
  return <Localize><main className="account-shared-page">
    <p className="eyebrow dark">Shared customer support</p><h1>Messages &amp; support</h1><p>Your conversations stay available whichever account workspace you use.</p>
    <section className="account-shared-card"><h2>Contact our team</h2><AccountSupport userId={user.id} /><p><Link href="/support">Contact details &amp; support information</Link></p></section>
    <section className="account-shared-card"><h2>Messages from Shikimomo</h2>
      {error ? <p role="alert">Messages could not be loaded.</p> : updates?.length ? updates.map(update=><article key={update.id}><p style={{whiteSpace:"pre-wrap"}}>{update.body}</p><small>{new Date(update.created_at).toLocaleString("en-CA",{timeZone:"America/Toronto"})}</small></article>) : <p>No account messages yet.</p>}
    </section>
  </main></Localize>;
}
