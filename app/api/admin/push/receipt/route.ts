import { createHmac, timingSafeEqual } from "node:crypto";
import { postalStorage } from "@/lib/postal-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
 if(request.headers.get("origin") && request.headers.get("origin")!==new URL(request.url).origin)return new Response("Forbidden",{status:403});
 const secret=process.env.ADMIN_PUSH_DISPATCH_SECRET;
 if(!secret)return new Response("Unavailable",{status:503});
 let body;
 try{const raw=await request.text();if(raw.length>1000)return new Response("Too large",{status:413});body=JSON.parse(raw);}catch{return new Response("Invalid request",{status:400});}
 if(typeof body.id!=="string"||!/^[a-f0-9-]{36}$/.test(body.id)||typeof body.token!=="string"||!/^[a-f0-9]{64}$/.test(body.token)||typeof body.displayed!=="boolean")return new Response("Invalid request",{status:400});
 const expected=createHmac("sha256",secret).update(body.id).digest("hex");
 if(!timingSafeEqual(Buffer.from(body.token),Buffer.from(expected)))return new Response("Forbidden",{status:403});
 const {error}=await postalStorage().rpc("record_admin_push_receipt",{p_job:body.id,p_displayed:body.displayed,p_error:typeof body.error==="string"?body.error.slice(0,100):null});
 return new Response(null,{status:error?503:204});
}
