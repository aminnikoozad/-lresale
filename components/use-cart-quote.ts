"use client";
import { useEffect, useState } from "react";
import type { CartItem } from "./cart-store";
type Quote = {items:CartItem[];unavailable:string[];checkedAt:string};
export function useCartQuote(ids: string[]) {
 const key=ids.join(",");
 const [result,setResult]=useState<{key:string;quote:Quote|null;error:boolean}>({key:"",quote:null,error:false});
 useEffect(()=>{
  const controller=new AbortController();
  const refresh=async()=>{try {
   const r=await fetch("/api/cart/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:key?key.split(","):[]}),cache:"no-store",signal:controller.signal});
   if(!r.ok)throw new Error();
   const quote=await r.json() as Quote;
   setResult({key,quote,error:false});
  } catch {if(!controller.signal.aborted)setResult({key,quote:null,error:true});}};
  void refresh();const timer=setInterval(()=>void refresh(),30000);
  window.addEventListener("focus",refresh);
  return ()=>{controller.abort();clearInterval(timer);window.removeEventListener("focus",refresh);};
 },[key]);
 return {quote:result.key===key?result.quote:null,error:result.key===key&&result.error,loading:result.key!==key||(!result.quote&&!result.error)};
}
