import {notFound} from 'next/navigation';
import {cookies} from 'next/headers';
import Link from 'next/link';
import {isNeonStaging} from '@/lib/neon-staging';
import {stripeTestConfig} from '@/lib/stripe-sandbox';
import {StripeTestControls} from './test-controls';
import '@/app/sell/sell.css';
export const dynamic='force-dynamic';
export const metadata={title:'SHIKIMOMO — payment sandbox',robots:{index:false,follow:false}};
export default async function TestPayments(){
  if(!isNeonStaging())notFound();
  const jar=await cookies(),fr=jar.get('shikimomo-language')?.value==='fr';let enabled=false;
  try{stripeTestConfig(process.env);enabled=true;}catch{}
  return <main className="hybrid-shell" lang={fr?'fr':'en'} translate="no">
    <p className="hybrid-eyebrow">SHIKIMOMO · SANDBOX</p>
    <h1>{fr?'Paiements de test Stripe':'Stripe test payments'}</h1>
    <p className="hybrid-notice">{fr?'Identité fictive sur Neon. Utilisez uniquement les données de test Stripe; aucun paiement réel. Les ventes directes et les versements aux vendeurs restent désactivés.':'Synthetic identity on Neon. Use Stripe test data only; no real payments. Direct sales and seller transfers remain disabled.'}</p>
    <p>{fr?'Le retour depuis Stripe ne confirme ni le paiement ni la vérification du vendeur. Un webhook vérifié et traité est nécessaire.':'Returning from Stripe does not confirm payment or seller verification. A verified, processed webhook is required.'}</p>
    <StripeTestControls fr={fr} enabled={enabled}/>
    <p><Link href="/staging">{fr?'Retour au compte fictif':'Back to synthetic account'}</Link></p>
  </main>;
}
