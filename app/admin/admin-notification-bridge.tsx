"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SupportNotification={id:string;event_type:string;conversation_id:string|null;related_id:string|null;title:string;body:string;priority:string;created_at:string};
type Prefs={dashboard_enabled:boolean;push_enabled:boolean;event_preferences:Record<string,boolean>|null};

export function AdminNotificationBridge(){
  const supabase=useMemo(()=>createClient(),[]);const [item,setItem]=useState<SupportNotification|null>(null);
  useEffect(()=>{
    let channel:ReturnType<typeof supabase.channel>|null=null;let prefs:Prefs={dashboard_enabled:true,push_enabled:true,event_preferences:{}};
    void supabase.auth.getUser().then(async({data})=>{
      const uid=data.user?.id;if(!uid)return;
      const {data:prefRow}=await supabase.from("admin_notification_preferences").select("dashboard_enabled,push_enabled,event_preferences").eq("admin_id",uid).maybeSingle();
      if(prefRow)prefs=prefRow as Prefs;
      if("serviceWorker" in navigator)void navigator.serviceWorker.register("/admin-sw.js",{scope:"/"}).catch(()=>undefined);
      channel=supabase.channel(`admin-support-notifications-${uid}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"support_notifications",filter:`admin_id=eq.${uid}`},async payload=>{
        const n=payload.new as SupportNotification;
        const eventAllowed=prefs.event_preferences?.[n.event_type]??true;
        if(!eventAllowed)return;
        if(prefs.dashboard_enabled)setItem(n);
        if(prefs.push_enabled&&"Notification" in window&&Notification.permission==="granted"&&"serviceWorker" in navigator){
          try{const reg=await navigator.serviceWorker.ready;await reg.showNotification(n.title,{body:n.body,icon:"/favicon.svg",badge:"/favicon.svg",tag:`support-${n.id}`,data:{url:n.conversation_id?`/admin/support/${n.conversation_id}`:"/admin/ai-trainer"}})}catch{}
        }
      }).subscribe();
    });
    return()=>{if(channel)void supabase.removeChannel(channel)};
  },[supabase]);
  if(!item)return null;
  const href=item.conversation_id?`/admin/support/${item.conversation_id}`:"/admin/ai-trainer";
  return <div className={`support-global-toast priority-${item.priority}`} role="status" aria-live="polite"><div><BellRing/><strong>{item.title}</strong></div><p>{item.body}</p><div><Link href={href} onClick={()=>{void supabase.rpc("support_mark_notification_read",{p_notification_id:item.id});setItem(null)}}>Open</Link><button type="button" aria-label="Dismiss" onClick={()=>setItem(null)}><X/></button></div></div>;
}
