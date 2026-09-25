import {createHmac} from 'node:crypto';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {BUILD_ADMIN_RATE_LIMIT_SALT} from '@/lib/generated/admin-rate-limit-salt';
import {createClient} from '@/lib/supabase/server';
// The form limiter supplements Supabase Auth's own limits; it is not a DDoS firewall.
export async function protectAuthForm(form:FormData,path:string){
 const fail=(message:string)=>redirect(`${path}?message=${encodeURIComponent(message)}`);
 const token=String(form.get('captcha_token')||'');
 if(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY&&!token)fail('Complete the anti-bot verification and try again.');
 const h=await headers();const ip=h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()||h.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
 const salt=process.env.ADMIN_RATE_LIMIT_SALT||BUILD_ADMIN_RATE_LIMIT_SALT;
 // IP-only key prevents rotating email addresses from bypassing the form limit.
 const key=createHmac('sha256',salt).update(`public-auth:${ip}`).digest('hex');
 const s=await createClient();const {data,error}=await s.rpc('consume_auth_form_attempt',{p_rate_key:key});
 if(error||data?.allowed!==true)fail('Too many attempts or protection unavailable. Please wait and try again.');
 return token||undefined;
}
