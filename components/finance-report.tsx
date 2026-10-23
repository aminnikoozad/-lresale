'use client';
import { useState } from 'react';
import Link from 'next/link';
import { financeKinds, type FinanceKind, type FinanceRow } from '@/lib/finance-report';
import './finance-report.css';

const simpleFields = new Set(['buyerName','sellerName','soldBy','status','createdAt','itemName','name','saleMode','subtotalCents','priceCents','shippingCents','taxCents','discountCents','sellerBps','sellerCents','platformGrossCents','reversedAt','creditReversedAt','bankConfirmation']);
const labels: Record<string, [string,string]> = {
 providerRefundId:['Refund reference','Référence du remboursement'],amountCents:['Refund amount','Montant du remboursement'],merchandiseCents:['Merchandise refunded','Articles remboursés'],confirmedAt:['Provider confirmation recorded','Confirmation du fournisseur enregistrée'],sellerReconciliationStatus:['Seller refund reconciliation','Rapprochement du remboursement vendeur'],
 buyerName:['Buyer','Acheteur'],sellerName:['Item owner','Propriétaire de l’article'],soldBy:['Bought from','Acheté auprès de'],
 id:['Record reference','Référence de l’écriture'],
 status:['Status','État'],createdAt:['Recorded at','Enregistré le'],orderId:['Order','Commande'],
 buyerId:['Buyer ID','Identifiant de l’acheteur'],sellerId:['Seller ID','Identifiant du vendeur'],
 provider:['Payment provider','Fournisseur de paiement'],providerPaymentId:['Payment reference','Référence du paiement'],
 currency:['Currency','Devise'],paidAt:['Payment confirmed','Paiement confirmé'],refundedAt:['Refund recorded','Remboursement enregistré'],
 subtotalCents:['Merchandise','Articles'],discountCents:['Platform-funded discount','Rabais financé par la plateforme'],
 shippingCents:['Shipping','Expédition'],taxCents:['Tax','Taxes'],transactionType:['Ledger entry','Écriture comptable'],
 description:['Description','Description'],itemId:['Item ID','Identifiant de l’article'],itemName:['Item','Article'],
 saleMode:['Selling method','Mode de vente'],saleCents:['Commission base','Base de commission'],
 sellerBps:['Locked seller share','Part verrouillée du vendeur'],sellerCents:['Seller earnings','Revenus du vendeur'],
 platformGrossCents:['Gross platform share','Part brute de la plateforme'],platformCouponCents:['Platform-funded coupon','Coupon financé par la plateforme'],
 platformAfterCouponCents:['Platform share after coupon, before costs','Part de la plateforme après coupon, avant coûts'],
 reversedAt:['Credit reversed','Crédit contrepassé'],creditReversedAt:['Credit reversed','Crédit contrepassé'],reversalWalletId:['Reversal entry','Écriture de contrepassation'],
 bankConfirmation:['Bank confirmation','Confirmation bancaire'],name:['Item','Article'],priceCents:['Price','Prix'],
};
export function FinanceReport({rows,kind,page,basePath,fr=false}:{rows:FinanceRow[];kind:FinanceKind;page:number;basePath:string;fr?:boolean}) {
 const [open,setOpen]=useState<string|null>(null);
 const t=(en:string,french:string)=>fr?french:en;
 const money=(v:unknown)=>typeof v==='number'?new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency:'CAD'}).format(v/100):'—';
 const value=(key:string,v:unknown):string=>{
  if(v==null) return '—';
  if(key.endsWith('Cents')) return money(v);
  if(key==='status') {const states:Record<string,[string,string]>={paid:['Paid','Payé'],pending:['Pending review','En attente de vérification'],completed:['Recorded as completed','Comptabilisé comme terminé'],reversed:['Reversed','Contrepassé'],refunded:['Refunded','Remboursé'],unpaid:['Unpaid','Non payé'],failed:['Failed','Échoué'],awaiting_payment:['Awaiting payment','En attente de paiement']};return states[String(v)]?.[fr?1:0]??String(v);}
  if(key==='sellerBps') return `${Number(v)/100}%`;
  if(key.endsWith('At')) return new Date(String(v)).toLocaleString(fr?'fr-CA':'en-CA',{timeZone:'America/Toronto'});
  if(key==='saleMode') return v==='peer_to_peer'?t('Seller sells directly','Vente directe'):t('Managed by SHIKIMOMO','Géré par SHIKIMOMO');
  if(key==='bankConfirmation') return t('Not connected — ledger status is not bank confirmation','Non connecté — l’état comptable ne confirme pas le dépôt bancaire');
  return String(v);
 };
 const details=(row:Record<string,unknown>,technical=false)=><dl className="finance-details">{Object.entries(row).filter(([k,v])=>labels[k] && (technical?!simpleFields.has(k):simpleFields.has(k)) && v!=null).map(([k,v])=><div key={k}><dt>{labels[k][fr?1:0]}</dt><dd>{value(k,v)}</dd></div>)}</dl>;
 const titles={payments:t('Buyer payments','Paiements des acheteurs'),earnings:t('Seller earnings','Revenus des vendeurs'),payouts:t('Payout records','Écritures de versement')};
 return <section className="finance-report">
  <nav aria-label={t('Financial reports','Rapports financiers')}>{financeKinds.map(k=><Link key={k} href={`${basePath}?kind=${k}`} aria-current={k===kind?'page':undefined}>{titles[k]}</Link>)}</nav>
  <h2>{titles[kind]}</h2>
  <p>{t('Select a name to open the details. All amounts are in CAD.','Sélectionnez un nom pour afficher les détails. Tous les montants sont en CAD.')}</p>
  {kind==='payouts'&&<p role="note">{t('These are existing accounting entries. Provider transfers and successful bank deposits are not connected to this report yet.','Ces écritures proviennent du grand livre existant. Les transferts du fournisseur et les dépôts bancaires réussis ne sont pas encore reliés à ce rapport.')}</p>}
  <table><caption className="finance-caption">{titles[kind]}</caption><thead><tr><th scope="col">{t('Name','Nom')}</th><th scope="col">{t('Amount','Montant')}</th></tr></thead>{rows.slice(0,30).map(row=><tbody key={row.id}><tr><td><button type="button" aria-expanded={open===row.id} aria-controls={`finance-${row.id}`} onClick={()=>setOpen(open===row.id?null:row.id)}><span aria-hidden="true">{open===row.id?'−':'+'}</span> {row.name}</button></td><td>{money(row.amountCents)}</td></tr><tr hidden={open!==row.id} id={`finance-${row.id}`}><td colSpan={2}>{details(row)}<details><summary>{t('References & accounting details','Références et détails comptables')}</summary>{details(row,true)}</details>{Array.isArray(row.items)&&row.items.map((item,index)=><section key={`item-${index}`} className="finance-line">{details(item)}<details><summary>{t('Accounting details','Détails comptables')}</summary>{details(item,true)}</details></section>)}{Array.isArray(row.refunds)&&row.refunds.map((refund,index)=><section key={`refund-${index}`} className="finance-line"><h3>{t('Confirmed refund','Remboursement confirmé')}</h3>{details(refund)}{details(refund,true)}</section>)}</td></tr></tbody>)}</table>
  {rows.length===0&&<p role="status">{t('No records in this category.','Aucune écriture dans cette catégorie.')}</p>}
  <nav aria-label={t('Report pages','Pages du rapport')}>{page>1&&<Link href={`${basePath}?kind=${kind}&page=${page-1}`}>{t('Previous','Précédent')}</Link>}<span>{t('Page','Page')} {page}</span>{rows.length>30&&<Link href={`${basePath}?kind=${kind}&page=${page+1}`}>{t('Next','Suivant')}</Link>}</nav>
 </section>;
}
