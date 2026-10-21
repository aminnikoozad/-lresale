import type { MarketplaceDraft } from "@/lib/marketplace";
import { CATALOG_SUBCATEGORIES,CLOTHING_CATEGORIES } from "@/lib/catalog-taxonomy";
import { translate } from "@/lib/translations";
import { DirectCategoryFields } from "./direct-category-fields";

export function DirectDraftEditor({draft,fr,action}:{draft?:MarketplaceDraft;fr:boolean;action:(form:FormData)=>Promise<void>}) {
  const t=(en:string,french:string)=>fr?french:en;
    return <form action={action} className="hybrid-draft-form">
      <input type="hidden" name="id" value={draft?.id ?? ""}/><input type="hidden" name="version" value={draft?.listing_version ?? 0}/>
      <h2>{draft ? t("Edit private draft", "Modifier le brouillon privé") : t("New private draft", "Nouveau brouillon privé")}</h2>
      <label>{t("Title", "Titre")}<input name="name" required minLength={2} maxLength={160} defaultValue={draft?.name}/></label>
      <DirectCategoryFields initialCategory={draft?.category??"women"} initialSubcategory={draft?.subcategory??""} fr={fr} options={Object.fromEntries(CLOTHING_CATEGORIES.map(category=>[category,CATALOG_SUBCATEGORIES[category].map(value=>({value,label:translate(fr?"fr":"en",value)}))])) as Record<typeof CLOTHING_CATEGORIES[number],Array<{value:string;label:string}>>}/>
      <div className="hybrid-form-grid">
        <label>{t("Price (CAD, optional for a draft)", "Prix (CAD, facultatif pour un brouillon)")}<input name="price" inputMode="decimal" defaultValue={draft?.listed_price_cents == null ? "" : (draft.listed_price_cents/100).toFixed(2)} placeholder="40.00"/></label>
        <label>{t("Brand status", "Marque")}<select name="brand_kind" defaultValue={draft?.marketplace_details.brandKind ?? "unknown"}><option value="unknown">{t("Unknown", "Inconnue")}</option><option value="unbranded">{t("Unbranded", "Sans marque")}</option><option value="other">{t("Other brand", "Autre marque")}</option></select></label>
        <label>{t("Other brand name", "Nom de l’autre marque")}<input name="brand" maxLength={100} defaultValue={draft?.marketplace_details.brandKind === "other" ? draft.brand ?? "" : ""}/></label>
      </div>
      <label>{t("Description", "Description")}<textarea name="description" maxLength={2000} defaultValue={draft?.description ?? ""}/></label>
      <label>{t("Flaws and signs of wear", "Défauts et signes d’usure")}<textarea name="condition_notes" maxLength={1000} defaultValue={draft?.condition_notes ?? ""}/></label>
      <details open={Boolean(draft)}><summary>{t("Size, condition and material", "Taille, état et matière")}</summary><div className="hybrid-form-grid">
        {([["size",t("Size (leave blank if unknown)", "Taille (laisser vide si inconnue)"),draft?.size,40], ["size_system",t("Sizing system", "Système de tailles"),draft?.marketplace_details.sizeSystem,40], ["item_condition",t("Condition declared by you", "État déclaré par vous"),draft?.item_condition,80], ["color",t("Colour", "Couleur"),draft?.color,80], ["material",t("Material (if known)", "Matière (si connue)"),draft?.material,100]] as const).map(([name,label,value,max]) => <label key={name}>{label}<input name={name} maxLength={max} defaultValue={value ?? ""}/></label>)}
      </div></details>
      <details><summary>{t("Measurements in centimetres","Mesures en centimètres")}</summary><p>{t("Enter measurements you took yourself. Leave unknown measurements blank.","Entrez les mesures que vous avez prises. Laissez vides les mesures inconnues.")}</p><div className="hybrid-form-grid">
        {([["chest",t("Chest (cm)","Poitrine (cm)")],["waist",t("Waist (cm)","Taille (cm)")],["hip",t("Hip (cm)","Hanches (cm)")],["length",t("Length (cm)","Longueur (cm)")],["sleeve",t("Sleeve (cm)","Manche (cm)")],["inseam",t("Inseam (cm)","Entrejambe (cm)")],["shoulder",t("Shoulder (cm)","Épaules (cm)")]] as const).map(([key,label])=><label key={key}>{label}<input name={`measurement_${key}`} inputMode="decimal" maxLength={6} defaultValue={draft?.marketplace_details.measurements?.[key]??""}/></label>)}
      </div></details>
      <label className="hybrid-check"><input type="checkbox" name="label_absent" defaultChecked={draft?.marketplace_details.labelAbsent}/>{t("The item has no brand or size label", "L’article n’a pas d’étiquette de marque ou de taille")}</label>
      <p>{t("Saving does not publish your item. Photos, shipping setup and seller onboarding will be required before sales open.", "L’enregistrement ne publie pas votre article. Les photos, les paramètres d’expédition et l’inscription vendeur seront nécessaires avant l’ouverture des ventes.")}</p>
      <button className="hybrid-button" type="submit">{t("Save private draft", "Enregistrer le brouillon privé")}</button>
      {draft && <span className="hybrid-draft-version">{t("Listing version", "Version de l’annonce")} {draft.listing_version}</span>}
    </form>;
}
