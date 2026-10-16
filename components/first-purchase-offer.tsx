"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {useLocale} from "./site-language";
type Offer={code:string;percentBps:number;minimumCents:number;capCents:number;discountCents:number;version:number};
export function FirstPurchaseOffer({itemIds,onChange}:{itemIds:string[];onChange:(code:string,cents:number)=>void}) {
 const {locale}=useLocale();const fr=locale==="fr";
 const [offer,setOffer]=useState<Offer|null>(null);const [selected,setSelected]=useState(false);
 const key=itemIds.join(",");
 useEffect(()=>{let active=true;void (async()=>{const db=createClient();const {data,error}=await db.rpc("my_first_purchase_offer",{p_items:key.split(",")});if(active)setOffer(error?null:data);})();return()=>{active=false;};},[key]);
 // Only the validated server quote is displayed; checkout validates the offer again atomically.
 const amount=offer?.discountCents??0;
 const choose=(checked:boolean)=>{setSelected(checked);onChange(checked&&offer?offer.code:"",checked?amount:0);};
 useEffect(()=>{onChange(selected&&offer&&amount>0?offer.code:"",selected?amount:0);},[offer,amount,selected,onChange]);
 if(!offer)return null;
 const cad=(c:number)=>new Intl.NumberFormat(fr?"fr-CA":"en-CA",{style:"currency",currency:"CAD"}).format(c/100);
 return <section className="checkout-field-section"><h2>{fr?"Votre offre de premier achat":"Your first purchase offer"}</h2><p>{fr?`Rabais de ${offer.percentBps/100} %, panier minimal de ${cad(offer.minimumCents)}, maximum de ${cad(offer.capCents)}. Exclusif à ce compte, non cumulable.`:`${offer.percentBps/100}% off, minimum bag ${cad(offer.minimumCents)}, maximum ${cad(offer.capCents)}. For this account only; cannot be combined.`}</p><p translate="no">{offer.code}</p><label><input type="checkbox" checked={selected&&amount>0} disabled={amount<=0} onChange={e=>choose(e.target.checked)} />{fr?`Appliquer ${cad(amount)} de rabais`:`Apply ${cad(amount)} discount`}</label><small>{fr?"Le rabais est réduit au besoin pour garder chaque article à 8 $ CA ou plus. Le code est utilisé seulement après un paiement réussi.":"The discount is reduced if needed to keep each item at $8 CAD or above. The code is used only after successful payment."}</small></section>;
}
