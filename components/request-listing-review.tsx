'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {SellerRulesDocument} from '@/lib/marketplace-community-types';
import Link from 'next/link';
export function RequestListingReview({id,version,fr,ready,document,status,onSubmitted}:{id:string;version:number;fr:boolean;ready:boolean;document:SellerRulesDocument|null;status?:string|null;onSubmitted?:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[accepted,setAccepted]=useState(false);const flight=useRef(false);const router=useRouter();
 const queued=status==='pending'||status==='approved';
 return <section className="listing-final-step"><h3>{fr?'Dernière étape : envoyer pour révision':'Final step: submit for review'}</h3>
 <p>{fr?'Notre équipe vérifie le contenu avant toute publication. Cette demande ne met pas l’article en vente.':'Our team reviews the content before publication. This submission does not put the item on sale.'}</p>
 {document?<form onSubmit={async e=>{e.preventDefault();if(flight.current||!accepted||!ready||queued)return;flight.current=true;setBusy(true);try{const r=await fetch('/api/marketplace/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'marketplace_submit_listing',args:{p_item:id,p_version:version,p_policy_version:document.version,p_locale:fr?'fr-CA':'en-CA',p_accept:accepted}})});setMessage(r.ok?(fr?'Envoyée à l’équipe. L’annonce reste privée.':'Sent to our team. Your listing remains private.'):(fr?'Vérifiez votre boutique, le prix, les photos, les défauts et les conditions acceptées.':'Check your shop details, price, photos, flaws and accepted terms.'));if(r.ok){setAccepted(false);await onSubmitted?.();router.refresh();}}catch{setMessage(fr?'Connexion interrompue. Vérifiez le statut avant de réessayer.':'Connection interrupted. Check the status before retrying.');}finally{flight.current=false;setBusy(false);}}}>
 <label className="hybrid-check"><input type="checkbox" required checked={accepted} disabled={busy||queued} onChange={e=>setAccepted(e.target.checked)}/><span>{document.value.reviewOnly?(fr?'J’accepte les règles de vente personnelle pour ce test.':'I accept the personal-selling rules for this test.'):(fr?'J’accepte les règles de vente personnelle pour cette annonce.':'I accept the personal-selling rules for this listing.')} <Link href="/marketplace-rules" target="_blank" rel="noopener noreferrer">{fr?'Lire la politique':'Read policy'}</Link></span></label>
 {!ready&&<p>{fr?'Complétez et confirmez les photos et la déclaration avant de continuer.':'Complete and confirm photos and disclosures before continuing.'}</p>}
 <button type="submit" className="hybrid-button" disabled={busy||!ready||!accepted||queued}>{queued?(status==='pending'?(fr?'En attente de notre équipe':'Waiting for our team'):(fr?'Contenu approuvé · annonce privée':'Content approved · listing private')):(fr?'Envoyer pour révision':'Submit for review')}</button>
 </form>:<p>{fr?'Règles indisponibles. Enregistrez votre brouillon et réessayez plus tard.':'Rules unavailable. Save your draft and try again later.'}</p>}
 {message&&<p role="status">{message}</p>}</section>;
}
