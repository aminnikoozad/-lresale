'use client';
import {useEffect,useId,useRef,useState} from 'react';
export function ListingPhotoPicker({file,onChange,fr,disabled=false}:{file:File|null;onChange:(file:File|null)=>void;fr:boolean;disabled?:boolean}){
 const id=useId();const preview=useRef<HTMLImageElement>(null);const [error,setError]=useState(''),[over,setOver]=useState(false);
 useEffect(()=>{if(!file||!preview.current)return;const url=URL.createObjectURL(file);preview.current.src=url;return()=>URL.revokeObjectURL(url);},[file]);
 function choose(candidate:File|undefined){if(!candidate)return;if(candidate.size>3_000_000||!(/\.(jpe?g|png|webp|avif|hei[cf])$/i.test(candidate.name))){setError(fr?'Choisissez une image compatible de moins de 3 Mo.':'Choose a supported image under 3 MB.');return;}setError('');onChange(candidate);}
 return <div className={`listing-dropzone${over?' is-over':''}`} onDragOver={e=>{e.preventDefault();if(!disabled)setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);if(!disabled){if(e.dataTransfer.files.length!==1){setError(fr?'Ajoutez une photo à la fois.':'Add one photo at a time.');return;}choose(e.dataTransfer.files[0]);}}}>
  <label htmlFor={id}>{fr?'Déposez une photo ici ou choisissez une photo':'Drop a photo here or choose a photo'}</label>
  <input id={id} type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" disabled={disabled} onChange={e=>choose(e.target.files?.[0])}/>
  <small>{fr?'Photo réelle · max. 3 Mo · JPEG, PNG, WebP, AVIF ou HEIC compatible':'Actual item photo · max. 3 MB · JPEG, PNG, WebP, AVIF or supported HEIC'}</small>
  {file&&<div><p>{file.name} · {fr?'Sélection locale, pas encore enregistrée':'Local selection, not yet saved'}</p>
   {/* Object URL only; never sent to a public image optimizer. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img ref={preview} alt={fr?'Aperçu local de la photo choisie':'Local preview of selected photo'} width={180} height={160}/>
   <button type="button" disabled={disabled} onClick={()=>onChange(null)}>{fr?'Retirer la sélection':'Clear selection'}</button></div>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
