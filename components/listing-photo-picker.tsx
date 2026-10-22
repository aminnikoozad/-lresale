'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {prepareListingPhoto} from '../lib/prepare-listing-photo';
export function ListingPhotoPicker({file,onChange,fr,disabled=false}:{file:File|null;onChange:(file:File|null)=>void;fr:boolean;disabled?:boolean}){
 const generation=useRef(0);const [processing,setProcessing]=useState(false);
 useEffect(()=>()=>{generation.current++;},[]);
 const id=useId();const preview=useRef<HTMLImageElement>(null);const [error,setError]=useState(''),[over,setOver]=useState(false);
 useEffect(()=>{if(!file||!preview.current)return;const url=URL.createObjectURL(file);preview.current.src=url;return()=>URL.revokeObjectURL(url);},[file]);
 async function choose(candidate:File|undefined){
  if(!candidate||disabled||processing)return;
  const request=++generation.current;setProcessing(true);setError('');onChange(null);
  try{const prepared=await prepareListingPhoto(candidate);if(request===generation.current)onChange(prepared);}
  catch(error){if(request===generation.current){const size=error instanceof Error&&error.message==='source_size';setError(size?(fr?'Cette photo dépasse 25 Mo. Choisissez une photo plus petite.':'This photo exceeds 25 MB. Choose a smaller photo.'):(fr?'Cette photo ne peut pas être préparée. Essayez une autre photo ou une version JPEG.':'This photo could not be prepared. Try another photo or a JPEG version.'));}}
  finally{if(request===generation.current)setProcessing(false);}
 }

 return <div className={`listing-dropzone${over?' is-over':''}`} onDragOver={e=>{e.preventDefault();if(!disabled&&!processing)setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);if(!disabled&&!processing){if(e.dataTransfer.files.length!==1){setError(fr?'Ajoutez une photo à la fois.':'Add one photo at a time.');return;}choose(e.dataTransfer.files[0]);}}}>
  <label htmlFor={id}>{fr?'Déposez une photo ici ou choisissez une photo':'Drop a photo here or choose a photo'}</label>
  <input id={id} type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" disabled={disabled||processing} onChange={e=>{const chosen=e.target.files?.[0];e.target.value='';void choose(chosen);}}/>
  <small>{fr?'Photos automatiquement réduites · maximum de 10 photos par article · JPEG, PNG, WebP, AVIF ou HEIC compatible':'Photos automatically compressed · up to 10 photos per item · JPEG, PNG, WebP, AVIF or supported HEIC'}</small>
  {processing&&<p role="status">{fr?'Préparation de la photo…':'Preparing photo…'}</p>}
  {file&&<div><p>{file.name} · {fr?'Sélection locale, pas encore enregistrée':'Local selection, not yet saved'}</p>
   {/* Object URL only; never sent to a public image optimizer. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img ref={preview} alt={fr?'Aperçu local de la photo choisie':'Local preview of selected photo'} width={180} height={160}/>
   <button type="button" disabled={disabled||processing} onClick={()=>onChange(null)}>{fr?'Retirer la sélection':'Clear selection'}</button></div>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
