"use server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isNeonStaging,saveStagingDraft } from "@/lib/neon-staging";
import { parseCadCents } from "@/lib/marketplace";
export async function selectStagingActor(form:FormData) {
  if(!isNeonStaging()) notFound();
  const actor=form.get("actor");
  if(actor!=="a" && actor!=="b") notFound();
  (await cookies()).set("shikimomo-stage-actor",actor,{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:86400});
  redirect("/staging");
}
export async function saveNeonDraft(form:FormData) {
  if(!isNeonStaging()) notFound();
  const actor=(await cookies()).get("shikimomo-stage-actor")?.value==="b"?"b":"a";
  const text=(key:string)=>String(form.get(key)??"").trim();
  const id=text("id"),version=Number(text("version"));
  if(!Number.isSafeInteger(version)||version<0||(id&&!/^[0-9a-f-]{36}$/i.test(id))) redirect("/staging?error=save");
  try {
    const fields=Object.fromEntries(["name","brand_kind","brand","category","size","size_system","item_condition","color","material","description","condition_notes"].map(key=>[key,text(key)]));
    await saveStagingDraft(actor,id||null,version,{...fields,price_cents:parseCadCents(text("price")),label_absent:form.get("label_absent")==="on"});
  } catch {redirect("/staging?error=save");}
  revalidatePath("/staging");redirect("/staging?saved=1");
}
