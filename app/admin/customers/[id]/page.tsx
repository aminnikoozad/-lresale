
import { Localize } from "@/components/site-language";
import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {requireAdmin} from '@/lib/admin-auth';
import {addCustomerUpdate,recordItemSale} from '../actions';
import '../../items/items.css';
export const dynamic='force-dynamic';
type Item={id:string;code:string;name:string;status:string;initial:number|null;current:number|null;sold:number|null;sellerBps:number|null;platformBps:number|null};
type Workspace={id:string;name:string;username:string;email:string;items:Item[];updates:{id:string;body:string;customer_visible:boolean;created_at:string}[];ledger:{id:string;amount_cents:number;status:string;description:string;created_at:string;sale_mode?:string|null}[]};
const cad=(n:number|null)=>n===null?'Pending':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n/100);
export default async function Customer({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{message?:string}>}){
 const {supabase,access}=await requireAdmin();if(!access.has_aal2)redirect('/admin/mfa');
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const {data,error}=await supabase.rpc('admin_customer_workspace',{target_customer:id});if(error||!data)notFound();
 const c=data as Workspace;const {message}=await searchParams;
 const ledgerResult=await supabase.rpc('admin_customer_ledger_modes',{p_customer:id});
 const ledger=(ledgerResult.data??[]) as Workspace['ledger'];
 return <Localize>{<main className="admin-items-shell"><section className="admin-items-wrap"><Link href="/admin/customers">← Customers</Link><h1>@{c.username}</h1><p>{c.name} · {c.email}</p>

 {message&&<p role="status" className="admin-items-message">{message}</p>}
 <section className="admin-items-card"><h2>Seller workflow</h2><p>Receive → inspect &amp; photograph → propose price → seller approves → publish → record confirmed sale → review settlement.</p><p>Attach the item code to the physical garment. The code remains linked to this seller even if their username changes.</p></section>
 <section className="admin-items-card"><h2>Items belonging to @{c.username}</h2><Link className="primary-action" href={`/admin/items?owner_id=${id}`}>Add item for this seller</Link>{c.items.length===0&&<p>No items yet. Use “Add item for this seller” after receiving their goods.</p>}
 {c.items.map(i=><article className="admin-item-row" key={i.id}><h3>{i.code||'Label pending'} · {i.name}</h3><p>{i.status.replaceAll('_',' ')}</p><dl><div><dt>Initial price</dt><dd>{cad(i.initial)}</dd></div><div><dt>Current price</dt><dd>{cad(i.current)}</dd></div><div><dt>Commission</dt><dd>See the selling-method fee policy and cash-out breakdown.</dd></div></dl>
 <Link href={`/admin/items?owner_id=${id}`}>Manage pricing and listing</Link>
 {i.status==='listed'&&['owner','admin'].includes(access.role)&&<details><summary>Record a confirmed external sale</summary><p>Only after verifying an actual sale at the current item price. Exclude tax, delivery and other buyer charges. Creates pending earnings only.</p><form action={recordItemSale} className="admin-item-form"><input type="hidden" name="customer_id" value={id}/><input type="hidden" name="item_id" value={i.id}/><input type="hidden" name="expected_price" value={i.current??''}/><label>Receipt / payment reference<input name="reference" minLength={4} maxLength={160} required/></label><label><input type="checkbox" name="confirmed" value="yes" required/>I verified the sale for {cad(i.current)}.</label><button className="primary-action">Record sale &amp; pending earnings</button></form></details>}</article>)}</section>
 <section className="admin-items-card"><h2>Earnings ledger</h2><p>Pending credits are not an available payout. Bank transfers and payment processing are not enabled here. Managed sale credits are before cash-out commission. Personal-sale fees remain separate.</p>{ledgerResult.error?<p role="alert">Earnings ledger unavailable.</p>:([['managed_consignment','Sold by Shikimomo'],['peer_to_peer','Personal sales'],['unallocated','Unallocated history — review required']] as const).map(([mode,label])=><section key={mode}><h3>{label}</h3>{ledger.filter(w=>(w.sale_mode??'unallocated')===mode).map(w=><p key={w.id}>{cad(w.amount_cents)} · {w.status} · {w.description}</p>)}</section>)}</section>
 <section className="admin-items-card"><h2>Account updates &amp; internal notes</h2><form action={addCustomerUpdate} className="admin-item-form"><input type="hidden" name="customer_id" value={id}/><label>Visibility<select name="visibility"><option value="internal">Internal staff note</option><option value="customer">Message visible in customer’s account</option></select></label><label className="full">Message<textarea name="body" minLength={2} maxLength={2000} rows={4} required/></label><button className="primary-action">Save update</button></form><p>Account messages appear under Profile &amp; messages. This does not send an email or SMS.</p>{c.updates.map(n=><article key={n.id}><strong>{n.customer_visible?'Customer-visible':'Internal only'}</strong><p style={{whiteSpace:'pre-wrap'}}>{n.body}</p><small>{new Date(n.created_at).toLocaleString('en-CA')}</small></article>)}</section>
 </section></main>}</Localize>;
}
