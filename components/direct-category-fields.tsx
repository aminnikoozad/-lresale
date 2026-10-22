"use client";
import { useState } from "react";

type ClothingCategory="women"|"men"|"kids";
export function DirectCategoryFields({initialCategory,initialSubcategory,fr,options}:{initialCategory:string;initialSubcategory:string;fr:boolean;options:Record<ClothingCategory,Array<{value:string;label:string}>>}) {
  const [category,setCategory]=useState<ClothingCategory>(initialCategory in options?initialCategory as ClothingCategory:"women");
  const [subcategory,setSubcategory]=useState(initialSubcategory);
  const t=(en:string,french:string)=>fr?french:en;
  return <div className="hybrid-form-grid">
    <label>{t("Category","Catégorie")}<select name="category" value={category} onChange={event=>{setCategory(event.target.value as ClothingCategory);setSubcategory("");}}><option value="women">{t("Women","Femmes")}</option><option value="men">{t("Men","Hommes")}</option><option value="kids">{t("Kids","Enfants")}</option></select></label>
    <label>{t("Clothing type (optional)","Type de vêtement (facultatif)")}<select name="subcategory" value={subcategory} onChange={event=>setSubcategory(event.target.value)}><option value="">{t("Unknown / choose later","Inconnu / choisir plus tard")}</option>{options[category].map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  </div>;
}
