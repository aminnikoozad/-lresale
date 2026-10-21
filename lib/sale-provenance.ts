import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaleProvenance } from "@/components/sale-provenance-badge";
export async function loadSaleProvenance(client:SupabaseClient,ids:string[]) {
  const chunks=Array.from({length:Math.ceil(ids.length/500)},(_,i)=>ids.slice(i*500,(i+1)*500));
  const results=await Promise.all(chunks.map(p_items=>client.rpc("catalog_sale_provenance",{p_items})));
  const map=new Map<string,SaleProvenance>();
  for(const result of results) if(!result.error&&Array.isArray(result.data)) for(const row of result.data) map.set(row.item_id,row);
  return map;
}
