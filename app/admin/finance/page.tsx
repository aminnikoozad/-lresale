import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { financeFilter, type FinanceRow } from '@/lib/finance-report';
import { FinanceReport } from '@/components/finance-report';
import '@/app/sell/sell.css';
export const dynamic='force-dynamic';
export default async function OwnerFinance({searchParams}:{searchParams:Promise<{kind?:string;page?:string}>}) {
 const {supabase,access}=await requireAdmin();
 if(access.role!=='owner') redirect('/admin');
 if(!access.has_aal2) redirect('/admin/mfa');
 const [params,jar]=await Promise.all([searchParams,cookies()]);
 const {kind,page}=financeFilter(params.kind,params.page);
 const fr=jar.get('shikimomo-language')?.value==='fr';
 const {data,error}=await supabase.rpc('owner_finance_report',{p_kind:kind,p_page:page});
 return <main className="hybrid-shell" lang={fr?'fr':'en'} translate="no"><Link href="/admin">{fr?'Administration':'Admin'}</Link><h1>{fr?'Paiements et versements':'Payments & payouts'}</h1>{error?<p role="alert">{fr?'Rapport indisponible. Aucune opération financière n’a été effectuée.':'Report unavailable. No financial action was performed.'}</p>:<FinanceReport key={`${kind}-${page}`} rows={(data??[]) as FinanceRow[]} kind={kind} page={page} basePath="/admin/finance" fr={fr}/>}</main>;
}
