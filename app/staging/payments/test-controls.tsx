'use client';
import {useState} from 'react';
export function StripeTestControls({fr,enabled,checkoutEnabled}:{fr:boolean;enabled:boolean;checkoutEnabled:boolean}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function open(path:string,body:Record<string,string>){
    if(busy)return;setBusy(true);setMessage('');
    try{
      const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),v=await r.json();
      if(!r.ok||typeof v.url!=='string')throw new Error('unavailable');
      const u=new URL(v.url);if(u.protocol!=='https:'||!['connect.stripe.com','checkout.stripe.com'].includes(u.hostname))throw new Error('unavailable');
      window.location.assign(u.href);
    }catch{setMessage(fr?'Action indisponible. Vérifiez la connexion de test et les prérequis; aucun succès de paiement n’est confirmé.':'Action unavailable. Check the test connection and prerequisites; no payment success has been confirmed.');setBusy(false);}
  }
  return <section>
    {!enabled&&<p role="status">{fr?'Connexion désactivée : les clés Stripe de test et le secret webhook ne sont pas encore configurés pour cet aperçu.':'Connection disabled: Stripe test credentials and webhook secret are not configured for this preview.'}</p>}
    <h2>{fr?'Compte vendeur fictif':'Synthetic seller account'}</h2>
    <p>{fr?'Créez d’abord le profil vendeur dans le compte fictif. Les coordonnées bancaires et documents sont recueillis chez Stripe.':'First complete the seller profile in the synthetic account. Bank and identity details are collected on Stripe.'}</p>
    <button className="hybrid-button" disabled={!enabled||busy} onClick={()=>void open('/api/payments/test-seller',{})}>{fr?'Ouvrir l’inscription Stripe de test':'Open Stripe test onboarding'}</button>
    <h2>{fr?'Commande gérée fictive':'Synthetic managed order'}</h2>
    {enabled&&!checkoutEnabled&&<p role="status">{fr?'Nouveaux paiements désactivés : la réception des webhooks et le traitement en arrière-plan doivent être validés.':'New checkout disabled: webhook delivery and background processing must be verified first.'}</p>}
    <p>{fr?'Utilisez une commande fictive réservée avec montants de livraison et de taxes validés. Aucun article réel ni vente directe.':'Use a reserved synthetic order with confirmed shipping and tax amounts. No real inventory or direct sales.'}</p>
    <form onSubmit={e=>{e.preventDefault();void open('/api/payments/test-session',{order:String(new FormData(e.currentTarget).get('order')??'')});}}>
      <label>{fr?'Référence UUID de commande fictive':'Synthetic order UUID'}<input name="order" required pattern="[0-9a-fA-F-]{36}" maxLength={36} disabled={!checkoutEnabled||busy}/></label>
      <button className="hybrid-button" disabled={!checkoutEnabled||busy}>{fr?'Ouvrir le paiement Stripe de test':'Open Stripe test checkout'}</button>
    </form>
    {message&&<p role="alert">{message}</p>}
  </section>;
}
