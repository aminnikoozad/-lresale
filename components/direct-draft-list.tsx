import { randomUUID } from "node:crypto";
import type { DraftAction,MarketplaceDraft } from "@/lib/marketplace";
import { DirectDraftEditor } from "./direct-draft-editor";
import { translate } from "@/lib/translations";

export function DirectDraftList({drafts,fr,save,manage}:{drafts:MarketplaceDraft[];fr:boolean;save:(form:FormData)=>Promise<void>;manage:(form:FormData)=>Promise<void>}) {
  const t=(en:string,french:string)=>fr?french:en;
  const labels:Record<DraftAction,string>={archive:t("Archive draft","Archiver le brouillon"),restore:t("Restore as private draft","Rétablir le brouillon privé"),copy:t("Copy to a new draft","Copier dans un nouveau brouillon"),sold_elsewhere:t("Mark sold elsewhere","Indiquer vendu ailleurs")};
  return <div className="hybrid-drafts">
    <details className="hybrid-new-listing" name="direct-listing-editor"><summary className="hybrid-button">+ {t("New listing","Nouvelle annonce")}</summary><DirectDraftEditor fr={fr} action={save}/></details>
    <h2 className="hybrid-list-heading">{t("Your listings","Vos annonces")} <span>({drafts.length})</span></h2>
    {!drafts.length&&<p>{t("No private listings yet.","Aucune annonce privée pour le moment.")}</p>}
    {drafts.map(d=><article key={d.id} className="hybrid-listing" aria-label={d.name}>
      <div className="hybrid-listing-summary"><div><span className="hybrid-listing-status">{d.status==="listing_preparation"?t("Private draft","Brouillon privé"):d.marketplace_closure_reason==="sold_elsewhere"?t("Sold elsewhere","Vendu ailleurs"):t("Archived","Archivé")}</span><h3>{d.name}</h3><p>{d.subcategory?translate(fr?"fr":"en",d.subcategory):t("Clothing type not set","Type de vêtement à préciser")}</p></div><strong>{d.listed_price_cents==null?t("No price yet","Prix à préciser"):new Intl.NumberFormat(fr?"fr-CA":"en-CA",{style:"currency",currency:"CAD"}).format(d.listed_price_cents/100)}</strong></div>
      {d.status==="listing_preparation"?<details className="hybrid-edit-listing" name="direct-listing-editor"><summary>{t("Edit draft","Modifier le brouillon")}</summary><DirectDraftEditor fr={fr} action={save} draft={d}/></details>:<p className="hybrid-closure-note">{d.marketplace_closure_reason==="sold_elsewhere"?t("No Shikimomo payment or earnings recorded.","Aucun paiement ni revenu enregistré sur Shikimomo."):t("This item is not for sale.","Cet article n’est pas en vente.")}</p>}
      <details className="hybrid-listing-actions"><summary>{t("Manage this listing","Gérer cette annonce")}</summary>
        <p>{t("Actions use the saved version. Save your edits first. Copies need photos and review before any future publication.","Les actions utilisent la version enregistrée. Enregistrez vos modifications d’abord. Les copies nécessitent des photos et une vérification avant toute publication future.")}</p>
        {(d.status==="listing_preparation"?["archive","sold_elsewhere","copy"]:d.marketplace_closure_reason==="sold_elsewhere"?["copy"]:["restore","copy"]).map(op=>{
          const operation=op as DraftAction;
          return <form action={manage} key={operation}>
            <input type="hidden" name="id" value={d.id}/><input type="hidden" name="version" value={d.listing_version}/><input type="hidden" name="operation" value={operation}/><input type="hidden" name="request" value={randomUUID()}/>
            {(operation==="copy"||operation==="sold_elsewhere")&&<label className="hybrid-action-confirm"><input type="checkbox" name="confirmed" required/>{operation==="copy"?t("This new draft represents another physical item. Photos and transaction history will not be copied.","Ce nouveau brouillon représente un autre article physique. Les photos et l’historique des transactions ne seront pas copiés."):t("I sold this item outside Shikimomo and want to close this listing.","J’ai vendu cet article ailleurs et je veux fermer cette annonce.")}</label>}
            <button type="submit" className="hybrid-button hybrid-button-secondary">{labels[operation]}</button>
          </form>;
        })}
      </details>
    </article>)}
  </div>;
}
