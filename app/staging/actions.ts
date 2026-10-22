"use server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isNeonStaging,saveStagingDraft,manageStagingDraft } from "@/lib/neon-staging";
import { parseDraftFields,parseDraftAction } from "@/lib/marketplace";
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
    await saveStagingDraft(actor,id||null,version,parseDraftFields(form));
  } catch {redirect("/staging?error=save");}
  revalidatePath("/staging");redirect("/staging?saved=1");
}
export async function manageNeonDraft(form:FormData) {
  if(!isNeonStaging()) notFound();
  const actor=(await cookies()).get("shikimomo-stage-actor")?.value==="b"?"b":"a";
  try {
    const {id,version,operation,request}=parseDraftAction(form);
    await manageStagingDraft(actor,id,version,operation,request);
  } catch {redirect("/staging?error=action");}
  revalidatePath("/staging");redirect("/staging?updated=1");
}
