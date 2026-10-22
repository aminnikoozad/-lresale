import "server-only";
import { cookies } from "next/headers";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createClient } from "./supabase/server";
import { getSupabaseConfig } from "./supabase/config";
import { isNeonStaging,stagingActors,stagingPhoto,stagingRegisterPhoto,stagingWithdrawPhoto,stagingSubmitEvidence,stagingBeginPhotoUpload,type StagingActor,type RegisteredPhoto } from "./neon-staging";

const bucket="shikimomo-listing-photos";
export function marketplaceMediaEnabled() {
  return isNeonStaging()?Boolean(process.env.SHIKIMOMO_MEDIA_ENDPOINT&&process.env.SHIKIMOMO_MEDIA_ACCESS_KEY&&process.env.SHIKIMOMO_MEDIA_SECRET_KEY):process.env.MARKETPLACE_MEDIA_ENABLED==="true"&&Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function s3() {
  if(!isNeonStaging()||!marketplaceMediaEnabled()) throw new Error("media_unavailable");
  const endpoint=new URL(process.env.SHIKIMOMO_MEDIA_ENDPOINT!);
  if(endpoint.protocol!=="https:"||!endpoint.hostname.endsWith(".storage.c-7.us-east-2.aws.neon.tech")) throw new Error("media_unavailable");
  return new S3Client({endpoint:endpoint.origin,region:"us-east-2",forcePathStyle:true,credentials:{accessKeyId:process.env.SHIKIMOMO_MEDIA_ACCESS_KEY!,secretAccessKey:process.env.SHIKIMOMO_MEDIA_SECRET_KEY!}});
}
function adminStorage() {
  if(!marketplaceMediaEnabled()||isNeonStaging()) throw new Error("media_unavailable");
  return createAdmin(getSupabaseConfig().url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function marketplaceActor() {
  if(isNeonStaging()) {const actor:StagingActor=(await cookies()).get("shikimomo-stage-actor")?.value==="b"?"b":"a";return {id:stagingActors[actor],actor,client:null};}
  const client=await createClient();const {data:{user}}=await client.auth.getUser();
  if(!user||user.is_anonymous) throw new Error("sign_in_required");
  return {id:user.id,actor:null,client};
}
export type MarketplaceActor=Awaited<ReturnType<typeof marketplaceActor>>;
export async function authorizePhotoUpload(ctx:MarketplaceActor,id:string,version:number,asset:string){
 if(ctx.actor)return stagingBeginPhotoUpload(ctx.actor,id,version,asset);
 const {error}=await ctx.client!.rpc("marketplace_begin_photo_upload",{p_item:id,p_version:version,p_asset:asset});
 if(error){if(error.message==='Photo upload rate limit')throw new Error('photo_rate_limit');if(error.message==='Maximum 20 photos per item')throw new Error('photo_count_limit');throw new Error('draft_changed');}
}
export async function storeProcessedPhoto(ctx:MarketplaceActor,p:RegisteredPhoto,bytes:Uint8Array) {
  if(ctx.actor) {
    const storage=s3();
    try {await storage.send(new PutObjectCommand({Bucket:bucket,Key:p.key,Body:bytes,ContentType:"image/webp",CacheControl:"private, no-store",IfNoneMatch:"*",Metadata:{sha256:p.sha}}));}
    catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==412) throw new Error("photo_upload_failed");const head=await storage.send(new HeadObjectCommand({Bucket:bucket,Key:p.key}));if(head.Metadata?.sha256!==p.sha) throw new Error("photo_upload_failed");}
    return stagingRegisterPhoto(ctx.actor,p);
  }
  const admin=adminStorage();
  const upload=await admin.storage.from(bucket).upload(p.key,bytes,{contentType:"image/webp",upsert:false});
  if(upload.error){const prior=await admin.storage.from(bucket).download(p.key);if(!prior.data||createHash("sha256").update(new Uint8Array(await prior.data.arrayBuffer())).digest("hex")!==p.sha) throw new Error("photo_upload_failed");}
  const {error}=await admin.rpc("register_marketplace_photo",{p_item:p.item,p_owner:p.owner,p_version:p.version,p_asset:p.asset,p_role:p.role,p_defect:p.defect,p_provider:p.provider,p_key:p.key,p_sha:p.sha,p_width:p.width,p_height:p.height,p_bytes:p.bytes});
  if(error) throw new Error("photo_register_failed");
}
export async function readProcessedPhoto(ctx:MarketplaceActor,id:string) {
  const photo=ctx.actor?await stagingPhoto(ctx.actor,id):(await ctx.client!.rpc("my_marketplace_photo",{p_asset:id})).data as {key:string;provider:string}|null;
  if(!photo) throw new Error("photo_unavailable");
  if(ctx.actor&&photo.provider==="neon_staging") {const response=await s3().send(new GetObjectCommand({Bucket:bucket,Key:photo.key}));return response.Body?.transformToByteArray();}
  if(ctx.actor||photo.provider!=="supabase") throw new Error("photo_unavailable");
  const response=await adminStorage().storage.from(bucket).download(photo.key);if(response.error||!response.data) throw new Error("photo_unavailable");return new Uint8Array(await response.data.arrayBuffer());
}
export async function withdrawPhoto(ctx:MarketplaceActor,id:string,version:number) {
  if(ctx.actor) return stagingWithdrawPhoto(ctx.actor,id,version);
  const {error}=await ctx.client!.rpc("withdraw_marketplace_photo",{p_asset:id,p_version:version});if(error) throw new Error("draft_changed");
}
export async function submitEvidence(ctx:MarketplaceActor,id:string,version:number,flaws:string,noLabel:boolean,attest:boolean) {
  if(ctx.actor) return stagingSubmitEvidence(ctx.actor,id,version,flaws,noLabel,attest);
  const {error}=await ctx.client!.rpc("submit_marketplace_evidence",{p_item:id,p_version:version,p_flaws:flaws,p_no_label:noLabel,p_attest:attest});if(error) throw new Error("evidence_incomplete");
}
