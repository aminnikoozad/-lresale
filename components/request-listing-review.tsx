'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {SellerRulesDocument} from '@/lib/marketplace-community-types';
import {SellerRulesText} from './seller-rules-panel';
export function RequestListingReview({id,version,fr,ready,document,status,onSubmitted}:{id:string;version:number;fr:boolean;ready:boolean;document:SellerRulesDocument|null;status?:string|null;onSubmitted?:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[accepted,setAccepted]=useState(false);const flight=useRef(false);const router=useRouter();
 const queued=status==='pending'||status==='approved';
 return <section className="listing-final-step"><h3>{fr?'Dernière étape : envoyer pour révision':'Final step: submit for review'}</h3>
 <p>{fr?'Notre équipe vérifie le contenu avant toute publication. Cette demande ne met pas l’article en vente.':'Our team reviews the content before publication. This submission does not put the item on sale.'}</p>
 {document?<form onSubmit={async e=>{e.preventDefault();if(flight.current||!accepted||!ready||queued)return;flight.current=true;setBusy(true);try{const r=await fetch('/api/marketplace/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'marketplace_submit_listing',args:{p_item:id,p_version:version,p_policy_version:document.version,p_locale:fr?'fr-CA':'en-CA',p_accept:accepted}})});setMessage(r.ok?(fr?'Envoyée à l’équipe. L’annonce reste privée.':'Sent to our team. Your listing remains private.'):(fr?'Vérifiez la boutique, le prix, les photos, la déclaration et la version des règles.':'Check your shop, price, photos, disclosures and current rules.'));if(r.ok){setAccepted(false);await onSubmitted?.();router.refresh();}}catch{setMessage(fr?'Connexion interrompue. Vérifiez le statut avant de réessayer.':'Connection interrupted. Check the status before retrying.');}finally{flight.current=false;setBusy(false);}}}>
 <details className="listing-policy"><summary>{fr?'Lire les règles et la politique de vente':'Read the seller rules and policy'} · v{document.version}</summary><SellerRulesText document={document} fr={fr}/></details>
 <label className="hybrid-check"><input type="checkbox" required checked={accepted} disabled={busy||queued} onChange={e=>setAccepted(e.target.checked)}/>{document.value.reviewOnly?(fr?'J’ai lu et j’accepte ces règles pour cette annonce en environnement de test.':'I have read and accept these rules for this listing in the test environment.'):(fr?'J’ai lu et j’accepte les règles et la politique de vente pour cette annonce.':'I have read and accept the seller rules and policy for this listing.')}</label>
 {!ready&&<p>{fr?'Complétez et confirmez les photos et la déclaration avant de continuer.':'Complete and confirm photos and disclosures before continuing.'}</p>}
 <button type="submit" className="hybrid-button" disabled={busy||!ready||!accepted||queued}>{queued?(status==='pending'?(fr?'En attente de révision':'Awaiting admin review'):(fr?'Contenu approuvé · annonce privée':'Content approved · listing private')):(fr?'Envoyer pour révision':'Submit for review')}</button>
 </form>:<p>{fr?'Règles indisponibles. Enregistrez votre brouillon et réessayez plus tard.':'Rules unavailable. Save your draft and try again later.'}</p>}
 {message&&<p role="status">{message}</p>}</section>;
}
