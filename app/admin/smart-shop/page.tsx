import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { assistantHostConfig } from "@/lib/assistant-host";
import { DEFAULT_SMART_SHOP } from "@/lib/smart-shop-settings";
import { Localize } from "@/components/site-language";
import { AssistantMark } from "@/components/assistant-mark";
import { saveSmartShop } from "./actions";
import "../operations/operations.css";
export const dynamic="force-dynamic";
export default async function SmartShopAdmin({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {supabase,access}=await requireAdmin();
 if(!access.can_manage_selling_rules)notFound();
 const [{data,error},params]=await Promise.all([supabase.from("smart_shop_settings").select("*").eq("id",1).single(),searchParams]);
 const settings=data??DEFAULT_SMART_SHOP;
 const host=assistantHostConfig(process.env);
 let health=false;
 if(host){try{const r=await fetch(`${host.url}/health`,{headers:{Authorization:`Bearer ${host.token}`},cache:"no-store",signal:AbortSignal.timeout(4000),redirect:"error"});health=r.ok;}catch{}}
 const {data:audit}=await supabase.from("smart_shop_settings_audit").select("id,changed_at,settings").order("changed_at",{ascending:false}).limit(10);
 return <Localize><main className="ops-shell"><section className="ops-wrap">
  <div className="ops-heading"><div><AssistantMark /><h1>Smart Shopping controls</h1><p>Manage customer chat, live voice and shopping preferences.</p></div><Link href="/admin">Admin dashboard</Link></div>
  {params.saved&&<p role="status" className="ops-message success">Settings saved.</p>}
  {(error||params.error)&&<p role="alert" className="ops-message error">Settings could not be loaded or saved. Smart Shopping stays unavailable.</p>}
  <section className="ops-card"><h2>Service status</h2><p>{host?(health?"Owner-hosted server connected":"Owner-hosted server unreachable"):"Owner-hosted server not configured"}</p><p>Enabling the assistant does not connect a server. Chat and voice require the owner-hosted model.</p><Link href="/assistant">Preview Smart Shopping</Link></section>
  <section className="ops-card"><form action={saveSmartShop}><fieldset disabled={Boolean(error)||!access.has_aal2} className="smart-shop-controls">
   <label><input type="checkbox" name="enabled" defaultChecked={settings.enabled}/>Enable Smart Shopping</label>
   <label><input type="checkbox" name="chat_enabled" defaultChecked={settings.chat_enabled}/>Enable chat</label>
   <label><input type="checkbox" name="voice_enabled" defaultChecked={settings.voice_enabled}/>Enable live voice</label>
   <label><input type="checkbox" name="memory_enabled" defaultChecked={settings.memory_enabled}/>Allow shopping preference memory</label>
   <label>Customer notice — English<textarea name="notice_en" maxLength={300} defaultValue={settings.notice_en} translate="no"/></label>
   <label>Customer notice — French<textarea name="notice_fr" maxLength={300} defaultValue={settings.notice_fr} translate="no"/></label>
   <button type="submit">Save settings</button>
  </fieldset></form><p>Customer actions remain restricted to the signed-in customer. These controls never grant administrative access to the assistant.</p></section>
  <section className="ops-card"><h2>Recent setting changes</h2><ul>{audit?.map(row=><li key={row.id}><time>{row.changed_at}</time> · {row.settings?.enabled?"Enabled":"Paused"}</li>)}</ul></section>
 </section></main></Localize>;
}
