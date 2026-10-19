"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { postalReadiness } from "@/lib/postal-server";
import { CanadaPostError, canadaPostRates } from "@/lib/canada-post";
import { postalCode, validPostal, type PostalRate } from "@/lib/postal";
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


export type PostalConnectionTest = {
  status: "idle" | "not_configured" | "invalid_input" | "authentication" | "rate_limited" | "invalid_request" | "unavailable" | "no_services" | "ok";
  rates?: PostalRate[];
  testedAt?: string;
};

export async function testCanadaPostConnection(_previous: PostalConnectionTest, form: FormData): Promise<PostalConnectionTest> {
  await admin();
  const readiness = postalReadiness();
  if (!readiness.carrier || !readiness.production) return { status: "not_configured" };
  const origin = String(form.get("origin") ?? "");
  const destination = String(form.get("destination") ?? "");
  const weight = Number(form.get("weight"));
  const dimensions = ["length", "width", "height"].map(key => Number(form.get(key)));
  if (origin.length > 10 || destination.length > 10 || !validPostal(origin) || !validPostal(destination) ||
      !Number.isInteger(weight) || weight < 1 || weight > 30000 || dimensions.some(n => !Number.isInteger(n) || n < 1 || n > 2000)) return { status: "invalid_input" };
  const customerNumber = process.env.CANADA_POST_CUSTOMER_NUMBER;
  const contractId = process.env.CANADA_POST_CONTRACT_ID;
  if ((customerNumber && !/^\d{1,10}$/.test(customerNumber)) || (contractId && (!customerNumber || !/^\d{1,10}$/.test(contractId)))) return { status: "not_configured" };
  try {
    const rates = await canadaPostRates([{
      itemId: "connection-test", weightGrams: weight, lengthMm: dimensions[0], widthMm: dimensions[1], heightMm: dimensions[2],
      mailingTube: false, unpackaged: false, band: weightBand(weight)!,
    }], postalCode(origin), postalCode(destination), {
      clientId: process.env.CANADA_POST_CLIENT_ID!, clientSecret: process.env.CANADA_POST_CLIENT_SECRET!,
      customerNumber, contractId, locale: form.get("locale") === "fr" ? "fr-CA" : "en-CA",
    });
    return rates.length ? { status: "ok", rates, testedAt: new Date().toISOString() } : { status: "no_services" };
  } catch (error) {
    return { status: error instanceof CanadaPostError ? error.code : "unavailable" };
  }
}
