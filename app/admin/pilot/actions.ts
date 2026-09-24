'use server';
import {requireAdmin} from '@/lib/admin-auth';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
async function admin(){const ctx=await requireAdmin();if(!ctx.access.can_manage_selling_rules||!ctx.access.has_aal2)redirect('/admin/mfa');return ctx;}
export async function savePilot(form:FormData){
 const {supabase}=await admin();
 const {error}=await supabase.rpc('admin_save_pilot',{p_enabled:form.has('enabled'),p_categories:form.getAll('categories'),p_cap:Number(form.get('cap')),p_days:form.getAll('days').map(Number),p_weeks:Number(form.get('weeks')),p_start:form.get('start')?new Date(String(form.get('start'))+'T12:00:00Z').toISOString():null});
 revalidatePath('/','layout');redirect('/admin/pilot?message='+encodeURIComponent(error?'Settings not saved. Check values and MFA.':'Settings saved. Existing categories and records are preserved.'));
}
export async function logWork(form:FormData){
 const {supabase,user}=await admin();const {error}=await supabase.from('pilot_work_logs').insert({item_id:String(form.get('item')),admin_id:user.id,minutes:Number(form.get('minutes')),cost_cents:Math.round(Number(form.get('cost'))*100),task:String(form.get('task'))});
 revalidatePath('/admin/pilot');redirect('/admin/pilot?message='+encodeURIComponent(error?'Could not save work entry.':'Work entry saved.'));
}
export async function resolveQuestion(form:FormData){const {supabase}=await admin();await supabase.from('product_questions').update({status:'resolved'}).eq('id',String(form.get('id')));revalidatePath('/admin/pilot');}
