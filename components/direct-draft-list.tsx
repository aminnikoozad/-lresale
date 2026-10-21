import { randomUUID } from "node:crypto";
import type { DraftAction,MarketplaceDraft } from "@/lib/marketplace";
import { DirectDraftEditor } from "./direct-draft-editor";

export function DirectDraftList({drafts,fr,save,manage}:{drafts:MarketplaceDraft[];fr:boolean;save:(form:FormData)=>Promise<void>;manage:(form:FormData)=>Promise<void>}) {
  const t=(en:string,french:string)=>fr?french:en;
  const labels:Record<DraftAction,string>={archive:t("Archive draft","Archiver le brouillon"),restore:t("Restore as private draft","Rétablir le brouillon privé"),copy:t("Copy to a new draft","Copier dans un nouveau brouillon"),sold_elsewhere:t("Mark sold elsewhere","Indiquer vendu ailleurs")};
  return <div className="hybrid-drafts">
    <DirectDraftEditor fr={fr} action={save}/>
    <h2>{t("Your listings","Vos annonces")}</h2>
    {!drafts.length&&<p>{t("No private listings yet.","Aucune annonce privée pour le moment.")}</p>}
    {drafts.map(d=><article key={d.id} className="hybrid-listing" aria-label={d.name}>
      {d.status==="listing_preparation"?<DirectDraftEditor fr={fr} action={save} draft={d}/>:<div className="hybrid-draft-form"><h2>{d.name}</h2><p>{d.marketplace_closure_reason==="sold_elsewhere"?t("Sold elsewhere — no Shikimomo payment or earnings recorded.","Vendu ailleurs — aucun paiement ni revenu enregistré sur Shikimomo."):t("Archived — this item is not for sale.","Archivé — cet article n’est pas en vente.")}</p><span className="hybrid-draft-version">{t("Listing version","Version de l’annonce")} {d.listing_version}</span></div>}
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
