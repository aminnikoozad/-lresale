import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushConfigured } from "@/lib/admin-push";
import { validPushEndpoint } from "@/lib/admin-push-policy";

export const runtime="nodejs";
export const dynamic="force-dynamic";
async function verifiedAdmin() {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return null;
 const {data,error}=await supabase.rpc("admin_access_context");
 const access=Array.isArray(data)?data[0]:data;
 if(error||!access|| (access.require_mfa&&!access.has_aal2))return null;
 return supabase;
}
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET() {
 if(!await verifiedAdmin())return reply({error:"Verified admin session required."},403);
 return reply({configured:pushConfigured(),publicKey:process.env.ADMIN_PUSH_VAPID_PUBLIC_KEY||null});
}
export async function POST(request:Request) {
 if(request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Invalid origin."},403);
 const supabase=await verifiedAdmin();
 if(!supabase)return reply({error:"Verified admin session required."},403);
 if(Number(request.headers.get("content-length")||0)>6000)return reply({error:"Request too large."},413);
 let body;
 try {const raw=await request.text();if(raw.length>6000)return reply({error:"Request too large."},413);body=JSON.parse(raw);}
 catch{return reply({error:"Invalid request."},400);}
 const endpoint=body?.subscription?.endpoint||body?.endpoint;
 if(typeof endpoint!=="string"||endpoint.length>2048||!validPushEndpoint(endpoint))return reply({error:"Invalid push endpoint."},400);
 if(body.action==="status") {
  const {data,error}=await supabase.rpc("admin_push_device_status",{p_endpoint:endpoint});
  return error?reply({error:"Could not check this device."},503):reply({registered:data===true});
 }
 if(body.action==="disable"){
  const {error}=await supabase.rpc("admin_disable_push_device",{p_endpoint:endpoint});
  return error?reply({error:"Could not disconnect this device."},503):reply({ok:true});
 }
 if(!pushConfigured())return reply({error:"Push delivery is not configured."},503);
 if(body.action==="test"){
  const {error}=await supabase.rpc("admin_test_push_device",{p_endpoint:endpoint});
  return error?reply({error:"Could not queue a test. Check registration or wait one minute."},400):reply({ok:true});
 }
 if(body.action!=="subscribe")return reply({error:"Unknown action."},400);
 const keys=body.subscription?.keys;
 if(!keys||typeof keys.p256dh!=="string"||!/^[A-Za-z0-9_-]{87}$/.test(keys.p256dh)||typeof keys.auth!=="string"||!/^[A-Za-z0-9_-]{22}$/.test(keys.auth))return reply({error:"Invalid subscription keys."},400);
 const {error}=await supabase.rpc("admin_register_push_device",{p_endpoint:endpoint,p_p256dh:keys.p256dh,p_auth:keys.auth,p_locale:body.locale==="fr"?"fr":"en"});
 return error?reply({error:"Could not register this device. Sign in again and complete MFA."},400):reply({ok:true});
}
