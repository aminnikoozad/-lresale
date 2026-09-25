import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import type { CustomerOption } from "@/components/customer-picker";
import "../items/items.css";
export const dynamic="force-dynamic";
export default async function Customers({searchParams}:{searchParams:Promise<{q?:string}>}){
 const {supabase,access}=await requireAdmin();if(!access.has_aal2)redirect('/admin/mfa');
 const {data:allowed}=await supabase.rpc('can_manage_items');if(!allowed)redirect('/admin');
 const {q=""}=await searchParams;const {data,error}=await supabase.rpc('admin_customer_options');
 const customers=((data??[]) as CustomerOption[]).filter(c=>`${c.username} ${c.full_name} ${c.email}`.toLowerCase().includes(q.toLowerCase()));
 return <main className="admin-items-shell"><section className="admin-items-wrap"><Link href="/admin">← Admin dashboard</Link><h1>Customers &amp; their items</h1><p>Find the seller first. Every item and sale credit stays linked to their account.</p>
 <form className="admin-item-form"><label>Search<input name="q" defaultValue={q} placeholder="Username, name or email" maxLength={100}/></label><button className="primary-action">Search</button></form>
 {error?<p role="alert">Customer directory could not be loaded.</p>:<p>{customers.length} matching accounts</p>}
 <div className="admin-item-list">{customers.slice(0,100).map(c=><article className="admin-item-row" key={c.user_id}><h2>@{c.username}</h2><p>{c.full_name} · {c.email}</p><Link href={`/admin/customers/${c.user_id}`}>Open customer workspace →</Link> · <Link href={`/admin/items?owner_id=${c.user_id}`}>Add their item</Link></article>)}</div>
 {customers.length>100&&<p>Showing the first 100 matches. Refine your search.</p>}
 </section></main>;
}
