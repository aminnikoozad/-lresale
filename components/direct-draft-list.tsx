import { isNeonStaging } from "@/lib/neon-staging";
import { ListingComposer } from "./listing-composer";
import { communityRpc } from "@/lib/marketplace-community";
import type { SellerRulesDocument } from "@/lib/marketplace-community-types";
import { randomUUID } from "node:crypto";
import type { DraftAction,MarketplaceDraft } from "@/lib/marketplace";
import { translate } from "@/lib/translations";
import { marketplaceMediaEnabled } from "@/lib/marketplace-media";
import { SaleProvenanceBadge } from "./sale-provenance-badge";
import Link from "next/link";
import { DirectPublicationControl } from "./direct-publication-control";
import { createClient } from "@/lib/supabase/server";

export async function DirectDraftList({drafts,fr,manage,page=1}:{drafts:MarketplaceDraft[];fr:boolean;save:(form:FormData)=>Promise<void>;manage:(form:FormData)=>Promise<void>;page?:number}) {
  let document:SellerRulesDocument|null=null;
  try{document=await communityRpc("marketplace_policy_document",{}) as SellerRulesDocument|null;}catch{/* Draft editing remains available while policy retrieval is down. */}
  const t=(en:string,french:string)=>fr?french:en;
  const publications = isNeonStaging()?null:(await (await createClient()).rpc("my_direct_publications")).data as Array<{id:string;visible:boolean}>|null;
  const labels:Record<DraftAction,string>={archive:t("Archive draft","Archiver le brouillon"),restore:t("Restore as private draft","Rétablir le brouillon privé"),copy:t("Copy to a new draft","Copier dans un nouveau brouillon"),sold_elsewhere:t("Mark sold elsewhere","Indiquer vendu ailleurs")};
  const currentPage=Number.isSafeInteger(page)?Math.min(Math.max(1,page),Math.max(1,Math.ceil(drafts.length/12))):1;
  const shown=drafts.slice((currentPage-1)*12,currentPage*12);
  return <div className="hybrid-drafts">
    <ListingComposer fr={fr} mediaEnabled={marketplaceMediaEnabled()} document={document}/>
    <p><Link href={`${isNeonStaging()?"/staging/community":"/account/marketplace"}#seller-rules`}>{t("Seller rules and review process","Règles de vente et procédure de révision")}</Link></p>
    <h2 className="hybrid-list-heading">{t("Your listings","Vos annonces")} <span>({drafts.length})</span></h2>
    {!drafts.length&&<p>{t("No private listings yet.","Aucune annonce privée pour le moment.")}</p>}
    {shown.map(d=><article key={d.id} className="hybrid-listing" aria-label={d.name}>
      <div className="hybrid-listing-summary"><div><span className="hybrid-listing-status">{publications?.find(p=>p.id===d.id)?.visible?t("Published · personal listing","Publié · annonce personnelle"):d.status==="listing_preparation"?(d.review_status==="pending"?t("Waiting for our team","En attente de notre équipe"):d.review_status==="approved"?t("Content approved · private","Contenu approuvé · privé"):d.review_status==="rejected"?t("Changes requested","Modifications demandées"):t("Private draft","Brouillon privé")):d.marketplace_closure_reason==="sold_elsewhere"?t("Sold elsewhere","Vendu ailleurs"):t("Archived","Archivé")}</span><h3>{d.name}</h3><p>{d.subcategory?translate(fr?"fr":"en",d.subcategory):t("Clothing type not set","Type de vêtement à préciser")}</p></div><strong>{d.listed_price_cents==null?t("No price yet","Prix à préciser"):new Intl.NumberFormat(fr?"fr-CA":"en-CA",{style:"currency",currency:"CAD"}).format(d.listed_price_cents/100)}</strong></div>
      <div className="hybrid-closure-note"><SaleProvenanceBadge fr={fr} value={{sale_mode:"peer_to_peer",team_inspected:false,physical_custody:"seller",shipping_responsibility:"seller"}}/></div>
      {!isNeonStaging()&&d.status==="listing_preparation"&&<DirectPublicationControl id={d.id} version={d.listing_version} visible={Boolean(publications?.find(p=>p.id===d.id)?.visible)} approved={d.review_status==="approved"} fr={fr}/>}
      {d.status==="listing_preparation"?<ListingComposer draft={d} fr={fr} mediaEnabled={marketplaceMediaEnabled()} document={document}/>:<p className="hybrid-closure-note">{d.marketplace_closure_reason==="sold_elsewhere"?t("No Shikimomo payment or earnings recorded.","Aucun paiement ni revenu enregistré sur Shikimomo."):t("This item is not for sale.","Cet article n’est pas en vente.")}</p>}
      <details className="hybrid-listing-actions"><summary>{t("Manage this listing","Gérer cette annonce")}</summary>
        <p>{t("Save your changes first. Copied listings need their own photos and a review before going on sale.","Enregistrez vos changements d’abord. Une annonce copiée doit avoir ses propres photos et être vérifiée avant la mise en vente.")}</p>
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
    {drafts.length>12&&<nav className="hybrid-page-nav" aria-label={t("Listing pages","Pages des annonces")}>{currentPage>1?<Link href={`?page=${currentPage-1}`}>{t("Previous","Précédent")}</Link>:<span/>}<span>{currentPage} / {Math.ceil(drafts.length/12)}</span>{currentPage*12<drafts.length?<Link href={`?page=${currentPage+1}`}>{t("Next","Suivant")}</Link>:<span/>}</nav>}
  </div>;
}
