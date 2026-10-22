'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {parseDraftFields,type MarketplaceDraft} from '@/lib/marketplace';
import type {SellerRulesDocument} from '@/lib/marketplace-community-types';
import {DirectDraftEditor} from './direct-draft-editor';
import {ListingPhotoPicker} from './listing-photo-picker';
import {ListingPhotoEvidence} from './listing-photo-evidence';
import {RequestListingReview} from './request-listing-review';
export function ListingComposer({draft,fr,mediaEnabled,document}:{draft?:MarketplaceDraft;fr:boolean;mediaEnabled:boolean;document:SellerRulesDocument|null}){
 const dialog=useRef<HTMLDialogElement>(null),heading=useId(),router=useRouter();const [local,setLocal]=useState<MarketplaceDraft|undefined>(draft),[file,setFile]=useState<File|null>(null),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[uploadId,setUploadId]=useState(''),[open,setOpen]=useState(false);
 useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
 const active= draft&&(!local||draft.listing_version>local.listing_version)?draft:local;
 const request=useRef<{key:string;id:string}|null>(null),flight=useRef(false);
 async function refresh(){const r=await fetch('/api/marketplace/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'my_marketplace_drafts',args:{}})});if(!r.ok)throw new Error('Refresh failed');const data=await r.json();const latest=(data.value as MarketplaceDraft[]).find(d=>d.id===active?.id);if(latest)setLocal(latest);setUploadId(crypto.randomUUID());}
 async function save(form:FormData){if(flight.current)return;flight.current=true;setSaving(true);setMessage('');try{const args={p_item:active?.id??null,p_version:active?.listing_version??0,p_fields:parseDraftFields(form)};const key=JSON.stringify(args);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};const r=await fetch('/api/marketplace/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'marketplace_save_editor',args:{...args,p_request:request.current.id}})});const data=await r.json();if(!r.ok||!data.value)throw new Error('Save rejected');setLocal(data.value);setDirty(false);request.current=null;setMessage(fr?'Brouillon enregistré. Ajoutez les photos et confirmez la déclaration ci-dessous.':'Draft saved. Add photos and confirm the disclosure below.');router.refresh();}catch{setMessage(fr?'Enregistrement impossible. Vérifiez les champs ou actualisez si le brouillon a changé.':'Could not save. Check the fields or refresh if the draft changed.');}finally{flight.current=false;setSaving(false);}}
 return <div className="listing-composer">
 <button type="button" className={`hybrid-button${draft?' hybrid-button-secondary':''}`} onClick={()=>{setUploadId(crypto.randomUUID());setOpen(true);if(active)void refresh().catch(()=>setMessage(fr?'Actualisation indisponible. Vérifiez la connexion.':'Could not refresh. Check your connection.'));}}>{draft?(fr?'Modifier / Photos':'Edit / Photos'):(fr?'+ Ajouter un vêtement':'+ Add clothing')}</button>
 <dialog ref={dialog} className="listing-dialog" aria-labelledby={heading} onClose={()=>{setOpen(false);setDirty(false);if(!draft){setLocal(undefined);setFile(null);setMessage('');request.current=null;}}} onClick={e=>{if(e.target===e.currentTarget&&!saving)dialog.current?.close();}} onCancel={e=>{if(saving)e.preventDefault();}}>
 {open&&<div className="listing-dialog-body"><header className="listing-dialog-header"><h2 id={heading}>{fr?'Votre annonce':'Your listing'}</h2><button type="button" disabled={saving} onClick={()=>dialog.current?.close()} aria-label={fr?'Fermer':'Close'}>×</button></header>
 {!active&&<><ListingPhotoPicker file={file} onChange={setFile} fr={fr}/><p>{fr?'Enregistrez les détails ci-dessous pour joindre cette photo au brouillon.':'Save the details below to attach this photo to the draft.'}</p></>}
 <fieldset onChange={()=>setDirty(true)} disabled={saving} className="listing-editor-fields"><DirectDraftEditor key={`${active?.id??'new'}-${active?.listing_version??0}`} draft={active} fr={fr} action={save} clientSubmit/></fieldset>
 {message&&<p role="status">{message}</p>}{dirty&&<p>{fr?'Enregistrez les modifications avant l’envoi pour révision.':'Save your changes before submitting for review.'}</p>}
 {active&&active.status==='listing_preparation'&&<><ListingPhotoEvidence key={`${active.id}-${active.listing_version}`} draft={active} fr={fr} enabled={mediaEnabled} uploadId={uploadId} initialFile={file} onUploaded={()=>setFile(null)} onSaved={refresh}/><RequestListingReview key={`review-${active.id}-${active.listing_version}`} id={active.id} version={active.listing_version} fr={fr} ready={!saving&&!dirty&&active.evidence_status==='documented'} document={document} status={active.review_status} onSubmitted={refresh}/></>}
 </div>}</dialog>
 </div>;
}
