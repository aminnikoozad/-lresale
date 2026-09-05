"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SupportNotification={id:string;event_type:string;conversation_id:string|null;related_id:string|null;title:string;body:string;priority:string;created_at:string};

export function AdminNotificationBridge(){
  const supabase=useMemo(()=>createClient(),[]);const [item,setItem]=useState<SupportNotification|null>(null);
  useEffect(()=>{
    let channel:ReturnType<typeof supabase.channel>|null=null;
    void supabase.auth.getUser().then(({data})=>{
      const uid=data.user?.id;if(!uid)return;
      if("serviceWorker" in navigator)void navigator.serviceWorker.register("/admin-sw.js",{scope:"/"}).catch(()=>undefined);
      channel=supabase.channel(`admin-support-notifications-${uid}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"support_notifications",filter:`admin_id=eq.${uid}`},async payload=>{
        const n=payload.new as SupportNotification;setItem(n);
        if("Notification" in window&&Notification.permission==="granted"&&"serviceWorker" in navigator){
          try{const reg=await navigator.serviceWorker.ready;await reg.showNotification(n.title,{body:n.body,icon:"/favicon.svg",badge:"/favicon.svg",tag:`support-${n.id}`,data:{url:n.conversation_id?`/admin/support/${n.conversation_id}`:"/admin/ai-trainer"}})}catch{}
        }
      }).subscribe();
    });
    return()=>{if(channel)void supabase.removeChannel(channel)};
  },[supabase]);
  if(!item)return null;
  const href=item.conversation_id?`/admin/support/${item.conversation_id}`:"/admin/ai-trainer";
  return <div className={`admin-live-toast support-global-toast priority-${item.priority}`} role="status" aria-live="polite"><div><BellRing/><strong>{item.title}</strong></div><p>{item.body}</p><div><Link href={href} onClick={()=>setItem(null)}>Open</Link><button type="button" aria-label="Dismiss" onClick={()=>setItem(null)}><X/></button></div></div>;
}
