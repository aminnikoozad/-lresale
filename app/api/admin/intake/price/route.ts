import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { readBoundedFormData, RequestBodyTooLarge } from "@/lib/bounded-request";
import { processListingPhoto } from "@/lib/listing-photo-processing";
import { processVisualPricingJob, visualSearchReady } from "@/lib/pricing/visual-server";
export const runtime="nodejs";
export const maxDuration=60;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function authorized() {
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user||user.is_anonymous)return null;
 const control=await db.rpc("admin_visual_intake_config");
 if(control.error)return null;
 return {db,enabled:control.data===true};
}
export async function GET(request:NextRequest) {
 const ctx=await authorized();if(!ctx)return reply({error:"admin_session_required"},403);
 const id=request.nextUrl.searchParams.get("intake");
 if(!id)return reply({ready:ctx.enabled&&visualSearchReady()});
 if(!uuid.test(id))return reply({error:"invalid_request"},400);
 const {data,error}=await ctx.db.rpc("admin_visual_intake_status",{target:id});
 return error||!data?reply({error:"intake_unavailable"},404):reply(data);
}
export async function POST(request:NextRequest) {
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"origin_rejected"},403);
 const ctx=await authorized();if(!ctx)return reply({error:"admin_session_required"},403);
 if(!ctx.enabled||!visualSearchReady())return reply({error:"visual_pricing_unavailable"},503);
 try {
  const form=await readBoundedFormData(request,750_000);
  const file=form.get("file"),requestId=String(form.get("request")??"");
  if(!(file instanceof File)||!uuid.test(requestId))return reply({error:"invalid_photo"},400);
  const photo=await processListingPhoto(new Uint8Array(await file.arrayBuffer()));
  const start=await ctx.db.rpc("admin_begin_visual_intake",{request_id:requestId,sha256:photo.sha256});
  if(start.error||!start.data)return reply({error:"intake_limit_or_unavailable"},429);
  const intake=start.data as {id:string;key:string;status:string};
  if(intake.status==="uploading") {
   const config=getSupabaseConfig();
   const storage=serviceClient(config.url,(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)!,{auth:{persistSession:false,autoRefreshToken:false}});
   const uploaded=await storage.storage.from("shikimomo-listing-photos").upload(intake.key,photo.bytes,{contentType:"image/webp",upsert:true});
   if(uploaded.error)return reply({id:intake.id,error:"photo_upload_failed"},503);
   const queued=await ctx.db.rpc("admin_queue_visual_intake",{target:intake.id});
   if(queued.error)return reply({id:intake.id,error:"photo_queue_failed"},503);
  }
  // Await one leased job. If this request stops, the durable queue can resume it.
  try {await processVisualPricingJob(intake.id);} catch { /* Status is authoritative, never infer completion from a timeout. */ }
  const status=await ctx.db.rpc("admin_visual_intake_status",{target:intake.id});
  if(status.error||!status.data)return reply({id:intake.id,error:"status_unavailable"},503);
  return reply(status.data,status.data.status==="completed"?200:202);
 } catch(error) {
  return reply({error:error instanceof RequestBodyTooLarge?"photo_too_large":"photo_could_not_be_prepared"},error instanceof RequestBodyTooLarge?413:400);
 }
}
