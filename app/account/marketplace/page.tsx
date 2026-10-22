import {MarketplacePage} from '@/components/marketplace-page';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <MarketplacePage params={await searchParams} stage={false}/>;}
