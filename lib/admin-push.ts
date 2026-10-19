import { createHmac } from "node:crypto";
import webpush from "web-push";
import { postalStorage } from "@/lib/postal-server";

import { validPushEndpoint } from "@/lib/admin-push-policy";
export function pushConfigured() {
 return Boolean(process.env.ADMIN_PUSH_VAPID_PUBLIC_KEY && process.env.ADMIN_PUSH_VAPID_PRIVATE_KEY && process.env.ADMIN_PUSH_DISPATCH_SECRET);
}
type Job = {job_id:string;endpoint:string;p256dh:string;auth_secret:string;locale:string;kind:string;target_path:string;event_key:string};
export async function deliverAdminPushJobs() {
 if (!pushConfigured()) throw new Error("Push delivery is not configured");
 const service = postalStorage();
 const {data, error} = await service.rpc("claim_admin_push_jobs");
 if (error) throw new Error("Push queue is unavailable");
 const jobs = (data ?? []) as Job[];
 let delivered = 0;
 for (let offset=0;offset<jobs.length;offset+=5) {
  await Promise.all(jobs.slice(offset,offset+5).map(async job => {
   let status = 0, success = false;
   try {
    if (!validPushEndpoint(job.endpoint)) { status=410; throw new Error("Unsupported endpoint"); }
    const fr = job.locale === "fr";
    const body = job.kind === "test" ? (fr ? "Les notifications Shikimomo sont connectées à cet appareil." : "Shikimomo notifications are connected to this device.")
     : job.kind === "pickup" ? (fr ? "Nouvelle demande de collecte. Ouvrez le panneau pour la consulter." : "New pickup request. Open the panel to review it.")
     : (fr ? "Nouvelle activité de soutien. Ouvrez votre boîte de réception." : "New support activity. Open your support inbox.");
    const response = await webpush.sendNotification(
     {endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth_secret}},
     JSON.stringify({title:job.kind==="pickup"?"Shikimomo · Pickup":job.kind==="support"?"Shikimomo · Support":"Shikimomo",body,tag:job.event_key,url:job.target_path,receipt:{id:job.job_id,token:createHmac("sha256",process.env.ADMIN_PUSH_DISPATCH_SECRET!).update(job.job_id).digest("hex")}}),
     {TTL:3600,urgency:"high",timeout:5000,vapidDetails:{subject:"https://shikimomo.com",publicKey:process.env.ADMIN_PUSH_VAPID_PUBLIC_KEY!,privateKey:process.env.ADMIN_PUSH_VAPID_PRIVATE_KEY!}});
    status=response.statusCode;success=true;delivered++;
   } catch(error) {
    const code = (error as {statusCode?:number}).statusCode;
    if (typeof code === "number") status=code;
   }
   const {error:ackError}=await service.rpc("complete_admin_push_job",{p_job:job.job_id,p_success:success,p_status:status});
   if(ackError) throw new Error("Push acknowledgement failed");
  }));
 }
 return {processed:jobs.length,delivered};
}
