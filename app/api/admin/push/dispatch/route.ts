import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverAdminPushJobs } from "@/lib/admin-push";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(request:Request) {
 const secret=process.env.ADMIN_PUSH_DISPATCH_SECRET;
 const received=request.headers.get("authorization")||"";
 const expected=secret?`Bearer ${secret}`:"";
 if(!secret||secret.length<32||Buffer.byteLength(received)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return new Response("Unauthorized",{status:401});
 try{return NextResponse.json({ok:true,...await deliverAdminPushJobs()},{headers:{"Cache-Control":"no-store"}});}
 catch{return NextResponse.json({ok:false},{status:503});}
}
