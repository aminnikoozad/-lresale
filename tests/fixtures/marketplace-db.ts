import {readFileSync} from 'node:fs';
import {fixture as buyerFixture} from './buyer-sales-db.ts';
const sql=(name:string)=>readFileSync(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
export async function marketplaceFixture(){
 const db=await buyerFixture();
 await db.exec(`alter table public.items add column collection_request_id uuid,add column pricing_authority text not null default 'seller',add column locked_commission_rule_version integer,add column locked_commission_tier jsonb,add column seller_disposition_preference text;
 alter table public.items alter column id set default gen_random_uuid();
 alter table public.items alter column inspected_at drop default,alter column published_at drop default,alter column seller_pricing_approved_at drop default,alter column locked_seller_commission_bps drop default,alter column locked_platform_commission_bps drop default;
 create table public.item_rule_overrides(item_id uuid,override_type text);
 create table public.business_setting_versions(effective_at timestamptz not null default now(),setting_key text,version integer,value jsonb,reason text,unique(setting_key,version));
 create function public.get_selling_rules() returns jsonb language sql as $$select '{"sellingPeriodDays":90,"minimumIndividualItemValueCents":800}'::jsonb$$;
 create function private.has_team_pricing_mandate(uuid) returns boolean language sql as $$select false$$;
 create function private.current_commission_resolution(integer) returns table(rule_version integer,tier jsonb,seller_bps integer,platform_bps integer) language sql as $$select 1,'{}'::jsonb,6000,4000$$;
 alter table public.items enable row level security;grant select on public.items to authenticated;
 create policy own_items on public.items for select to authenticated using(owner_id=auth.uid());
 `);
 // Execute the real existing commission, inspection, and warehouse-sync functions.
 const team=sql('20261015175400_team_managed_pricing');
 await db.exec(team.slice(team.indexOf('create or replace function private.guard_item_commission()'),team.indexOf('create or replace function private.guard_bundle_commission()')));
 await db.exec('create trigger items_guard_commission before insert or update on public.items for each row execute function private.guard_item_commission()');
 await db.exec(sql('20261002010000_item_inspection_publication_gate'));
 const ops=sql('20260924193000_sellpy_ops_v1');
 await db.exec(ops.slice(ops.indexOf('create sequence'),ops.indexOf('insert into public.item_operations(item_id,stage')));
 await db.exec(sql('20261020184751_hybrid_sale_mode_foundation'));
 await db.exec("alter table public.items alter column photo_urls set default '{}'::text[]");
 const taxonomy=sql('20260921170708_catalog_taxonomy_foundation_v2');
 await db.exec(taxonomy.slice(taxonomy.indexOf('create or replace function public.is_valid_catalog_subcategory'),taxonomy.indexOf('alter table public.collection_requests drop constraint')));
 await db.exec(sql('20261021014818_marketplace_draft_lifecycle'));
 await db.exec(sql('20261021022254_marketplace_seller_photo_evidence'));
 await db.exec(sql('20261021124254_marketplace_policy_acceptance_and_photos'));
 return db;
}
