"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { postalCode, postalMessage, validPostal, type PostalQuote } from "@/lib/postal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "./postal.css";
export type PostalSelection = { quoteId: string; serviceCode: string; totalCents: number; postalCode: string; expiresAt: string };
const money = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n/100);
export function PostalEstimator({ itemIds, destination, onSelect }: { itemIds: string[]; destination?: string; onSelect?: (selection: PostalSelection | null) => void }) {
  const [entered,setEntered]=useState("");
  const postal=postalCode(destination??entered);
  const cartKey=[...itemIds].sort().join(",");
  return <section className="postal-estimator" aria-label="Postal shipping calculator"><h3>Postal delivery · Canada</h3><p>Sending outside Montréal? Calculate Canada Post rates from the packed items and destination. Eligible local delivery is reviewed separately.</p>
    {destination===undefined?<label>Destination postal code<Input value={entered} onChange={e=>setEntered(e.target.value)} autoComplete="postal-code" maxLength={7} placeholder="K1A 0B1"/></label>:null}
    <QuotePanel key={`${postal}:${cartKey}`} itemIds={itemIds} postal={postal} onSelect={onSelect}/>
  </section>;
}
function QuotePanel({itemIds,postal,onSelect}:{itemIds:string[];postal:string;onSelect?: (selection:PostalSelection|null)=>void}) {
  const [quote,setQuote]=useState<PostalQuote|null>(null);
  const [selected,setSelected]=useState("");
  const [loading,setLoading]=useState(false);
  const sequence=useRef(0);
  const notify=useRef(onSelect);
  useEffect(()=>{notify.current=onSelect;},[onSelect]);
  useEffect(()=>()=>{sequence.current++;notify.current?.(null);},[]);
  useEffect(()=>{
    if (!quote?.expiresAt) return;
    const timer=setTimeout(()=>{setQuote({status:"expired"});setSelected("");notify.current?.(null);},Math.max(0,Date.parse(quote.expiresAt)-Date.now()));
    return ()=>clearTimeout(timer);
  },[quote]);
  async function calculate() {
    const current=++sequence.current; setSelected("");notify.current?.(null);
    if(!validPostal(postal)){setQuote({status:"invalid_postal"});return;}
    setLoading(true);setQuote(null);
    try {
      const response=await fetch("/api/postal/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemIds,postalCode:postal})});
      const result=await response.json();
      if(current===sequence.current)setQuote(result);
    } catch {if(current===sequence.current)setQuote({status:"unavailable"});}
    finally {if(current===sequence.current)setLoading(false);}
  }
  return <div>
    <Button type="button" variant="outline" onClick={calculate} disabled={loading||!itemIds.length}>{loading?"Getting postal rates…":"Calculate Canada Post shipping"}</Button>
    {quote?.status==="ok"?<div role="status"><p>{quote.packageCount} separately packed parcel(s). Rates include carrier surcharges and shipping taxes.</p>
      <div className="postal-options">{quote.rates?.map(rate=><label key={rate.serviceCode}>{onSelect?<input type="radio" name="postal_service" value={rate.serviceCode} checked={selected===rate.serviceCode} onChange={()=>{setSelected(rate.serviceCode);onSelect({quoteId:quote.quoteId!,serviceCode:rate.serviceCode,totalCents:rate.totalCents,postalCode:quote.postalCode!,expiresAt:quote.expiresAt!});}}/>:null}<span><b>{rate.serviceName}</b><small>{rate.transitDays!==null?`Estimated ${rate.transitDays} business days after mailing` : "Delivery timing confirmed by carrier"}</small></span><strong>{money(rate.totalCents)}</strong></label>)}</div>
      <small>Quote valid for 10 minutes. Packing or destination changes require a new quote. No postage is purchased here.</small></div>:quote?<p role="status">{postalMessage(quote.status)} {quote.status==="login_required"?<Link href="/login">Sign in</Link>:null}</p>:null}
  </div>;
}
