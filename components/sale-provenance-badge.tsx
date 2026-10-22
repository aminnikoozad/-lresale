export type SaleProvenance={sale_mode:"managed_consignment"|"peer_to_peer";team_inspected:boolean;physical_custody:"team"|"seller";shipping_responsibility:"team"|"seller"};
export function SaleProvenanceBadge({value,fr=false}:{value?:SaleProvenance|null;fr?:boolean}) {
  if(!value) return null;
  const direct=value.sale_mode==="peer_to_peer";
  const t=(en:string,french:string)=>fr?french:en;
  return <span className={`sale-provenance-badge ${direct?"seller":"team"}`} translate="no" lang={fr?"fr":"en"} title={direct?t("Condition declared by the seller. Ships from the seller.","État déclaré par le vendeur. Expédié par le vendeur."):t("Handled and shipped by Shikimomo. Inspection is shown only when recorded.","Géré et expédié par Shikimomo. L’inspection est affichée seulement lorsqu’elle est enregistrée.")}>{direct?t("Seller listed · seller ships","Annonce du vendeur · envoi par le vendeur"):value.team_inspected?t("Inspected by Shikimomo","Inspecté par Shikimomo"):t("Managed by Shikimomo","Géré par Shikimomo")}</span>;
}
