"use server";
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireAdmin} from '@/lib/admin-auth';
const value=(f:FormData,k:string)=>String(f.get(k)||'').trim();
export async function addCustomerUpdate(f:FormData){
 const {supabase}=await requireAdmin();const id=value(f,'customer_id');
 if(!/^[0-9a-f-]{36}$/i.test(id))redirect('/admin/customers');
 const {error}=await supabase.rpc('admin_add_customer_update',{target_customer:id,content:value(f,'body'),visible_to_customer:f.get('visibility')==='customer'});
 revalidatePath('/account/profile');revalidatePath(`/admin/customers/${id}`);
 redirect(`/admin/customers/${id}?message=${encodeURIComponent(error?'Update could not be saved. Check permission and content.':'Update saved.')}`);
}
export async function recordItemSale(f:FormData){
 const {supabase}=await requireAdmin();const id=value(f,'customer_id');
 if(!/^[0-9a-f-]{36}$/i.test(id))redirect('/admin/customers');
 if(f.get('confirmed')!=='yes')redirect(`/admin/customers/${id}?message=Confirm+the+external+sale+first`);
 const price=Number(value(f,'expected_price'));
 const {error}=await supabase.rpc('admin_record_item_sale',{target_item:value(f,'item_id'),expected_price:Number.isSafeInteger(price)?price:null,payment_reference:value(f,'reference')});
 for(const path of ['/account','/admin/items',`/admin/customers/${id}`,'/'])revalidatePath(path);
 redirect(`/admin/customers/${id}?message=${encodeURIComponent(error?error.message:'Sale recorded once. Seller credit is pending settlement; no bank transfer was made.')}`);
}
