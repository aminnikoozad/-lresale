"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { postalReadiness } from "@/lib/postal-server";
import { weightBand } from "@/lib/postal";
async function admin() { const ctx=await requireAdmin();if(!ctx.access.can_manage_shipping||!ctx.access.has_aal2)redirect("/admin/mfa");return ctx.supabase; }
function finish(message:string,item=""):never {revalidatePath("/admin/postal");revalidatePath("/shipping-policy");redirect(`/admin/postal?${new URLSearchParams({message,...(item?{item}:{})})}`);}
export async function savePostalConfig(form:FormData) {
  const db=await admin();const enabled=form.get("enabled")==="on";
  const readiness=postalReadiness();
  if(enabled&&(!readiness.carrier||!readiness.production||!readiness.storage))finish("Add the production carrier and server storage credentials before enabling live quotes.");
  const bands=[1,2,3,4].map(n=>Number(form.get(`band_${n}`)));
  try{weightBand(1,bands);}catch{finish("Enter four increasing weight limits in grams, up to 30,000 g.");}
  const {error}=await db.rpc("admin_save_postal_config",{p_enabled:enabled,p_origin:String(form.get("origin")??""),p_bands:bands});
  finish(error?"Settings could not be saved. Check the origin postal code and weight bands.":"Postal settings saved.");
}
export async function savePostalParcel(form:FormData) {
  const db=await admin();const item=String(form.get("item")??"");
  const n=(key:string)=>Number(form.get(key));
  const values=[n("weight"),n("length"),n("width"),n("height")];
  if(values.some(v=>!Number.isInteger(v)||v<=0))finish("Enter positive whole numbers in grams and millimetres.",item);
  const {error}=await db.rpc("admin_save_postal_parcel",{p_item:item,p_weight:values[0],p_length:values[1],p_width:values[2],p_height:values[3],p_manual:form.get("manual")==="on",p_local:form.get("local")==="on",p_tube:form.get("tube")==="on",p_unpackaged:form.get("unpackaged")==="on"});
  finish(error?"Parcel could not be saved. Check the measurements and your permissions.":"Packed parcel saved. Previous quotes for this item will need recalculation.",item);
}
