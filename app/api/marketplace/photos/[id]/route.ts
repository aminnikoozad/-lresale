import { NextRequest,NextResponse } from "next/server";
import { marketplaceActor,readProcessedPhoto,withdrawPhoto } from "@/lib/marketplace-media";
export const runtime="nodejs";
type Props={params:Promise<{id:string}>};
const valid=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
export async function GET(_req:NextRequest,{params}:Props){try{const {id}=await params;if(!valid(id)) throw new Error();const ctx=await marketplaceActor();const bytes=await readProcessedPhoto(ctx,id);if(!bytes||bytes.length>1_500_000) throw new Error();return new Response(Buffer.from(bytes),{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}catch{return new Response("Photo unavailable",{status:404});}}
export async function DELETE(req:NextRequest,{params}:Props){try{if(req.headers.get("origin")!==req.nextUrl.origin) return new Response(null,{status:403});const {id}=await params;const {version}=await req.json();if(!valid(id)||!Number.isSafeInteger(version)||version<1) throw new Error();const ctx=await marketplaceActor();await withdrawPhoto(ctx,id,version);return NextResponse.json({withdrawn:true});}catch{return NextResponse.json({error:"draft_changed"},{status:400});}}
