import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isNeonStaging, stagingFinance } from '@/lib/neon-staging';
import { financeFilter, type FinanceRow } from '@/lib/finance-report';
import { FinanceReport } from '@/components/finance-report';
import '@/app/sell/sell.css';
export const dynamic='force-dynamic';
export const metadata={title:'SHIKIMOMO — finance staging',robots:{index:false,follow:false}};
export default async function StagingFinance({searchParams}:{searchParams:Promise<{kind?:string;page?:string}>}) {
 if(!isNeonStaging()) notFound();
 const [params,jar]=await Promise.all([searchParams,cookies()]);const fr=jar.get('shikimomo-language')?.value==='fr';
 const {kind,page}=financeFilter(params.kind,params.page);
 let rows:FinanceRow[]=[];let failed=false;try{rows=await stagingFinance(kind,page);}catch{failed=true;}
 return <main className="hybrid-shell" lang={fr?'fr':'en'} translate="no"><Link href="/staging">Staging</Link><h1>{fr?'Paiements et versements':'Payments & payouts'}</h1><p>{fr?'Données fictives uniquement. Le rôle propriétaire et le niveau MFA sont simulés dans cette base isolée. Aucun virement bancaire n’est effectué ici.':'Synthetic data only. Owner identity and MFA claims are simulated in this isolated database. No bank payout is performed here.'}</p>{failed?<p role="alert">{fr?'Rapport indisponible.':'Report unavailable.'}</p>:<FinanceReport key={`${kind}-${page}`} rows={rows} kind={kind} page={page} basePath="/staging/finance" fr={fr}/>}</main>;
}
