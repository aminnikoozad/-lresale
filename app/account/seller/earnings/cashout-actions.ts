"use server";
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
const route='/account/seller/earnings';
export async function requestCashout(data:FormData){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');
 const id=String(data.get('request_id')??'');if(!/^[a-f0-9-]{36}$/i.test(id)||data.get('accept')!=='yes')redirect(route+'?cashout_error=Review+and+accept+the+withdrawal+breakdown');
 const n=(key:string)=>{const v=Number(data.get(key));return Number.isSafeInteger(v)?v:-1;};
 const {error}=await db.rpc('request_managed_cashout',{p_id:id,p_gross:n('gross'),p_commission:n('commission'),p_fees:n('fees'),p_net:n('net')});
 if(error)redirect(route+'?cashout_error='+encodeURIComponent(error.message));
 redirect(route+'?cashout_requested=1');
}
export async function cancelCashout(data:FormData){
 const db=await createClient();const {error}=await db.rpc('cancel_managed_cashout',{p_id:String(data.get('request_id')??'')});
 if(error)redirect(route+'?cashout_error='+encodeURIComponent(error.message));redirect(route);
}
