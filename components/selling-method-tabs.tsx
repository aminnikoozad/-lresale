'use client';
import Link from 'next/link';
import {useLocale} from './site-language';
export function SellingMethodTabs({direct=false}:{direct?:boolean}){
 const fr=useLocale().locale==='fr';
 return <nav className="seller-method-tabs" aria-label={fr?'Méthode de vente':'Selling method'} translate="no">
 <Link href="/account/seller" aria-current={!direct?'page':undefined}>{fr?'Shikimomo s’en occupe':'Let Shikimomo handle it'}</Link>
 <Link href="/account/seller/direct" aria-current={direct?'page':undefined}>{fr?'Je vends moi-même':'Sell it myself'}</Link>
 </nav>;
}
