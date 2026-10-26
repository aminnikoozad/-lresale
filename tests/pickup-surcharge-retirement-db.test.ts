import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {normalizeSellingRules,DEFAULT_SELLING_RULES} from '../lib/business-rules.ts';
const migration=readFileSync(new URL('../supabase/migrations/20261026123124_remove_low_value_pickup_surcharge.sql',import.meta.url),'utf8');

test('pickup never adds a value-based fee, including stale settings, spoofed request fees and launch waivers',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema private;
   create table business_setting_versions(setting_key text,version integer,value jsonb,effective_at timestamptz,reason text);
   create table knowledge_base(title text,status text,approved_answer text);
   create table collection_requests(request_type text,item_count integer,estimated_resale_value_cents integer,pickup_fee_cents integer,pickup_pricing_mode text,priority_pickup boolean,processing_fee_cents integer default 1200);
   create function public.get_selling_rules() returns jsonb language sql as $$select value from business_setting_versions order by version desc limit 1$$;
   create function private.support_money_cents(integer) returns text language sql as $$select '$'||($1/100.0)::numeric(10,2)::text$$;
   create function private.support_number_cents(integer) returns text language sql as $$select ($1/100.0)::numeric(10,2)::text$$;
   create function private.support_quick_reply(p_body text) returns text language plpgsql as $$
   declare q text:=lower(p_body);v_fr boolean:=q like '%frais%';v_rules jsonb:=public.get_selling_rules();v_amount_cents integer:=6000;v_free_threshold integer:=10000;v_min_item integer:=800;
   begin
   if q is not null then
    if v_amount_cents is not null and v_free_threshold>0 then return 'obsolete surcharge';end if;
   end if;
  if v_min_item>0 and q ~ 'never' then return 'unused';end if;
   return null;end;$$;
  `);
  await db.query("insert into business_setting_versions values('selling_rules',1,$1::jsonb,now()-interval '1 day','baseline')",[JSON.stringify({...DEFAULT_SELLING_RULES,pickupRules:{...DEFAULT_SELLING_RULES.pickupRules,lowValuePickupItemFeeCents:500}})]);
  await db.exec(migration);
  await db.exec('create trigger price before insert or update on collection_requests for each row execute function private.apply_collection_pickup_pricing()');
  for(const value of [6000,9999,10000,15000])for(const count of [1,20])for(const processing of [0,1200]){
   const r=await db.query<{pickup_fee_cents:number;processing_fee_cents:number;priority_pickup:boolean}>('insert into collection_requests(request_type,item_count,estimated_resale_value_cents,pickup_fee_cents,processing_fee_cents) values($1,$2,$3,9999,$4) returning *',['pickup',count,value,processing]);
   assert.equal(r.rows[0].pickup_fee_cents,0);assert.equal(r.rows[0].processing_fee_cents,processing);assert.equal(r.rows[0].priority_pickup,value>=10000);
  }
  await assert.rejects(db.exec("insert into collection_requests values('bag',1,5999,500,'paid_flat',false,1200)"),/at least 6000/);
  const old=(await db.query<{value:{pickupRules:{lowValuePickupItemFeeCents:number}}}>("select value from business_setting_versions where version=1")).rows[0];assert.equal(old.value.pickupRules.lowValuePickupItemFeeCents,500);
  await db.query("insert into business_setting_versions values('selling_rules',3,$1::jsonb,now(),'stale client')",[JSON.stringify({...DEFAULT_SELLING_RULES,pickupRules:{...DEFAULT_SELLING_RULES.pickupRules,lowValuePickupItemFeeCents:500}})]);
  const rules=(await db.query<{v:typeof DEFAULT_SELLING_RULES}>('select public.get_selling_rules() v')).rows[0].v;
  assert.equal(rules.pickupRules.lowValuePickupItemFeeCents,0);assert.equal(rules.pickupRules.processingFeeCents,1200);
  const en=(await db.query<{v:string}>("select private.support_quick_reply('pickup fee') v")).rows[0].v;assert.match(en,/12\.00/);assert.doesNotMatch(en,/per item|below.threshold/);
  const fr=(await db.query<{v:string}>("select private.support_quick_reply('frais de collecte') v")).rows[0].v;assert.match(fr,/12\.00/);assert.match(fr,/Aucun supplément/);
 }finally{await db.close();}
});

test('client normalization ignores retired surcharge in stale or malformed rules',()=>{
 for(const fee of [500,9999,null])assert.equal(normalizeSellingRules({...DEFAULT_SELLING_RULES,pickupRules:{...DEFAULT_SELLING_RULES.pickupRules,lowValuePickupItemFeeCents:fee}}).pickupRules.lowValuePickupItemFeeCents,0);
});
