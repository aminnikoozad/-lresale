import { readFileSync } from "node:fs";
import {
  fixture as buyerFixture,
  identity,
  staff,
  seller,
  other,
} from "./buyer-sales-db.ts";
import { DEFAULT_SELLING_RULES } from "../../lib/business-rules.ts";
export const pricingMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20261020182321_ai_pricing_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const team = readFileSync(
  new URL(
    "../../supabase/migrations/20261015175400_team_managed_pricing.sql",
    import.meta.url,
  ),
  "utf8",
);
export const pricingSwitchMigration = readFileSync(new URL("../../supabase/migrations/20261021015521_ai_pricing_admin_switch.sql", import.meta.url), "utf8");
export async function pricingFixture(enableSuggestions = true) {
  const db = await buyerFixture();
  await db.exec(`
 create table public.admin_roles(user_id uuid primary key,role text);insert into public.admin_roles values('${staff}','owner'),('${other}','warehouse');
 create table public.business_setting_versions(id uuid default gen_random_uuid(),setting_key text,version integer,value jsonb,effective_at timestamptz default now(),created_by uuid,reason text,unique(setting_key,version));
 create function public.get_selling_rules() returns jsonb language sql stable as $$select '${JSON.stringify(DEFAULT_SELLING_RULES)}'::jsonb$$;
 create function private.current_commission_resolution(price integer) returns table(rule_version integer,tier jsonb,seller_bps integer,platform_bps integer) language sql stable as $$select 6,t, (t->>'sellerBps')::integer,(t->>'platformBps')::integer from jsonb_array_elements(public.get_selling_rules()->'commissionTiers')t where price>=(t->>'minCents')::integer and (t->>'maxCents' is null or price<=(t->>'maxCents')::integer)$$;
 alter table public.items add column collection_request_id uuid,add column locked_commission_rule_version integer,add column locked_commission_tier jsonb,add column estimated_seller_earnings_cents integer,add column seller_disposition_preference text,add column seller_rejection_reason text,add column seller_rejection_photo_url text;
 create table public.bundles(like public.items including all);alter table public.bundles add column title text;
 create table public.bundle_items(bundle_id uuid,item_id uuid);create table public.collection_requests(id uuid primary key default gen_random_uuid(),user_id uuid);
 create table public.customer_account_updates(customer_id uuid,author_id uuid,body text,customer_visible boolean);
 create table public.item_rule_overrides(item_id uuid,override_type text);
 create table public.item_operations(item_id uuid primary key,item_code text,auto_publish_enabled boolean,auto_publish_at timestamptz,stage text,stage_updated_at timestamptz,review_ready_at timestamptz,review_deadline_at timestamptz,last_chance_at timestamptz,selling_expires_at timestamptz,last_markdown_day integer);
 create table public.item_status_history(item_id uuid,old_status text,new_status text,changed_by uuid,reason text,created_at timestamptz default now());
 create table public.item_operation_events(item_id uuid,event_type text,stage text,details jsonb,created_at timestamptz default now());
 create function public.approve_item_pricing(uuid,integer) returns void language sql as $$select$$;
 create function public.seller_schedule_auto_publish(uuid,integer) returns void language sql as $$select$$;
 alter table public.items enable row level security;
 grant select on public.items to authenticated;
 create policy own_items on public.items for select to authenticated using(owner_id=auth.uid());
 `);
  await db.exec(team);
  await db.exec(`create trigger guard_commission before insert or update on public.items for each row execute function private.guard_item_commission();
 insert into private.team_pricing_mandates(owner_id,terms_version) values('${seller}','2026-10-15-team-v1');`);
  await db.exec(pricingMigration);
  await db.exec(pricingSwitchMigration);
  if (enableSuggestions) {
    await identity(db, staff);
    await db.query("select public.admin_set_pricing_enabled(1,true,'Enable suggestions for isolated regression tests')");
    await db.exec("reset role");
  }
  return db;
}
export async function newItem(
  db: Awaited<ReturnType<typeof pricingFixture>>,
  id: string,
  price = 2000,
) {
  await db.exec("reset role");
  await db.query(
    `insert into public.items(id,owner_id,name,brand,category,item_condition,initial_approved_price_cents,listed_price_cents,status,published_at,first_published_at,seller_pricing_approved_at,locked_seller_commission_bps,locked_platform_commission_bps) values($1,$2,'Test shirt','Brand','women','Good',$3,null,'accepted',null,null,null,null,null)`,
    [id, seller, price],
  );
  await identity(db, staff);
  await db.query(
    "select public.admin_save_clothing_evidence($1,$2::jsonb,'{}','{}')",
    [
      id,
      JSON.stringify(
        ["front", "back", "size_label"].map((role, n) => ({
          role,
          url: [
            "https://example.test/front",
            "https://example.test/back",
            "https://example.test/label",
          ][n],
        })),
      ),
    ],
  );
  await db.exec("reset role");
  await db.query(
    `insert into public.item_operations(item_id,stage,auto_publish_enabled,auto_publish_at)values($1,'seller_review',true,now()-interval '1 day')`,
    [id],
  );
}
