"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale } from "./site-language";
import { CustomerPicker, type CustomerOption } from "./customer-picker";
import { ItemConditionFields } from "./item-condition-fields";
import { catalogAttributeOptions } from "@/lib/catalog-attributes";
import { CATALOG_CATEGORIES, subcategoriesFor, type CatalogCategory } from "@/lib/catalog-taxonomy";
import { prepareListingPhoto } from "@/lib/prepare-listing-photo";
import type { VisualEstimate } from "@/lib/pricing/visual";
import { translate } from "@/lib/translations";

type Props = {
  customers: CustomerOption[];
  ownerDefault: string;
  collectionRequestId: string;
  activeCategories: CatalogCategory[];
  action: (form: FormData) => Promise<void>;
};

export function AdminIntakeWizard({customers,ownerDefault,collectionRequestId,activeCategories,action}:Props) {
  const {locale} = useLocale();
  const fr = locale === "fr";
  const t = (en:string,french:string) => fr ? french : en;
  const [step,setStep] = useState(0);
  const [pricing,setPricing] = useState<{id?:string;status:string;result?:VisualEstimate|null;error?:string}>({status:"idle"});
  const [pricingBusy,setPricingBusy] = useState(false);
  const [price,setPrice] = useState("");
  const manualPrice = useRef(false);
  const requestId = useRef<string|null>(null);
  const priceAbort = useRef<AbortController|null>(null);
  const photoRevision = useRef(0);
  const pollCount = useRef(0);
  const [files,setFiles] = useState<File[]>([]);
  const [previews,setPreviews] = useState<string[]>([]);
  const [preparing,setPreparing] = useState(false);
  const [error,setError] = useState("");
  const [pending,startTransition] = useTransition();
  const [category,setCategory] = useState<CatalogCategory>(activeCategories[0] ?? "women");
  const [subcategory,setSubcategory] = useState("");
  const [brandKind,setBrandKind] = useState("unknown");
  const [below,setBelow] = useState("normal");
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const previewUrls = useRef<string[]>([]);
  const mounted = useRef(true);
  const [rejectionPhoto,setRejectionPhoto] = useState<File|null>(null);
  const attributes = catalogAttributeOptions(category);
  const titles = fr
    ? ["Client et photos", "Suggestion de prix", "Article", "Catégorie", "Marque", "Taille", "État et détails", "Vérification"]
    : ["Customer and photos", "Price suggestion", "Item", "Category", "Brand", "Size", "Condition and details", "Review"];
  useEffect(() => {
    mounted.current = true;
    return () => { priceAbort.current?.abort(); mounted.current = false; previewUrls.current.forEach(url=>URL.revokeObjectURL(url)); };
  },[]);
  function replacePhotos(next:File[]) {
    if(next[0] !== files[0]) {
      priceAbort.current?.abort();photoRevision.current++;
      requestId.current=null;pollCount.current=0;setPricing({status:"idle"});setPricingBusy(false);
      if(!manualPrice.current)setPrice("");
    }
    const urls = next.map(file=>URL.createObjectURL(file));
    previewUrls.current.forEach(url=>URL.revokeObjectURL(url));
    previewUrls.current=urls;
    setFiles(next);setPreviews(urls);
  }
  function applyEstimate(result?:VisualEstimate|null) {
    if(result?.suggestedCents && !manualPrice.current)setPrice((result.suggestedCents/100).toFixed(2));
  }
  async function requestPrice() {
    if(!files[0]||pricingBusy)return;
    const revision=photoRevision.current;
    const abort=new AbortController();priceAbort.current=abort;
    requestId.current??=crypto.randomUUID();
    pollCount.current=0;setPricingBusy(true);setPricing(previous=>({...previous,status:"searching",error:undefined}));
    const body=new FormData();body.set("file",files[0]);body.set("request",requestId.current);
    try {
      const response=await fetch("/api/admin/intake/price",{method:"POST",body,signal:abort.signal});
      const data=await response.json();
      if(revision!==photoRevision.current||!mounted.current)return;
      if(!response.ok){setPricing({id:data.id,status:"unavailable",error:data.error});return;}
      setPricing(data);applyEstimate(data.result);
    } catch {
      if(revision===photoRevision.current&&mounted.current&&!abort.signal.aborted)setPricing(previous=>({...previous,status:"unavailable",error:"connection_interrupted"}));
    } finally {if(revision===photoRevision.current&&mounted.current)setPricingBusy(false);}
  }
  useEffect(()=>{
    if(!pricing.id||!["queued","running"].includes(pricing.status)||pollCount.current>=20)return;
    const id=pricing.id;const revision=photoRevision.current;const abort=new AbortController();
    const timer=setTimeout(async()=>{
      pollCount.current++;
      try {
        const response=await fetch(`/api/admin/intake/price?intake=${encodeURIComponent(id)}`,{signal:abort.signal});
        if(!response.ok)return;
        const data=await response.json();
        if(!abort.signal.aborted&&revision===photoRevision.current){setPricing(previous=>previous.id===id?data:previous);if(data.result?.suggestedCents&&!manualPrice.current)setPrice((data.result.suggestedCents/100).toFixed(2));}
      } catch { /* The leased server job remains authoritative if polling stops. */ }
    },3000);
    return ()=>{clearTimeout(timer);abort.abort();};
  },[pricing]);
  function go(next:number) {
    setError("");
    if(next > step && step === 0 && files.length === 0) {
      setError(t("Add at least one item photo.","Ajoutez au moins une photo de l’article.")); return;
    }
    if(next > step && formRef.current) {
      const controls = formRef.current.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>(`[data-intake-step="${step}"] input, [data-intake-step="${step}"] select, [data-intake-step="${step}"] textarea`);
      for(const control of controls) if(!control.reportValidity()) return;
    }
    setStep(next);
    if(next===1&&pricing.status==="idle")void requestPrice();
  }
  async function photos(selected:File[]) {
    setError("");
    if(files.length + selected.length > 8) {setError(t("Add up to 8 photos.","Ajoutez jusqu’à 8 photos.")); return;}
    setPreparing(true);
    try {
      const prepared:File[] = [];
      for(const file of selected) prepared.push(await prepareListingPhoto(file,{maxBytes:350_000}));
      if(mounted.current) replacePhotos([...files,...prepared]);
    } catch {
      setError(t("This photo could not be prepared. Try another clear photo. For unsupported HEIC, use JPEG.","Impossible de préparer cette photo. Essayez une autre photo nette. Si le HEIC n’est pas pris en charge, utilisez le JPEG."));
    } finally {setPreparing(false);}
  }
  return <form ref={formRef} className="admin-item-form intake-wizard" action={form => {
    if(step !== titles.length-1 || inFlight.current || preparing) return;
    const invalid = Array.from(formRef.current?.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>("input,select,textarea") ?? []).find(control => !control.checkValidity());
    if(invalid) {setStep(Number(invalid.closest<HTMLElement>("[data-intake-step]")?.dataset.intakeStep ?? 0));setError(t("Complete this step before saving.","Complétez cette étape avant d’enregistrer."));return;}
    if(!files.length) {setStep(0);return;}
    form.delete("rejection_photo");if(rejectionPhoto) form.set("rejection_photo",rejectionPhoto);
    form.delete("photos");for(const file of files) form.append("photos",file);
    inFlight.current=true;
    startTransition(async()=>{try {await action(form);} finally {inFlight.current=false;}});
  }} noValidate>
    <input type="hidden" name="visual_intake_id" value={pricing.id??""}/>
    {collectionRequestId ? <input type="hidden" name="collection_request_id" value={collectionRequestId}/> : null}
    <div className="intake-progress" aria-live="polite"><span>{step+1} / {titles.length}</span><h3>{titles[step]}</h3><progress value={step+1} max={titles.length} aria-label={t("Item intake progress","Progression de l’ajout")}/></div>
    <section data-intake-step="0" hidden={step!==0}>
      <CustomerPicker customers={customers} initial={ownerDefault} customerIdFirst/>
      <label className="photo-field">{t("Start with the item photos","Commencez par les photos de l’article")}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" multiple disabled={preparing||pending} onChange={event=>{void photos(Array.from(event.target.files??[]));event.target.value="";}}/>
        <span>{t("Choose photos or take a photo on your phone. We reduce their size automatically. Up to 8 photos.","Choisissez des photos ou prenez-en une avec votre téléphone. Leur taille est réduite automatiquement. Jusqu’à 8 photos.")}</span>
      </label>
      <p>{t("For a price suggestion, the first photo is shared with SerpApi / Google for visual search.","Pour une suggestion de prix, la première photo est transmise à SerpApi / Google pour une recherche visuelle.")}</p>
      {preparing ? <p role="status">{t("Preparing photos…","Préparation des photos…")}</p> : null}
      <div className="intake-photo-preview">{previews.map((url,index)=><figure key={url}>
        {/* Local object URLs are never sent to the Next image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={t(`Item photo ${index+1}`,`Photo de l’article ${index+1}`)} width={120} height={120}/>
        <button type="button" onClick={()=>replacePhotos(files.filter((_,i)=>i!==index))} disabled={pending||preparing}>{t("Remove","Retirer")}</button>
      </figure>)}</div>
    </section>
    <section data-intake-step="1" hidden={step!==1}>
      {pricingBusy || ["queued","running","searching"].includes(pricing.status) ? <p role="status">{t("Searching for similar items… You can continue with the details while the search runs.","Recherche d’articles similaires… Vous pouvez poursuivre les détails pendant la recherche.")}</p> : null}
      {pricing.status==="completed" && pricing.result ? <>
        <p className="intake-pricing-status"><strong>{pricing.result.suggestedCents===null?t("No reliable price found","Aucun prix fiable trouvé"):new Intl.NumberFormat(fr?"fr-CA":"en-CA",{style:"currency",currency:"CAD"}).format(pricing.result.suggestedCents/100)}</strong></p>
        {pricing.result.lowCents!==null&&pricing.result.highCents!==null?<p>{t("Approximate range (CAD)","Fourchette approximative (CAD)")}: {(pricing.result.lowCents/100).toFixed(2)} – {(pricing.result.highCents/100).toFixed(2)}</p>:null}
        <p>{t("Low confidence: these are asking prices for visually similar items. Review the item before approving its final price.","Faible confiance : il s’agit de prix demandés pour des articles visuellement similaires. Vérifiez l’article avant d’approuver son prix final.")}</p>
        <details><summary>{t("See similar items and sources","Voir les articles similaires et les sources")}</summary><ul>{pricing.result.matches.map(match=><li key={match.url}><a href={match.url} target="_blank" rel="noreferrer">{match.title}</a>{match.cadCents!==null?` · ${(match.cadCents/100).toFixed(2)} CAD`:""}</li>)}</ul></details>
      </> : null}
      {["unavailable","failed"].includes(pricing.status)?<p className="intake-pricing-status" role="status">{pricing.error==="admin_session_required"?t("Sign in as admin and complete MFA, then retry.","Connectez-vous comme admin et confirmez l’authentification multifacteur, puis réessayez."):pricing.error==="visual_pricing_unavailable"?t("Photo pricing is not enabled or its server connection is missing. You can continue manually.","La tarification par photo n’est pas activée ou sa connexion serveur manque. Vous pouvez poursuivre manuellement."):t("No suggestion is available yet. Check the status before retrying, or continue manually.","Aucune suggestion n’est disponible pour le moment. Vérifiez le statut avant de réessayer ou poursuivez manuellement.")}</p>:null}
      <button type="button" disabled={pricingBusy||preparing} onClick={()=>void requestPrice()}>{t("Retry price search","Réessayer la recherche de prix")}</button>
    </section>
    <section data-intake-step="2" hidden={step!==2}>
      <label>{t("Item name","Nom de l’article")}<input name="name" minLength={2} maxLength={160} required placeholder={t("e.g. wool coat","p. ex. manteau en laine")}/></label>
    </section>
    <section data-intake-step="3" hidden={step!==3}>
      <label>{t("Category","Catégorie")}<select name="category" value={category} onChange={event=>{setCategory(event.target.value as CatalogCategory);setSubcategory("");}}>{CATALOG_CATEGORIES.filter(entry=>activeCategories.includes(entry.value)).map(entry=><option key={entry.value} value={entry.value}>{translate(locale,entry.label)}</option>)}</select></label>
      <label>{t("Subcategory","Sous-catégorie")}<select name="subcategory" value={subcategory} onChange={event=>{setSubcategory(event.target.value);if(event.target.value)setStep(4);}} required><option value="">{t("Choose","Choisir")}</option>{subcategoriesFor(category).map(value=><option key={value} value={value}>{translate(locale,value)}</option>)}</select></label>
    </section>
    <section data-intake-step="4" hidden={step!==4}>
      <label>{t("Brand","Marque")}<select value={brandKind} onChange={event=>{setBrandKind(event.target.value);if(event.target.value!=="other")setStep(5);}}><option value="unknown">{t("Unknown","Inconnue")}</option><option value="Unbranded">{t("Unbranded","Sans marque")}</option>{attributes.brands.filter(value=>value!=="Unbranded").map(value=><option key={value} value={value}>{value}</option>)}<option value="other">{t("Other brand","Autre marque")}</option></select></label>
      {brandKind === "other" ? <label>{t("Brand name","Nom de la marque")}<input name="brand" maxLength={100} required/></label> : <input type="hidden" name="brand" value={brandKind==="unknown"?"":brandKind}/>}
    </section>
    <section data-intake-step="5" hidden={step!==5}>
      <label>{t("Size","Taille")}<select key={category} name="size" defaultValue="" onChange={()=>setStep(6)}><option value="">{t("Unknown","Inconnue")}</option>{attributes.sizes.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
    </section>
    <section data-intake-step="6" hidden={step!==6}>
      {["women","men","kids"].includes(category) ? <ItemConditionFields fr={fr}/> : <label>{t("Condition","État")}<select name="item_condition" defaultValue=""><option value="">{t("Unknown","Inconnu")}</option>{attributes.conditions.map(value=><option key={value} value={value}>{translate(locale,value)}</option>)}</select></label>}
      <details><summary>{t("Colour, material and pattern (optional)","Couleur, matière et motif (facultatifs)")}</summary>{[{name:"color",en:"Colour",fr:"Couleur",values:attributes.colors},{name:"material",en:"Material",fr:"Matière",values:attributes.materials},{name:"pattern",en:"Pattern",fr:"Motif",values:attributes.patterns}].map(field=><label key={field.name}>{t(field.en,field.fr)}<select name={field.name} defaultValue=""><option value="">{t("Unknown","Inconnu")}</option>{field.values.map(value=><option key={value} value={value}>{translate(locale,value)}</option>)}</select></label>)}</details>
    </section>
    <section data-intake-step="7" hidden={step!==7}>
      <p>{t("Review the photos and details using Back. Saving creates the item; it does not publish it or confirm a physical inspection.","Vérifiez les photos et les détails avec Retour. L’enregistrement crée l’article; il ne le publie pas et ne confirme pas une inspection physique.")}</p>
      <label>{t("Provisional price (CAD)","Prix provisoire (CAD)")}<input name="initial_price" type="number" min="0.01" step="0.01" required value={price} onChange={event=>{manualPrice.current=true;setPrice(event.target.value);}}/></label>
      <label>{t("Decision if below minimum","Décision sous le minimum")}<select name="below_minimum_action" value={below} onChange={event=>setBelow(event.target.value)}><option value="normal">{t("Individual listing","Vente individuelle")}</option><option value="bundle_candidate">{t("Bundle candidate","À regrouper")}</option><option value="reject">{t("Reject","Refuser")}</option><option value="manual_review">{t("Manual review","Examen manuel")}</option><option value="override">{t("Owner/admin override","Dérogation propriétaire/admin")}</option></select></label>
      <label>{t("Internal note","Note interne")}<textarea name="reason" maxLength={500} rows={3} required={below==="override"||below==="manual_review"}/></label>
      {below==="reject" ? <><label>{t("Reason sent to the seller","Motif transmis au vendeur")}<textarea name="seller_rejection_reason" required minLength={3} maxLength={500}/></label><label>{t("Evidence photo","Photo du défaut")}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" required={!rejectionPhoto} onChange={async event=>{const file=event.target.files?.[0];setRejectionPhoto(null);if(!file)return;setPreparing(true);try{setRejectionPhoto(await prepareListingPhoto(file,{maxBytes:350_000}));}catch{setError(t("Try another evidence photo.","Essayez une autre photo du défaut."));}finally{setPreparing(false);}}}/></label></> : null}
    </section>
    {error ? <p className="admin-items-message error" role="alert">{error}</p> : null}
    <div className="intake-buttons">
      {step>0 ? <button type="button" disabled={pending||preparing} onClick={()=>go(step-1)}>{t("Back","Retour")}</button> : null}
      {step<titles.length-1 ? <button className="primary-action" type="button" disabled={pending||preparing} onClick={()=>go(step+1)}>{t("Continue","Continuer")}</button> : <button className="primary-action" type="submit" disabled={pending||preparing||pricingBusy}>{pending?t("Saving…","Enregistrement…"):pricingBusy?t("Waiting for price search…","Recherche de prix en cours…"):t("Save customer item","Enregistrer l’article du client")}</button>}
    </div>
  </form>;
}
