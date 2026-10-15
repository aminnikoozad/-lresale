import { createPublicClient } from "@/lib/supabase/public";
export type SmartShopSettings = { enabled:boolean; chat_enabled:boolean; voice_enabled:boolean; memory_enabled:boolean; notice_en:string; notice_fr:string };
export const DEFAULT_SMART_SHOP: SmartShopSettings = {enabled:false,chat_enabled:true,voice_enabled:true,memory_enabled:true,notice_en:"Smart Shopping is coming soon.",notice_fr:"L’achat intelligent sera bientôt disponible."};
/** Missing configuration or database errors always disable the assistant. */
export async function loadSmartShopSettings():Promise<SmartShopSettings> {
 try {
  const {data,error}=await createPublicClient().from("smart_shop_settings").select("enabled,chat_enabled,voice_enabled,memory_enabled,notice_en,notice_fr").eq("id",1).single();
  if(error||!data)return DEFAULT_SMART_SHOP;
  return {...DEFAULT_SMART_SHOP,...data};
 } catch {return DEFAULT_SMART_SHOP;}
}
