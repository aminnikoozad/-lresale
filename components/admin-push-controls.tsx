"use client";
import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useLocale } from "@/components/site-language";

async function pushAction(body:Record<string,unknown>) {
 const response=await fetch("/api/admin/push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const result=await response.json();
 if(!response.ok)throw new Error(result.error||"Could not update notifications.");
 return result;
}
export function AdminPushControls() {
 const {locale}=useLocale();const fr=locale==="fr";
 const [registered,setRegistered]=useState(false),[supported,setSupported]=useState(true),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  void (async()=>{
   await Promise.resolve();
   if(cancelled)return;
   const available="Notification" in window&&"serviceWorker" in navigator&&"PushManager" in window;
   if(!available){setSupported(false);return;}
   setBlocked(Notification.permission==="denied");
   const registration=await navigator.serviceWorker.getRegistration("/");
   const subscription=await registration?.pushManager.getSubscription();
   if(subscription){const result=await pushAction({action:"status",endpoint:subscription.endpoint});if(!cancelled)setRegistered(result.registered);}
  })().catch(()=>{});
  return()=>{cancelled=true};
 },[]);
 async function enable() {
  setBusy(true);setMessage("");setFailed(false);
  try{
   if(!supported)throw new Error("Unsupported browser");
   const permission=await Notification.requestPermission();
   setBlocked(permission==="denied");
   if(permission!=="granted"){setMessage(fr?"Autorisez les notifications dans les réglages de ce site.":"Allow notifications in this site's settings.");return;}
   const response=await fetch("/api/admin/push",{cache:"no-store"});const config=await response.json();
   if(!response.ok||!config.configured||!config.publicKey)throw new Error("Push configuration unavailable");
   const registration=await navigator.serviceWorker.register("/admin-sw.js",{scope:"/",updateViaCache:"none"});
   await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(subscription){
    const existing=subscription.options.applicationServerKey;
    const expected=Uint8Array.from(atob(config.publicKey.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
    if(existing && (existing.byteLength!==expected.length||new Uint8Array(existing).some((v,i)=>v!==expected[i]))){await subscription.unsubscribe();subscription=null;}
   }
   if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:config.publicKey});
   await pushAction({action:"subscribe",subscription:subscription.toJSON(),locale});
   setRegistered(true);
   setMessage(fr?"Collectes et soutien : cet appareil est connecté.":"Pickup and support alerts: this device is connected.");
  }catch{setFailed(true);setMessage(fr?"Connexion impossible. Vérifiez votre session administrateur et réessayez.":"Could not connect. Check your admin session and try again.");}
  finally{setBusy(false);}
 }
 async function disable() {
  setBusy(true);setFailed(false);setMessage("");
  try{
   const registration=await navigator.serviceWorker.getRegistration("/");
   const subscription=await registration?.pushManager.getSubscription();
   if(subscription){await pushAction({action:"disable",endpoint:subscription.endpoint});await subscription.unsubscribe();}
   setRegistered(false);setMessage(fr?"Notifications désactivées sur cet appareil.":"Notifications disabled on this device.");
  }catch{setFailed(true);setMessage(fr?"Impossible de désactiver les notifications. Réessayez.":"Could not disconnect. Try again.");}
  finally{setBusy(false);}
 }
 async function test() {
  setBusy(true);setFailed(false);
  try{
   const registration=await navigator.serviceWorker.getRegistration("/");
   const subscription=await registration?.pushManager.getSubscription();
   if(!subscription)throw new Error("No subscription");
   await pushAction({action:"test",endpoint:subscription.endpoint});
   setMessage(fr?"Test envoyé. L’alerte devrait arriver sous une minute.":"Test queued. The alert should arrive within one minute.");
  }catch{setFailed(true);setMessage(fr?"Test impossible. Vérifiez la connexion ou attendez une minute.":"Could not queue a test. Check registration or wait one minute.");}
  finally{setBusy(false);}
 }
 return <div className="admin-push-controls">
  {!supported?<p>{fr?"Sur iPhone, ajoutez Shikimomo à l’écran d’accueil, ouvrez l’application, puis activez les notifications.":"On iPhone, add Shikimomo to your Home Screen, open the app, then enable notifications."}</p>
   :<div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
    {registered?<><span><BellRing size={18} style={{display:"inline"}}/> {fr?"Cet appareil est connecté":"This device is connected"}</span><button type="button" disabled={busy} onClick={()=>void test()}>{fr?"Envoyer un test":"Send test notification"}</button><button type="button" disabled={busy} onClick={()=>void disable()}>{fr?"Désactiver sur cet appareil":"Disable on this device"}</button></>
    :<button type="button" disabled={busy} onClick={()=>void enable()}><Bell size={18} style={{display:"inline"}}/> {busy?(fr?"Connexion…":"Connecting…"):(fr?"Activer les notifications sur cet appareil":"Enable notifications on this device")}</button>}
   </div>}
  {blocked?<p>{fr?"Les notifications sont bloquées dans les réglages de ce navigateur.":"Notifications are blocked in this browser's site settings."}</p>:null}
  {message?<p role="status" style={{color:failed?"#b42318":"#37654f"}}>{message}</p>:null}
 </div>;
}
