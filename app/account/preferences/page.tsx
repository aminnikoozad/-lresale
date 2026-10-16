import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {BuyerPreferences} from "@/components/buyer-preferences";
export default async function Preferences(){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=%2Faccount%2Fpreferences");const {data,error}=await db.from("buyer_consents").select("email_marketing,analytics").eq("buyer_id",user.id).maybeSingle();return <BuyerPreferences initial={data??{email_marketing:false,analytics:false}} available={!error}/>;}
