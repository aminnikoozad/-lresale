"use client";
import {createClient} from "@/lib/supabase/client";
export type BrowseEvent = "view_item_list"|"select_item"|"view_item"|"add_to_cart"|"begin_checkout";
/** Internal, opt-in events. No URLs, search text, email, names or browser fingerprint are sent. */
export async function recordBuyerEvent(name:BrowseEvent,ids:string[],onceKey?:string){
 if(typeof document==="undefined"||!document.cookie.split("; ").includes("shikimomo-analytics=yes")||!ids.length)return;
 const itemIds=ids.filter(id=>/^[0-9a-f-]{36}$/i.test(id)).slice(0,25);if(!itemIds.length)return;
 const key=onceKey?`sm-event:${name}:${onceKey}`:null;
 let eventId=crypto.randomUUID();
 try{if(key){const existing=sessionStorage.getItem(key);if(existing?.startsWith("sent:"))return;eventId=(existing??eventId) as `${string}-${string}-${string}-${string}-${string}`;sessionStorage.setItem(key,eventId);}}catch{}
 const {error}=await createClient().rpc("record_buyer_browse_event",{p_id:eventId,p_name:name,p_items:itemIds});
 if(!error&&key){try{sessionStorage.setItem(key,`sent:${eventId}`);}catch{}}
}
