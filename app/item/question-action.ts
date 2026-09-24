'use server';
import {createPublicClient} from '@/lib/supabase/public';
export async function askProductQuestion(_previous:string,form:FormData){
 if(form.get('website'))return 'Your question has been received.';
 const item=String(form.get('item')??'');const email=String(form.get('email')??'').trim();const question=String(form.get('question')??'').trim();
 if(!/^[0-9a-f-]{36}$/i.test(item)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||question.length<10||question.length>2000)return 'Check your email and question (10–2,000 characters).';
 const {error}=await createPublicClient().rpc('submit_product_question',{p_item:item,p_email:email,p_question:question});
 return error?'Your question could not be sent. The item may be unavailable or the request limit reached. Try again later.':'Your question has been received. Our team will reply using the email you provided.';
}
