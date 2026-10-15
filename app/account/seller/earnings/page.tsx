import Link from "next/link";
import { redirect } from "next/navigation";
import { Localize } from "@/components/site-language";
import { createClient } from "@/lib/supabase/server";

function cad(cents:number) { return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(cents/100); }
export default async function SellerEarnings() {
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/seller/earnings");
  const [summary,activity] = await Promise.all([
    supabase.from("wallet_transactions").select("amount_cents,status,transaction_type").eq("user_id",user.id),
    supabase.from("wallet_transactions").select("id,amount_cents,status,transaction_type,description,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50),
  ]);
  const pending = (summary.data??[]).filter(row=>row.status==="pending"&&row.transaction_type==="sale_credit").reduce((sum,row)=>sum+row.amount_cents,0);
  const completed = (summary.data??[]).filter(row=>row.status==="completed").reduce((sum,row)=>sum+row.amount_cents,0);
  return <Localize><main className="account-shared-page">
    <p className="eyebrow dark">Seller account</p><h1>Earnings &amp; settlement</h1>
    {summary.error||activity.error ? <p role="alert">Your earnings could not be loaded. Please try again.</p> : <>
      <section className="account-shared-card"><h2>Pending sale earnings</h2><p><strong>{cad(pending)}</strong></p><p>Awaiting settlement review. This is not an available bank payout.</p></section>
      <section className="account-shared-card"><h2>Completed wallet balance</h2><p><strong>{cad(completed)}</strong></p><p>Payout setup will become available after payment verification is connected.</p></section>
      <section className="account-shared-card"><h2>Recent earnings activity</h2>{activity.data?.length ? <table><thead><tr><th>Date</th><th>Activity</th><th>Amount</th><th>Status</th></tr></thead><tbody>{activity.data.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleDateString("en-CA",{timeZone:"America/Toronto"})}</td><td>{row.description||row.transaction_type.replaceAll("_"," ")}</td><td>{cad(row.amount_cents)}</td><td>{row.status}</td></tr>)}</tbody></table> : <p>No earnings activity yet.</p>}</section>
    </>}
    <Link href="/account/seller">Back to selling dashboard</Link>
  </main></Localize>;
}
