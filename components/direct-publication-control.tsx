"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function DirectPublicationControl({id,version,visible,approved,fr}:{id:string;version:number;visible:boolean;approved:boolean;fr:boolean}) {
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const router=useRouter();const t=(en:string,french:string)=>fr?french:en;
 return <section className="trade-card"><h3>{visible?t("Public listing","Annonce publique"):t("Publish after review","Publier après révision")}</h3>
 {visible?<p><Link href={`/item/${id}`}>{t("View my public listing →","Voir mon annonce publique →")}</Link></p>:<p>{t("After approval, you can make this version visible in the shop. Editing or archiving it removes it from public view until reviewed again. Paid checkout and payouts are not open yet.","Après approbation, vous pouvez afficher cette version dans la boutique. Toute modification ou tout archivage la retire de la vue publique jusqu’à une nouvelle révision. Les achats et versements ne sont pas encore ouverts.")}</p>}
 {!visible&&approved&&<label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t("Show this listing, price and photos publicly. I have removed private information from the text and images.","Afficher publiquement cette annonce, son prix et ses photos. J’ai retiré les renseignements privés du texte et des images.")}</label>}
 <button type="button" className="hybrid-button" disabled={busy||(!visible&&(!approved||!consent))} onClick={async()=>{setBusy(true);setError(false);try{const r=await fetch('/api/marketplace/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'set_direct_listing_publication',args:{p_item:id,p_version:version,p_publish:!visible,p_consent:consent}})});if(!r.ok)throw new Error();router.refresh();}catch{setError(true);}finally{setBusy(false);}}}>{visible?t("Hide my listing","Masquer mon annonce"):t("Publish my listing","Publier mon annonce")}</button>
 {!approved&&!visible&&<p>{t("Submit your listing for review first. An active Montréal seller profile is required.","Envoyez d’abord l’annonce pour révision. Un profil vendeur actif à Montréal est requis.")}</p>}
 {error&&<p role="alert">{t("Could not update publication. Check your seller profile and refresh if the listing or review changed.","Publication impossible. Vérifiez votre profil vendeur et actualisez si l’annonce ou la révision a changé.")}</p>}</section>;
}
