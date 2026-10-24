import Link from "next/link";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin-auth";
import { visualSearchReady } from "@/lib/pricing/visual-server";
import type { VisualEstimate } from "@/lib/pricing/visual";
import { toggleVisualSearch, reviewVisualPrice, runVisualSearch, requestVisualSearch, setVisualPriceEmail } from "./actions";
import "../items/[id]/pricing/pricing.css";
export const dynamic="force-dynamic";
type Row={id:string;name:string;brand:string|null;sale_mode:string;listed_price_cents:number|null;photo_urls:string[];job_id:string;status:string;result:VisualEstimate|null;current:boolean;fresh:boolean;created_at:string;error_code:string|null;review:{price_cents:number;reviewed_at:string;pricing_approval_id:string|null}|null};
type Queue={enabled:boolean;canManage:boolean;version:number;monthlyUsed:number;monthlyLimit:number;rows:Row[]};
export default async function VisualPricing({searchParams}:{searchParams:Promise<{after?:string;saved?:string;error?:string;item?:string}>}) {
 const {supabase}=await requireAdmin();const query=await searchParams;
 const fr=(await cookies()).get("shikimomo-language")?.value==="fr", t=(en:string,frText:string)=>fr?frText:en;
 const after=query.after&&/^[0-9a-f-]{36}$/i.test(query.after)?query.after:null;
 const {data,error}=await supabase.rpc("admin_visual_pricing_queue",{after_id:after});const q=data as Queue|null;
 const money=(v:number|null|undefined)=>v==null?"—":new Intl.NumberFormat(fr?"fr-CA":"en-CA",{style:"currency",currency:"CAD"}).format(v/100);
 const requestedItem=query.item&&/^[0-9a-f-]{36}$/i.test(query.item)?query.item:null;
 if(q&&requestedItem) {const selected=await supabase.rpc("admin_visual_pricing_item",{target:requestedItem});q.rows=selected.data?[selected.data as Row]:[];}
 const emailResult=q?.canManage?await supabase.rpc("admin_visual_price_email_preferences"):null;
 const email=emailResult?.data as {enabled:boolean;email:string|null;verified:boolean;waiting:number;accepted:number;failed:number}|null;
 const ready=visualSearchReady();
 const statusLabel=(status:string)=>({queued:t("Waiting for search","En attente de recherche"),running:t("Searching","Recherche en cours"),completed:t("Ready for review","À examiner"),failed:t("Search unavailable","Recherche indisponible"),superseded:t("Photo changed","Photo modifiée")} as Record<string,string>)[status]??status;
 const basisLabel=(basis:string)=>basis==="used_asking_prices"?t("Used item asking prices","Prix demandés pour des articles d’occasion"):basis==="mixed_asking_prices"?t("Mixed condition asking prices","Prix demandés pour des états variés"):t("No usable prices","Aucun prix utilisable");
 return <main className="pricing-shell" lang={fr?"fr":"en"} translate="no">
 <nav className="pricing-nav"><Link href="/admin/pricing">{t("Pricing","Tarification")}</Link><Link href={requestedItem?`/admin/visual-pricing?item=${requestedItem}`:"/admin/visual-pricing"}>{t("Refresh","Actualiser")}</Link>{requestedItem&&<Link href="/admin/visual-pricing">{t("All items","Tous les articles")}</Link>}</nav>
 <h1>{t("Photo price review","Révision des prix par photo")}</h1>
 <p>{t("Uploaded item photos automatically enter this queue. Review visual matches and the approximate asking-price estimate before approving a managed price.","Les photos téléversées rejoignent automatiquement cette file. Examinez les articles visuellement similaires et l’estimation approximative des prix demandés avant d’approuver un prix de vente gérée.")}</p>
 {(error||!q)?<p role="alert">{t("Queue unavailable. Confirm the visual-pricing migration, item permissions and MFA.","File indisponible. Vérifiez la migration, vos droits et l’authentification multifacteur.")}</p>:<>
 {query.saved&&<p role="status">{t("Action recorded. Refresh to see new search results.","Action enregistrée. Actualisez pour voir les nouveaux résultats.")}</p>}
 {query.error&&<p role="alert">{t("Action unavailable. Check configuration and refresh; the item or controls may have changed. Managed approval also requires inspection and seller authorization.","Action indisponible. Vérifiez la configuration et actualisez : l’article ou les réglages ont pu changer. L’approbation en vente gérée exige aussi une inspection et l’autorisation du vendeur.")}</p>}
 <section className="pricing-card"><h2>{t("Automatic visual search","Recherche visuelle automatique")}</h2>
 <p><strong>{q.enabled?t("ON","ACTIVÉE"):t("OFF","DÉSACTIVÉE")}</strong> · {q.monthlyUsed} / {q.monthlyLimit} {t("reserved searches in the last 31 days","recherches réservées sur les 31 derniers jours")}</p>
 <p>{t("One image per item revision; uploads are grouped for 90 seconds. At most 40 searches/hour and 200 per 31 days, including failed attempts. Prices remain private until a separate final admin decision.","Une image par révision d’article; les téléversements sont regroupés pendant 90 secondes. Maximum de 40 recherches/heure et 200 sur 31 jours, tentatives échouées comprises. Les estimations restent privées jusqu’à une décision finale distincte de l’administrateur.")}</p>
 {!ready&&<p className="pricing-warning">{t("Connection required: configure the SerpApi key and the matching server database credentials. No external search can run yet.","Connexion requise : configurez la clé SerpApi et les identifiants serveur de la base correspondante. Aucune recherche externe ne peut encore être exécutée.")}</p>}
 {q.canManage&&<><form action={toggleVisualSearch} className="pricing-form"><input type="hidden" name="version" value={q.version}/><input type="hidden" name="enabled" value={String(!q.enabled)}/><label>{t("Reason","Motif")}<textarea name="reason" required minLength={10} maxLength={500}/></label><button disabled={!q.enabled&&!ready}>{q.enabled?t("Pause searches","Suspendre les recherches"):t("Enable searches","Activer les recherches")}</button></form><form action={runVisualSearch}><button disabled={!ready||!q.enabled}>{t("Process next waiting item","Traiter le prochain article en attente")}</button></form></>}
 </section>
 {q.canManage&&<section className="pricing-card"><h2>{t("Email me when a clothing price needs review","M’avertir par courriel lorsqu’un prix de vêtement doit être validé")}</h2>
 {email?<><p>{t("Recipient: your verified admin account email","Destinataire : l’adresse vérifiée de votre compte administrateur")} · <span translate="no">{email.email??"—"}</span></p><p><strong>{email.enabled?t("Email alerts ON","Alertes courriel ACTIVÉES"):t("Email alerts OFF","Alertes courriel DÉSACTIVÉES")}</strong></p><p>{t("One email per completed price estimate, with the suggested CAD price, approximate range and a secure link to the photos and final review. Emails stop if that result changes or is reviewed before sending.","Un courriel par estimation terminée, avec le prix suggéré en CAD, la fourchette approximative et un lien sécurisé vers les photos et la validation finale. L’envoi est annulé si le résultat change ou est validé avant l’envoi.")}</p><form action={setVisualPriceEmail}><input type="hidden" name="enabled" value={String(!email.enabled)}/><button disabled={!email.enabled&&!email.verified}>{email.enabled?t("Stop my email alerts","Arrêter mes alertes courriel"):t("Email my admin account","Avertir mon compte administrateur")}</button></form><p>{t("Waiting","En attente")}: {email.waiting} · {t("Accepted by email provider","Acceptés par le fournisseur de courriel")}: {email.accepted} · {t("Failed","Échecs")}: {email.failed}</p></>:<p role="status">{t("Email settings unavailable. Install the price-review email migration before enabling alerts.","Réglages courriel indisponibles. Installez la migration des alertes avant de les activer.")}</p>}
 </section>}
 <section className="pricing-card"><div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>{t("Item","Article")}</th><th>{t("Estimate (CAD)","Estimation (CAD)")}</th><th>{t("Review","Révision")}</th></tr></thead><tbody>
 {q.rows.map(r=><tr key={r.id} id={`item-${r.id}`}><td><strong>{r.name}</strong><br/>{r.brand}<br/><small>{r.sale_mode==="peer_to_peer"?t("Seller ships","Expédié par le vendeur"):t("Managed sale","Vente gérée")}</small></td><td>{r.current&&r.fresh?money(r.result?.suggestedCents):"—"}<br/><small>{statusLabel(r.status)}{(!r.current||!r.fresh)&&` · ${t("outdated","périmée")}`}</small></td><td><details open={requestedItem===r.id}><summary>{t("Open review","Ouvrir la révision")}{r.review?` · ${t("reviewed","examinée")}`:""}</summary>
 <p><Link href={`/admin/items/${r.id}/pricing`}>{t("Item pricing workspace","Espace de tarification de l’article")}</Link></p>
 {/* Authenticated image endpoint; no public optimization of seller photos. */}
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={`/api/admin/visual-pricing/photo/${r.id}`} alt={r.name} width={180} height={180} style={{objectFit:"contain"}}/>
 {r.result&&<><p>{t("Approximate range","Fourchette approximative")}: {money(r.result.lowCents)} – {money(r.result.highCents)}</p><p>{t("Low confidence: visual similarity is unverified. These are asking prices, not completed sales. Condition, model and authenticity must be checked.","Faible confiance : la similarité visuelle n’est pas vérifiée. Il s’agit de prix demandés, et non de ventes conclues. Vérifiez l’état, le modèle et l’authenticité.")}</p><p>{r.result.pricedCount} {t("priced matches used","comparaisons tarifées retenues")} · {basisLabel(r.result.basis)}{r.result.fxDate&&` · ${t("Exchange rate date","Date du taux de change")}: ${r.result.fxDate}`}</p>
 {r.result.suggestedCents===null&&<p>{t("No reliable price found. Review the matches or set a price manually.","Aucun prix fiable trouvé. Examinez les résultats ou fixez un prix manuellement.")}</p>}
 <ul>{r.result.matches.map(m=><li key={m.url}>
 {m.thumbnail&&/^https:\/\/encrypted-tbn[0-9]\.gstatic\.com\//.test(m.thumbnail)&&
 // eslint-disable-next-line @next/next/no-img-element
 <img src={m.thumbnail} alt="" width={90} height={80} loading="lazy" referrerPolicy="no-referrer" style={{objectFit:"contain"}}/>}
 <a href={m.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{m.title}</a> · {m.source} · {m.originalAmount??"—"} {m.currency??t("unknown currency","devise inconnue")} · {money(m.cadCents)}{m.condition&&` · ${m.condition}`}</li>)}</ul></>}
 {r.review&&<p>{t("Last reviewed price","Dernier prix examiné")}: {money(r.review.price_cents)}</p>}
 {r.status==="completed"&&r.current&&r.fresh&&q.canManage&&!r.review&&<form action={reviewVisualPrice} className="pricing-form"><input type="hidden" name="job" value={r.job_id}/><label>{t("Reviewed price (CAD)","Prix examiné (CAD)")}<input name="price" type="number" min="8" max="1000000" step="0.01" required defaultValue={r.result?.suggestedCents!=null?(r.result.suggestedCents/100).toFixed(2):""}/></label><label>{t("Decision reason","Motif de décision")}<textarea name="reason" required minLength={10} maxLength={500}/></label><label><input type="checkbox" name="reviewed" value="yes" required/>{t("I checked the visual matches and chose this price.","J’ai vérifié les articles similaires et choisi ce prix.")}</label>
 {r.sale_mode==="peer_to_peer"&&<p>{t("This records your review only. The seller keeps control of their price; listing moderation remains separate.","Cette action enregistre uniquement votre révision. Le vendeur conserve le contrôle de son prix; la modération de l’annonce demeure distincte.")}</p>}
 <button>{r.sale_mode==="peer_to_peer"?t("Record price review","Enregistrer la révision du prix"):t("Approve final managed price","Approuver le prix final en vente gérée")}</button></form>}
 </details></td></tr>)}
 </tbody></table></div>{!q.rows.length&&<p>{t("New uploaded photos will appear here automatically.","Les nouvelles photos téléversées apparaîtront ici automatiquement.")}</p>}</section>
 <details className="pricing-card"><summary>{t("Analyze an existing item","Analyser un article existant")}</summary><form action={requestVisualSearch} className="pricing-form"><label>{t("Item ID","Identifiant de l’article")}<input name="item" required/></label><button>{t("Queue item photos","Ajouter les photos à la file")}</button></form></details>
 {!requestedItem&&q.rows.length===25&&<Link href={`/admin/visual-pricing?after=${q.rows.at(-1)!.id}`}>{t("Next 25 items","25 articles suivants")}</Link>}
 </>}
 </main>;
}
