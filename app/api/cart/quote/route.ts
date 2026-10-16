import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 4096) return new Response(null,{status:413});
  let ids: string[];
  try { const body = await request.json(); if (!Array.isArray(body.items) || body.items.length > 25 || body.items.some((id:unknown) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) throw new Error(); ids = [...new Set(body.items)] as string[]; }
  catch { return NextResponse.json({error:"invalid_cart"},{status:400}); }
  const db = createPublicClient();
  const results = await Promise.all(ids.map(target_item_id=>db.rpc("catalog_item_detail_v3",{target_item_id}))); 
  if(results.some(r=>r.error)) return NextResponse.json({error:"catalog_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
  const items = results.flatMap(r=>r.data??[]).map((p:{item_id:string;name:string;brand:string;price_cents:number;photo_urls:string[];size:string|null;item_condition:string|null;category:string})=>({id:p.item_id,name:p.name,brand:p.brand,priceCents:p.price_cents,photoUrl:p.photo_urls[0],size:p.size,condition:p.item_condition,category:p.category}));
  return NextResponse.json({items,unavailable:ids.filter(id=>!items.some((p:{id:string})=>p.id===id)),checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}
