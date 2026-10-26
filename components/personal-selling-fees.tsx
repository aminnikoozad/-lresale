import { createPublicClient } from "@/lib/supabase/public";
export async function PersonalSellingFees({fr,summary=false}:{fr:boolean;summary?:boolean}) {
 const {data,error}=await createPublicClient().rpc("personal_selling_fee_policy");
 if(error||!data||!Number.isInteger(data.commissionBps)||!Number.isInteger(data.minimumCommissionCents))return <span>{fr?"Frais temporairement indisponibles":"Fees temporarily unavailable"}</span>;
 const minimum=new Intl.NumberFormat(fr?"fr-CA":"en-CA",{style:"currency",currency:"CAD"}).format(data.minimumCommissionCents/100);
 const percent=new Intl.NumberFormat(fr?"fr-CA":"en-CA",{style:"percent",maximumFractionDigits:2}).format(data.commissionBps/10000);
 const label=fr?`${percent}, minimum ${minimum} par commande d’un même vendeur`:`${percent}, minimum ${minimum} per seller order`;
 if(summary)return <span translate="no">{label}</span>;
 return <section className="hybrid-notice" translate="no" lang={fr?"fr":"en"}><h3>{fr?"Frais de vente personnelle":"Personal-selling fees"}</h3><p><strong>{label}.</strong></p><p>{fr?"Calculés une seule fois sur le sous-total des articles après réduction, hors livraison et taxes. Le minimum remplace une commission inférieure à ce montant; il ne s’ajoute pas aux 15 %. Aucun nouveau calcul de commission au retrait. Les frais du dépôt-vente géré restent distincts.":"Applied once to the item subtotal after discounts, excluding shipping and tax. The minimum replaces a lower commission; it is not added to the 15%. Commission is not recalculated at withdrawal. Managed-selling fees remain separate."}</p></section>;
}
