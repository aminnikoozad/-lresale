import { NextRequest,NextResponse } from "next/server";
import { marketplaceActor,marketplaceMediaEnabled,checkPhotoDraft,storeProcessedPhoto } from "@/lib/marketplace-media";
import { processListingPhoto,MAX_LISTING_PHOTO_BYTES } from "@/lib/listing-photo-processing";
export const runtime="nodejs";
export async function POST(req:NextRequest) {
  try {
    if(req.headers.get("origin")!==req.nextUrl.origin) return NextResponse.json({error:"origin_rejected"},{status:403});
    const ctx=await marketplaceActor();if(!marketplaceMediaEnabled()) return NextResponse.json({error:"media_unavailable"},{status:503});
    if(Number(req.headers.get("content-length"))>3_500_000) return NextResponse.json({error:"photo_size"},{status:413});
    const form=await req.formData();const id=String(form.get("item")??""),asset=String(form.get("upload_id")??""),role=String(form.get("role")??""),defect=String(form.get("defect")??"").trim(),version=Number(form.get("version"));const file=form.get("file");
    const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if(!uuid.test(id)||!uuid.test(asset)||!Number.isSafeInteger(version)||version<1||!["front","back","left","right","size_label","defect","detail"].includes(role)||defect.length>300||(role==="defect"&&defect.length<3)||!(file instanceof File)||file.size>MAX_LISTING_PHOTO_BYTES) return NextResponse.json({error:"invalid_photo"},{status:400});
    await checkPhotoDraft(ctx,id,version);const photo=await processListingPhoto(new Uint8Array(await file.arrayBuffer()));
    await storeProcessedPhoto(ctx,{item:id,owner:ctx.id,version,asset,role,defect,provider:ctx.actor?"neon_staging":"supabase",key:`${ctx.id}/${id}/${asset}.webp`,sha:photo.sha256,width:photo.width,height:photo.height,bytes:photo.bytes.length},photo.bytes);
    return NextResponse.json({saved:true});
  } catch(error){const code=error instanceof Error?error.message:"upload_failed";const safe=["sign_in_required","draft_changed","photo_size","photo_format","photo_dimensions","photo_decode","photo_heic_unavailable","media_unavailable"].includes(code)?code:"upload_failed";return NextResponse.json({error:safe},{status:code==="sign_in_required"?401:400});}
}
