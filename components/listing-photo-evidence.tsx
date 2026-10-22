"use client";
import { useState,useTransition } from "react";
import { ListingPhotoPicker } from "./listing-photo-picker";
import { useRouter } from "next/navigation";
import type { MarketplaceDraft } from "@/lib/marketplace";

export function ListingPhotoEvidence({draft,fr,enabled,uploadId,initialFile=null,onUploaded,onSaved}:{draft:MarketplaceDraft;fr:boolean;enabled:boolean;uploadId:string;initialFile?:File|null;onUploaded?:()=>void;onSaved?:()=>Promise<void>}) {
  const t=(en:string,french:string)=>fr?french:en;
  const router=useRouter();const [busy,setBusy]=useState(false);const [refreshing,startTransition]=useTransition();const [message,setMessage]=useState("");const [role,setRole]=useState("front");
  const [file,setFile]=useState<File|null>(initialFile);
  const pending=busy||refreshing;
  const roles:Record<string,string>={front:t("Main item photo","Photo principale de l’article"),back:t("Back","Dos"),left:t("Left side","Côté gauche"),right:t("Right side","Côté droit"),size_label:t("Brand / size label","Étiquette de marque / taille"),defect:t("Defect close-up","Gros plan du défaut"),detail:t("Additional detail","Détail supplémentaire")};
  async function send(url:string,init:RequestInit) {
    setBusy(true);setMessage("");
    try {const result=await fetch(url,init);const data=await result.json();if(!result.ok){const code=data.error;setMessage(code==="photo_rate_limit"?t("Photo upload limit reached. Try again later.","Limite de téléversement atteinte. Réessayez plus tard."):code==="photo_count_limit"?t("Maximum 20 photos per item. Remove a photo first.","Maximum de 20 photos par article. Retirez une photo d’abord."):code==="media_unavailable"?t("Photo storage is not connected in this preview yet.","Le stockage des photos n’est pas encore connecté à cet aperçu."):code==="photo_heic_unavailable"?t("This HEIC photo cannot be decoded here. Export it as JPEG and try again.","Cette photo HEIC ne peut pas être décodée ici. Exportez-la en JPEG et réessayez."):code==="evidence_incomplete"?t("Check your item photo, label declaration, condition, and a clear photo with text for every defect. Save your description first.","Vérifiez la photo de l’article, l’étiquette, l’état et une photo nette avec texte pour chaque défaut. Enregistrez d’abord votre description."):t("Could not save. Use a clear photo under 3 MB, or refresh if the draft changed.","Enregistrement impossible. Utilisez une photo nette de moins de 3 Mo, ou actualisez si le brouillon a changé."));return;}
      if(url==="/api/marketplace/photos"){setFile(null);onUploaded?.();}await onSaved?.();
      setMessage(t("Saved. Your listing is still private.","Enregistré. Votre annonce reste privée."));startTransition(()=>router.refresh());
    }catch{setMessage(t("Connection interrupted. Refresh before retrying.","Connexion interrompue. Actualisez avant de réessayer."));}finally{setBusy(false);}
  }
  return <section className="hybrid-disclosure-panel" aria-label={t("Photos and defect disclosure","Photos et déclaration des défauts")}>
    <h3>{t("Show the actual item","Montrez l’article réel")}</h3>
    <ul><li>{t("Add a clear photo showing the actual item. Other views are optional; no fixed number of angles is required.","Ajoutez une photo nette montrant l’article réel. Les autres vues sont facultatives; aucun nombre fixe d’angles n’est requis.")}</li><li>{t("Include the brand/size label, or declare that the item has no label.","Ajoutez l’étiquette de marque/taille ou déclarez que l’article n’en a pas.")}</li><li>{t("Disclose all known stains, holes, repairs, missing parts and wear. Add a close-up and a specific explanation for every defect.","Déclarez toutes les taches, trous, réparations, pièces manquantes et marques d’usure connus. Ajoutez un gros plan et une explication précise pour chaque défaut.")}</li><li>{t("Use your own clear photos. No stock/AI substitutes or edits that hide wear. Unknown details must stay unknown.","Utilisez vos propres photos nettes. Aucune photo de catalogue ou générée par IA, ni retouche cachant l’usure. Les détails inconnus doivent rester inconnus.")}</li></ul>
    <p>{draft.evidence_status==="documented"?t("Disclosures recorded for this saved version. Changes require confirmation again.","Déclaration enregistrée pour cette version. Toute modification nécessite une nouvelle confirmation."):t("Photos and disclosure are incomplete for this version.","Les photos et la déclaration sont incomplètes pour cette version.")}</p>
    <div className="hybrid-photo-gallery">{(draft.photo_assets??[]).map(photo=><figure key={photo.id}>
      {/* Authenticated private image endpoint; Next public image optimization must not cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={`${roles[photo.role]??photo.role}${photo.defect?`: ${photo.defect}`:""}`} width={180} height={140}/><figcaption>{roles[photo.role]??photo.role}{photo.defect&&<p>{photo.defect}</p>}</figcaption><button type="button" disabled={pending} onClick={()=>void send(`/api/marketplace/photos/${photo.id}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:draft.listing_version})})}>{t("Remove from draft","Retirer du brouillon")}</button>
    </figure>)}</div>
    {!enabled&&<p className="hybrid-notice">{t("Upload is disabled until private photo storage is connected to this preview.","Le téléversement est désactivé tant que le stockage privé n’est pas connecté à cet aperçu.")}</p>}
    <form onSubmit={event=>{event.preventDefault();if(!file)return;const body=new FormData(event.currentTarget);body.set("file",file);void send("/api/marketplace/photos",{method:"POST",body});}}>
      <input type="hidden" name="item" value={draft.id}/><input type="hidden" name="version" value={draft.listing_version}/><input type="hidden" name="upload_id" value={uploadId}/>
      <label>{t("Photo view","Vue de la photo")}<select name="role" value={role} onChange={event=>setRole(event.target.value)} disabled={!enabled||pending}>{Object.entries(roles).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
      <label>{t("Explain this defect","Expliquez ce défaut")}<input name="defect" minLength={role==="defect"?3:undefined} maxLength={300} required={role==="defect"} disabled={!enabled||pending} placeholder={t("e.g. small stain on the left cuff","p. ex. petite tache sur le poignet gauche")}/></label>
      <ListingPhotoPicker file={file} onChange={setFile} fr={fr} disabled={pending}/>
      <small>{t("Images are decoded, oriented and stripped of location metadata. If HEIC is unsupported, use a JPEG export.","Les images sont décodées, orientées et débarrassées des métadonnées de localisation. Si le HEIC n’est pas pris en charge, exportez en JPEG.")}</small>
      <button className="hybrid-button" type="submit" disabled={!enabled||pending||!file}>{t("Add this photo","Ajouter cette photo")}</button>
    </form>
    <form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void send("/api/marketplace/evidence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:draft.id,version:draft.listing_version,flaws:f.get("flaws"),noLabel:f.get("no_label")==="on",attest:f.get("attest")==="on"})});}}>
      <label>{t("Known defects","Défauts connus")}<select name="flaws" required defaultValue="" disabled={pending}><option value="" disabled>{t("Choose after checking the item","Choisissez après vérification")}</option><option value="no_known_flaws">{t("No known defects after checking","Aucun défaut connu après vérification")}</option><option value="has_flaws">{t("Defects shown and described","Défauts montrés et décrits")}</option></select></label>
      <label className="hybrid-check"><input type="checkbox" name="no_label" disabled={pending}/>{t("This item has no brand/size label.","Cet article n’a pas d’étiquette de marque/taille.")}</label>
      <label className="hybrid-check"><input type="checkbox" name="attest" required disabled={pending}/>{t("These are my photos of this item, and I have disclosed all known defects in text and photos.","Ce sont mes photos de cet article et j’ai déclaré tous les défauts connus par texte et photos.")}</label>
      <button className="hybrid-button hybrid-button-secondary" disabled={pending}>{t("Confirm photos and disclosures","Confirmer les photos et la déclaration")}</button>
    </form>
    <p>{t("Complete records help resolve problems. They do not guarantee payout: verified payment, delivery and dispute checks still apply. This does not publish your item or certify authenticity.","Un dossier complet facilite le règlement des problèmes. Il ne garantit pas le versement : le paiement, la livraison et les différends doivent encore être vérifiés. Cela ne publie pas votre article et ne certifie pas son authenticité.")}</p>
    {message&&<p role="status">{message}</p>}
  </section>;
}
