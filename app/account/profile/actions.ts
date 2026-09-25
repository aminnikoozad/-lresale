"use server";
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
export async function changeUsername(f:FormData){const s=await createClient();const {error}=await s.rpc('set_my_username',{candidate:String(f.get('username')||'')});revalidatePath('/account');redirect(`/account/profile?message=${encodeURIComponent(error?'Username unavailable or invalid. Please choose another.':'Username saved.')}`);}
