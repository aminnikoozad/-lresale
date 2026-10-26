"use client";
export function PrintStatement({fr}:{fr:boolean}){return <button className="statement-print" type="button" onClick={()=>window.print()}>{fr?"Imprimer / Enregistrer en PDF":"Print / Save as PDF"}</button>;}
