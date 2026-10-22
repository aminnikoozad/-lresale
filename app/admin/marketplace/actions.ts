'use server';
import {requireAdmin} from '@/lib/admin-auth';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
export async function moderateMarketplace(form:FormData){const {supabase}=await requireAdmin();const kind=String(form.get('kind')??''),id=String(form.get('id')??''),reason=String(form.get('reason')??''),approve=form.get('approve')==='true',version=Number(form.get('version'));
 if(!['report','listing'].includes(kind)||!/^[a-f0-9-]{36}$/i.test(id)||reason.trim().length<10||reason.length>1000||(kind==='listing'&&(!Number.isSafeInteger(version)||version<1)))redirect('/admin/marketplace?error=fields');
 const {error}=await supabase.rpc('admin_marketplace_moderate',{p_kind:kind,p_id:id,p_version:kind==='listing'?version:null,p_approve:approve,p_reason:reason});if(error)redirect('/admin/marketplace?error=action');revalidatePath('/admin/marketplace');redirect('/admin/marketplace?saved=1');}
