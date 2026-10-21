begin;

-- Safe rollout: apply in staging first, then deploy the matching application.
-- No historical prices, commission locks, paid orders or Bag rules are rewritten.
create table private.market_comparables (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.items(id),
 source text not null check(length(source) between 2 and 100), url text not null check(url ~ '^https://' and length(url)<=2000),
 price_cents integer not null check(price_cents between 1 and 100000000), currency text not null default 'CAD' check(currency='CAD'),
 observed_at timestamptz not null, price_type text not null check(price_type in ('listed','sold')),
 brand text not null check(length(brand) between 1 and 100), category text not null, model text,
 condition text not null check(length(condition) between 1 and 80), similarity_bps integer not null check(similarity_bps between 0 and 10000),
 evidence text not null check(length(evidence) between 10 and 2000), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 invalidated_at timestamptz, invalidation_reason text,
 unique(item_id,url,price_type,observed_at)
);
create index market_comparables_item on private.market_comparables(item_id,created_at desc);
create table private.pricing_analyses (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.items(id), cache_key text not null,
 input jsonb not null, status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 result jsonb, attempts integer not null default 0, available_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid,
 error_code text, api_cost_micros bigint not null default 0 check(api_cost_micros>=0), api_cost_currency text not null default 'CAD',
 requested_by uuid not null references auth.users(id), created_at timestamptz not null default now(), completed_at timestamptz,
 unique(item_id,cache_key)
);
create index pricing_analysis_jobs on private.pricing_analyses(available_at,created_at) where status in ('queued','running');
create index pricing_analysis_item on private.pricing_analyses(item_id,created_at desc);
create table private.pricing_approvals (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.items(id),
 previous_approval_id uuid references private.pricing_approvals(id), analysis_id uuid references private.pricing_analyses(id),
 item_fingerprint text not null, price_cents integer not null check(price_cents between 800 and 100000000),
 previous_price_cents integer, approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(),
 reason text not null check(length(reason) between 10 and 500), snapshot jsonb not null
);
create index pricing_approval_item on private.pricing_approvals(item_id,approved_at desc);
alter table public.items add column pricing_approval_id uuid references private.pricing_approvals(id);
create table private.pricing_reviews (
 item_id uuid not null references public.items(id), publication_at timestamptz not null, day integer not null,
 created_at timestamptz not null default now(), primary key(item_id,publication_at,day)
);
-- Deny-by-default tables; all operations use narrowly scoped, authenticated RPCs.
alter table private.market_comparables enable row level security;
alter table private.pricing_analyses enable row level security;
alter table private.pricing_approvals enable row level security;
alter table private.pricing_reviews enable row level security;
revoke all on private.market_comparables,private.pricing_analyses,private.pricing_approvals,private.pricing_reviews from public,anon,authenticated,service_role;

insert into public.business_setting_versions(setting_key,version,value,reason)
values('ai_pricing_rules',1,'{"maxAgeDays":null,"minSoldComparables":null,"minSimilarityBps":null,"processingCents":null,"storageCents":null,"paymentFixedCents":null,"paymentBps":null,"minimumProfitCents":null,"reviewDays":[]}', 'Uncalibrated foundation; configure from verified evidence and actual costs');

create function private.pricing_staff() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.can_manage_items() and coalesce(auth.jwt()->>'aal','')='aal2';
$$;
create function private.pricing_admin() returns boolean language sql stable security definer set search_path='' as $$
 select private.pricing_staff() and exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin'));
$$;
create function private.pricing_fingerprint(i public.items) returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_object('owner',i.owner_id,'name',i.name,'brand',i.brand,'category',i.category,'subcategory',i.subcategory,'condition',i.item_condition,'size',i.size,'color',i.color,'material',i.material,'pattern',i.pattern,'notes',i.condition_notes,'photos',i.photo_urls,'inspection',i.inspected_at,'clothingEvidence',(select jsonb_build_object('photos',e.photos,'measurements',e.measurements,'defects',e.disclosed_defects) from public.clothing_listing_evidence e where e.item_id=i.id))::text);
$$;
create function private.pricing_snapshot(i public.items) returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_array(private.pricing_fingerprint(i),i.status,i.initial_approved_price_cents,i.listed_price_cents,i.pricing_approval_id,i.seller_pricing_approved_at)::text);
$$;
create function private.pricing_input(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('item',jsonb_build_object('brand',i.brand,'category',i.category,'item_condition',i.item_condition,'locked_seller_commission_bps',i.locked_seller_commission_bps),
 'snapshot',private.pricing_snapshot(i),'rulesVersion',r.version,'rules',r.value,'sellingRules',public.get_selling_rules(),
 'comparables',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'source',c.source,'url',c.url,'priceCents',c.price_cents,'currency',c.currency,'observedAt',c.observed_at,'priceType',c.price_type,'brand',c.brand,'category',c.category,'model',c.model,'condition',c.condition,'similarityBps',c.similarity_bps,'evidence',c.evidence) order by c.created_at desc,c.id) from private.market_comparables c where c.item_id=i.id and c.invalidated_at is null),'[]'::jsonb))
 from public.items i cross join lateral(select * from public.business_setting_versions where setting_key='ai_pricing_rules' and effective_at<=now() order by version desc limit 1)r where i.id=target;
$$;
create function private.pricing_immutable() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'Pricing decisions are append-only'; end;$$;
create trigger pricing_approval_immutable before update or delete on private.pricing_approvals for each row execute function private.pricing_immutable();
create function private.pricing_analysis_immutable() returns trigger language plpgsql set search_path='' as $$
 begin
 if tg_op='DELETE' or old.status='completed' or (new.input,new.cache_key,new.item_id,new.requested_by,new.created_at) is distinct from (old.input,old.cache_key,old.item_id,old.requested_by,old.created_at) then raise exception 'Analysis evidence is immutable'; end if;
 return new;
 end;$$;
create trigger pricing_analysis_immutable before update or delete on private.pricing_analyses for each row execute function private.pricing_analysis_immutable();

create function public.admin_pricing_workspace(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 return (select jsonb_build_object('item',to_jsonb(i),'snapshot',private.pricing_snapshot(i),'input',private.pricing_input(i.id),'canApprove',private.pricing_admin(),
 'mandate',private.has_team_pricing_mandate(i.owner_id),
 'comparables',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from private.market_comparables c where c.item_id=i.id),'[]'::jsonb),
 'analyses',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select id,status,result,attempts,error_code,api_cost_micros,api_cost_currency,created_at,completed_at from private.pricing_analyses where item_id=i.id order by created_at desc limit 20)a),'[]'::jsonb),
 'approvals',coalesce((select jsonb_agg(to_jsonb(a) order by a.approved_at desc) from (select * from private.pricing_approvals where item_id=i.id order by approved_at desc limit 50)a),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.day) from private.pricing_reviews r where r.item_id=i.id),'[]'::jsonb)) from public.items i where i.id=target);
 end;$$;

create function public.admin_add_market_comparable(target uuid, evidence jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid;
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 perform 1 from public.items where id=target for update;
 if not found then raise exception 'Item not found'; end if;
 if (select count(*) from private.market_comparables where item_id=target and invalidated_at is null)>=500 then raise exception 'Comparable limit reached; invalidate obsolete evidence'; end if;
 if evidence->>'accessBasis' is distinct from 'manual_authorized' or evidence->>'market' is distinct from 'Canada' or evidence->>'currency' is distinct from 'CAD' then raise exception 'Authorized Canadian CAD evidence required'; end if;
 if (evidence->>'observedAt')::timestamptz>now() then raise exception 'Observation cannot be in the future'; end if;
 insert into private.market_comparables(item_id,source,url,price_cents,observed_at,price_type,brand,category,model,condition,similarity_bps,evidence,created_by)
 values(target,evidence->>'source',evidence->>'url',(evidence->>'priceCents')::integer,(evidence->>'observedAt')::timestamptz,evidence->>'priceType',evidence->>'brand',evidence->>'category',evidence->>'model',evidence->>'condition',(evidence->>'similarityBps')::integer,evidence->>'evidence',auth.uid()) returning id into result;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value) values(auth.uid(),'pricing.comparable_added','item',target::text,jsonb_build_object('comparableId',result,'accessBasis','manual_authorized'));
 return result;
 end;$$;
create function public.admin_invalidate_market_comparable(target uuid, reason text) returns void language plpgsql security definer set search_path='' as $$
 declare item uuid;
 begin
 if not private.pricing_staff() or reason is null or length(trim(reason)) not between 10 and 500 then raise exception 'Staff permission and reason required'; end if;
 select item_id into item from private.market_comparables where id=target;
 perform 1 from public.items where id=item for update;
 update private.market_comparables set invalidated_at=now(),invalidation_reason=reason where id=target and invalidated_at is null;
 if not found then raise exception 'Comparable unavailable'; end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,reason) values(auth.uid(),'pricing.comparable_invalidated','comparable',target::text,reason);
 end;$$;
create function public.admin_save_pricing_rules(expected_version integer, rules jsonb, reason text) returns integer language plpgsql security definer set search_path='' as $$
 declare version_now integer; key text; value jsonb; day jsonb;
 begin
 if not private.pricing_admin() or reason is null or length(trim(reason)) not between 10 and 500 then raise exception 'Pricing admin and reason required'; end if;
 perform pg_advisory_xact_lock(hashtext('ai_pricing_rules'));
 select version into version_now from public.business_setting_versions where setting_key='ai_pricing_rules' order by version desc limit 1;
 if expected_version is distinct from version_now then raise exception 'Rules changed; refresh'; end if;
 if jsonb_typeof(rules) is distinct from 'object' or (select count(*) from jsonb_object_keys(rules))<>9 then raise exception 'Invalid rules'; end if;
 foreach key in array array['maxAgeDays','minSoldComparables','minSimilarityBps','processingCents','storageCents','paymentFixedCents','paymentBps','minimumProfitCents'] loop
 value:=rules->key;
 if value is null then raise exception 'Missing rule: %',key; end if;
 if value<>'null'::jsonb then
 if jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::bigint>100000000 then raise exception 'Invalid rule: %',key; end if;
 if key='maxAgeDays' and value::text::integer not between 1 and 730 or key='minSoldComparables' and value::text::integer not between 3 and 100 or key='minSimilarityBps' and value::text::integer not between 1 and 10000 or key='paymentBps' and value::text::integer not between 0 and 10000 then raise exception 'Rule out of range: %',key; end if;
 end if;
 end loop;
 if jsonb_typeof(rules->'reviewDays') is distinct from 'array' or jsonb_array_length(rules->'reviewDays')>12 then raise exception 'Invalid review schedule'; end if;
 for day in select * from jsonb_array_elements(rules->'reviewDays') loop
 if jsonb_typeof(day)<>'number' or day::text !~ '^[0-9]+$' or day::text::integer not between 1 and 365 then raise exception 'Invalid review day'; end if;
 end loop;
 insert into public.business_setting_versions(setting_key,version,value,created_by,reason) values('ai_pricing_rules',version_now+1,rules,auth.uid(),reason);
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'pricing.rules_saved','pricing_rules',(version_now+1)::text,rules,reason);
 return version_now+1;
 end;$$;

create function public.admin_request_pricing_analysis(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare payload jsonb; cache text; result uuid;
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 perform 1 from public.items where id=target for update;
 if not found then raise exception 'Item not found'; end if;
 payload:=private.pricing_input(target)||jsonb_build_object('observedAt',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC');
 -- The key groups requests by UTC day; calculations retain the original observation timestamp.
 cache:=md5(payload::text||coalesce((select string_agg(c->>'id',',' order by c->>'id') from jsonb_array_elements(payload->'comparables')c where (c->>'observedAt')::timestamptz>=now()-make_interval(days=>(payload->'rules'->>'maxAgeDays')::integer)),''));
 select id into result from private.pricing_analyses where item_id=target and cache_key=cache;
 if result is not null then return result; end if;
 if (select count(*) from private.pricing_analyses where item_id=target and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily item analysis limit reached'; end if;
 payload:=jsonb_set(payload,'{observedAt}',to_jsonb(now()));
 insert into private.pricing_analyses(item_id,cache_key,input,requested_by) values(target,cache,payload,auth.uid()) returning id into result;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value) values(auth.uid(),'pricing.analysis_requested','item',target::text,jsonb_build_object('analysisId',result));
 return result;
 end;$$;
create function public.claim_pricing_jobs(batch_size integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
 declare result jsonb;
 begin
 -- No user session or arbitrary service JWT claims can call this; EXECUTE is service_role only.
 update private.pricing_analyses set status='failed',error_code='retry_limit' where status='running' and lease_until<now() and attempts>=3;
 with jobs as(select id from private.pricing_analyses where (status='queued' and available_at<=now() or status='running' and lease_until<now()) and attempts<3 order by created_at for update skip locked limit greatest(1,least(batch_size,20))),
 claimed as(update private.pricing_analyses a set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid() from jobs where a.id=jobs.id returning a.id,a.input,a.lease_token)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
 end;$$;
create function public.finish_pricing_job(target uuid, token uuid, result jsonb, failure_code text default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 if failure_code is null and (jsonb_typeof(result) is distinct from 'object' or result->>'engineVersion' is distinct from 'sold-median-v1' or octet_length(result::text)>1000000) then raise exception 'Invalid engine result'; end if;
 update private.pricing_analyses a set result=case when failure_code is null then finish_pricing_job.result else null end,
 status=case when failure_code is null then 'completed' when a.attempts>=3 then 'failed' else 'queued' end,
 completed_at=case when failure_code is null then now() else null end,error_code=case when failure_code is null then null else 'engine_error' end,
 available_at=now()+interval '1 minute'*power(2,a.attempts),lease_until=null,lease_token=null
 where a.id=target and a.status='running' and a.lease_token=token and a.lease_until>now();
 if not found then raise exception 'Job lease lost'; end if;
 end;$$;

create function private.guard_pricing_approval() returns trigger language plpgsql security definer set search_path='' as $$
 declare changed boolean; canonical_changed boolean; decision private.pricing_approvals%rowtype;
 begin
 if tg_op='INSERT' then
 if new.pricing_approval_id is not null or new.listed_price_cents is not null or new.status in ('listed','relisted') then raise exception 'New items require admin pricing review'; end if;
 return new;
 end if;
 canonical_changed:=private.pricing_fingerprint(new) is distinct from private.pricing_fingerprint(old);
 changed:=(new.listed_price_cents,new.pricing_approval_id) is distinct from (old.listed_price_cents,old.pricing_approval_id) or (old.seller_pricing_approved_at is null and new.seller_pricing_approved_at is not null);
 if (changed or canonical_changed) and (old.status in ('sold','auctioned','reserved') or exists(select 1 from public.inventory_reservations where item_id=new.id and status='active' and expires_at>now())) then raise exception 'Reserved or sold item pricing is immutable'; end if;
 if new.pricing_approval_id is null and old.pricing_approval_id is not null and new.listed_price_cents is not distinct from old.listed_price_cents and new.seller_pricing_approved_at is not distinct from old.seller_pricing_approved_at then
 if not private.pricing_staff() or old.status in ('listed','relisted') then raise exception 'Unpublish before invalidating approval'; end if;
 return new;
 end if;
 if canonical_changed and old.status in ('listed','relisted') then raise exception 'Unpublish before changing priced attributes'; end if;
 if canonical_changed and not changed then new.pricing_approval_id:=null; end if;
 if changed or new.status in ('listed','relisted') and old.status is distinct from new.status then
 select * into decision from private.pricing_approvals where id=new.pricing_approval_id and item_id=new.id;
 if not found or decision.price_cents is distinct from new.listed_price_cents or decision.item_fingerprint is distinct from private.pricing_fingerprint(new) or new.listed_price_cents<greatest(800,coalesce((public.get_selling_rules()->>'minimumSellingPriceCents')::integer,800)) then raise exception 'Current admin approval for this exact item and price required'; end if;
 if changed and (not private.pricing_admin() or decision.approved_by is distinct from auth.uid() or decision.previous_approval_id is distinct from old.pricing_approval_id or new.pricing_approval_id is not distinct from old.pricing_approval_id) then raise exception 'A new admin decision is required for a price change'; end if;
 if new.status in ('listed','relisted') and not private.pricing_staff() then raise exception 'Publication requires staff approval'; end if;
 end if;
 return new;
 end;$$;
create trigger zz_pricing_approval_guard before insert or update on public.items for each row execute function private.guard_pricing_approval();

create function public.admin_approve_item_price(target uuid, expected_snapshot text, price_cents integer, reason text, analysis uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare i public.items%rowtype; a private.pricing_analyses%rowtype; result uuid; current_input jsonb;
 begin
 if not private.pricing_admin() then raise exception 'Owner or admin with MFA required'; end if;
 select * into i from public.items where id=target for update;
 if not found or i.status not in ('accepted','waiting_for_seller_approval','approved','listing_preparation','photography_pending','listed','relisted') then raise exception 'Item unavailable for pricing'; end if;
 if expected_snapshot is distinct from private.pricing_snapshot(i) then raise exception 'Item changed; refresh and review'; end if;
 if i.inspected_at is null or cardinality(coalesce(i.photo_urls,'{}'))<1 then raise exception 'Physical inspection and photos required'; end if;
 if not private.has_team_pricing_mandate(i.owner_id) then raise exception 'Seller must accept team pricing terms first'; end if;
 if i.seller_pricing_approved_at is null and i.status not in ('accepted','waiting_for_seller_approval') then raise exception 'Complete intake review first'; end if;
 if exists(select 1 from public.inventory_reservations where item_id=target and status='active' and expires_at>now()) then raise exception 'Active checkout reservation; retry after release'; end if;
 if price_cents is null or price_cents not between greatest(800,coalesce((public.get_selling_rules()->>'minimumSellingPriceCents')::integer,800)) and 100000000 or reason is null or length(trim(reason)) not between 10 and 500 then raise exception 'Valid price and decision reason required'; end if;
 current_input:=private.pricing_input(target);
 if analysis is not null then
 select * into a from private.pricing_analyses where id=analysis and item_id=target and status='completed';
 if not found or a.created_at<now()-interval '24 hours' or (a.input-'observedAt') is distinct from current_input or exists(select 1 from jsonb_array_elements(current_input->'comparables')c where c->>'id' in(select jsonb_array_elements_text(a.result->'includedIds')) and (c->>'observedAt')::timestamptz<now()-make_interval(days=>(current_input->'rules'->>'maxAgeDays')::integer)) then raise exception 'Analysis is stale; request a new analysis or use manual review'; end if;
 end if;
 insert into private.pricing_approvals(item_id,previous_approval_id,analysis_id,item_fingerprint,price_cents,previous_price_cents,approved_by,reason,snapshot)
 values(target,i.pricing_approval_id,analysis,private.pricing_fingerprint(i),price_cents,i.listed_price_cents,auth.uid(),trim(reason),current_input||jsonb_build_object('analysisResult',a.result,'manual',analysis is null)) returning id into result;
 if i.seller_pricing_approved_at is null then
 update public.items set initial_approved_price_cents=price_cents,listed_price_cents=price_cents,pricing_authority='team',seller_pricing_approved_at=now(),pricing_approval_id=result,updated_at=now() where id=target;
 else
 update public.items set listed_price_cents=price_cents,pricing_approval_id=result,updated_at=now() where id=target;
 end if;
 update public.item_operations set auto_publish_enabled=false,auto_publish_at=null where item_id=target;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason) values(auth.uid(),'pricing.approved','item',target::text,jsonb_build_object('priceCents',i.listed_price_cents),jsonb_build_object('priceCents',price_cents,'approvalId',result,'analysisId',analysis),trim(reason));
 return result;
 end;$$;
-- Legacy callers must use the same exact-price, reasoned decision path.
create or replace function public.admin_finalize_team_item_pricing(target_item_id uuid,expected_price integer) returns void language plpgsql security definer set search_path='' as $$
 begin raise exception 'Open AI Pricing and record an admin decision with a reason'; end;$$;
revoke execute on function public.approve_item_pricing(uuid,integer),public.seller_schedule_auto_publish(uuid,integer) from public,anon,authenticated;

create or replace function public.admin_publish_item(target_item_id uuid,target_listed_price_cents integer default null) returns void language plpgsql security definer set search_path='' as $$
 declare i public.items%rowtype; price integer;
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 select * into i from public.items where id=target_item_id for update;
 if not found or i.status not in ('accepted','waiting_for_seller_approval','approved','listing_preparation','photography_pending','listed','relisted') then raise exception 'Item unavailable for publication'; end if;
 price:=coalesce(target_listed_price_cents,i.listed_price_cents);
 if not exists(select 1 from private.pricing_approvals a where a.id=i.pricing_approval_id and a.item_id=i.id and a.price_cents=price and a.item_fingerprint=private.pricing_fingerprint(i)) then raise exception 'Approve this exact price in AI Pricing first'; end if;
 if i.inspected_at is null or cardinality(coalesce(i.photo_urls,'{}'))<1 then raise exception 'Physical inspection and photos required'; end if;
 update public.items set status='listed',published_at=coalesce(published_at,now()),updated_at=now() where id=i.id;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value) values(auth.uid(),'item.published','item',i.id::text,jsonb_build_object('priceCents',price,'approvalId',i.pricing_approval_id));
 end;$$;

-- Explicit grants prevent the default PostgreSQL PUBLIC EXECUTE permission.
revoke all on function private.pricing_staff(),private.pricing_admin(),private.pricing_fingerprint(public.items),private.pricing_snapshot(public.items),private.pricing_input(uuid),private.pricing_immutable(),private.pricing_analysis_immutable(),private.guard_pricing_approval() from public,anon,authenticated,service_role;
revoke all on function public.admin_pricing_workspace(uuid),public.admin_add_market_comparable(uuid,jsonb),public.admin_invalidate_market_comparable(uuid,text),public.admin_save_pricing_rules(integer,jsonb,text),public.admin_request_pricing_analysis(uuid),public.admin_approve_item_price(uuid,text,integer,text,uuid) from public,anon;
grant execute on function public.admin_pricing_workspace(uuid),public.admin_add_market_comparable(uuid,jsonb),public.admin_invalidate_market_comparable(uuid,text),public.admin_save_pricing_rules(integer,jsonb,text),public.admin_request_pricing_analysis(uuid),public.admin_approve_item_price(uuid,text,integer,text,uuid) to authenticated;
revoke all on function public.claim_pricing_jobs(integer),public.finish_pricing_job(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_pricing_jobs(integer),public.finish_pricing_job(uuid,uuid,jsonb,text) to service_role;

-- Keep selling-period expiry, but price reviews never publish or discount items.
CREATE OR REPLACE FUNCTION private.run_rewear_ops_automations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; schedule jsonb:=coalesce(public.get_selling_rules()->'discountSchedule','[]'::jsonb); minimum_price integer:=greatest(1,coalesce((public.get_selling_rules()->>'minimumSellingPriceCents')::integer,1)); days_live integer; discount_bps integer; target_price integer; published_count integer:=0; markdown_count integer:=0; last_chance_count integer:=0; expired_count integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtext('rewear_ops_automation')) then return jsonb_build_object('skipped','already_running'); end if;
 insert into private.pricing_reviews(item_id,publication_at,day) select i.id,i.published_at,d.value::text::integer from public.items i cross join lateral(select value from public.business_setting_versions where setting_key='ai_pricing_rules' and effective_at<=now() order by version desc limit 1)cfg cross join lateral jsonb_array_elements(cfg.value->'reviewDays')d where i.status in ('listed','relisted') and i.published_at<=now()-make_interval(days=>d.value::text::integer) on conflict do nothing;
 get diagnostics markdown_count=row_count;
 update public.item_operations o set stage='last_chance',stage_updated_at=now() from public.items i where i.id=o.item_id and i.status in ('listed','relisted') and o.last_chance_at is not null and o.last_chance_at<=now() and o.stage='live'; get diagnostics last_chance_count=row_count;
 for r in select i.id,i.status,i.seller_disposition_preference from public.items i join public.item_operations o on o.item_id=i.id where i.status in ('listed','relisted') and o.selling_expires_at is not null and o.selling_expires_at<=now() and not exists(select 1 from public.inventory_reservations ir where ir.item_id=i.id and ir.status='active' and ir.expires_at>now()) loop update public.items set status=case r.seller_disposition_preference when 'return' then 'return_to_seller' when 'donate' then 'donation_pending' else 'selling_period_expired' end,updated_at=now() where id=r.id; insert into public.item_status_history(item_id,old_status,new_status,changed_by,reason) values(r.id,r.status,case r.seller_disposition_preference when 'return' then 'return_to_seller' when 'donate' then 'donation_pending' else 'selling_period_expired' end,null,'Selling period completed automatically'); expired_count:=expired_count+1; end loop;
 return jsonb_build_object('published',published_count,'markdowns',0,'pricingReviews',markdown_count,'lastChance',last_chance_count,'expired',expired_count);
end; $function$
;



create or replace function public.seller_operations_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    else jsonb_build_object(
      'items',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'itemId', i.id,
            'itemCode', o.item_code,
            'name', i.name,
            'status', i.status,
            'stage', o.stage,
            'reviewReadyAt', o.review_ready_at,
            'reviewDeadlineAt', o.review_deadline_at,
            'autoPublishAt', o.auto_publish_at,
            'publishedAt', i.published_at,
            'lastChanceAt', o.last_chance_at,
            'sellingExpiresAt', o.selling_expires_at,
            'listedPriceCents', case when i.pricing_approval_id is not null or i.status='sold' then i.listed_price_cents else null end,
            'initialPriceCents', case when i.pricing_approval_id is not null or i.status='sold' then i.initial_approved_price_cents else null end,
            'dispositionPreference', i.seller_disposition_preference,
            'rejectionReason', case when i.status = 'rejected' then i.seller_rejection_reason else null end,
            'rejectionPhotoUrl', case when i.status = 'rejected' then i.seller_rejection_photo_url else null end,
            'timeline', coalesce((
              select jsonb_agg(ev order by occurred_at desc)
              from (
                select
                  jsonb_build_object(
                    'type', 'status',
                    'label', h.new_status,
                    'at', h.created_at
                  ) ev,
                  h.created_at occurred_at
                from public.item_status_history h
                where h.item_id = i.id

                union all

                select
                  jsonb_build_object(
                    'type', e.event_type,
                    'label', coalesce(e.stage, e.event_type),
                    'at', e.created_at
                  ) ev,
                  e.created_at occurred_at
                from public.item_operation_events e
                where e.item_id = i.id

                order by occurred_at desc
                limit 20
              ) t
            ), '[]'::jsonb)
          )
          order by i.created_at desc
        )
        from public.items i
        join public.item_operations o on o.item_id = i.id
        where i.owner_id = auth.uid()
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.seller_operations_snapshot() from public, anon;
grant execute on function public.seller_operations_snapshot() to authenticated;



-- Raw item rows contain provisional prices. Sellers use the safe projection instead.
revoke select on public.items from public,anon,authenticated;
grant select(id) on public.items to authenticated;
create function public.my_priced_items() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'collection_request_id',i.collection_request_id,'name',i.name,'status',i.status,
 'initial_approved_price_cents',case when i.pricing_approval_id is not null or i.status='sold' then i.initial_approved_price_cents end,
 'listed_price_cents',case when i.pricing_approval_id is not null or i.status='sold' then i.listed_price_cents end,
 'sold_price_cents',i.sold_price_cents,
 'locked_seller_commission_bps',case when i.pricing_approval_id is not null or i.status='sold' then i.locked_seller_commission_bps end,
 'locked_platform_commission_bps',case when i.pricing_approval_id is not null or i.status='sold' then i.locked_platform_commission_bps end,
 'seller_pricing_approved_at',case when i.pricing_approval_id is not null or i.status='sold' then i.seller_pricing_approved_at end,
 'estimated_seller_earnings_cents',case when i.pricing_approval_id is not null then round(i.listed_price_cents::numeric*i.locked_seller_commission_bps/10000)::integer end,
 'final_seller_earnings_cents',i.final_seller_earnings_cents) order by i.created_at desc),'[]'::jsonb)
 from public.items i where i.owner_id=auth.uid();
$$;
revoke all on function public.my_priced_items() from public,anon;
grant execute on function public.my_priced_items() to authenticated;

create function public.admin_pricing_queue(after_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.id) from (
 select i.id,i.name,i.brand,i.status,i.inspected_at,i.listed_price_cents,i.pricing_approval_id,
 exists(select 1 from private.pricing_reviews r where r.item_id=i.id and r.created_at>coalesce((select approved_at from private.pricing_approvals where id=i.pricing_approval_id),'-infinity'::timestamptz)) as review_due
 from public.items i where (after_id is null or i.id>after_id) and i.status in ('accepted','waiting_for_seller_approval','approved','listing_preparation','photography_pending','listed','relisted')
 order by i.id limit 50)q),'[]'::jsonb);
 end;$$;
revoke all on function public.admin_pricing_queue(uuid) from public,anon;
grant execute on function public.admin_pricing_queue(uuid) to authenticated;

create table private.pricing_publications (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.items(id),
 approval_id uuid not null references private.pricing_approvals(id),price_cents integer not null,
 published_at timestamptz not null default now()
);
create index pricing_publications_item on private.pricing_publications(item_id,published_at);
alter table private.pricing_publications enable row level security;
revoke all on private.pricing_publications from public,anon,authenticated,service_role;
create trigger pricing_publications_immutable before update or delete on private.pricing_publications for each row execute function private.pricing_immutable();
create function private.record_pricing_publication() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.status in ('listed','relisted') and old.status is distinct from new.status then insert into private.pricing_publications(item_id,approval_id,price_cents) values(new.id,new.pricing_approval_id,new.listed_price_cents); end if;
 return new;
 end;$$;
revoke all on function private.record_pricing_publication() from public,anon,authenticated,service_role;
create trigger pricing_publication_record after update on public.items for each row execute function private.record_pricing_publication();

-- Derive outcomes from the existing checkout and credit ledger, never write a second ledger.
create view private.pricing_performance as
 select l.id as order_item_id,i.id as item_id,i.brand,i.category,o.id as order_id,o.status as order_status,o.payment_status,
 p.price_cents as first_published_price_cents,p.published_at,o.paid_at,
 case when o.paid_at is not null and p.published_at is not null then greatest(0,extract(epoch from(o.paid_at-p.published_at))/86400) end as days_to_sale,
 l.unit_price_cents,l.discount_cents,case when o.paid_at is not null then l.unit_price_cents-l.discount_cents end as transaction_cents,
 c.seller_cents,c.sale_cents-c.seller_cents-l.discount_cents as platform_revenue_cents,c.reversed_at,
 null::integer as actual_processing_cents,null::integer as actual_profit_cents
 from public.order_items l join public.orders o on o.id=l.order_id join public.items i on i.id=l.item_id
 left join public.order_seller_credits c on c.order_item_id=l.id
 left join lateral(select * from private.pricing_publications where item_id=i.id order by published_at limit 1)p on true;
revoke all on private.pricing_performance from public,anon,authenticated,service_role;
create function public.admin_pricing_performance(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 return coalesce((select jsonb_agg(to_jsonb(p)) from private.pricing_performance p where item_id=target),'[]'::jsonb);
 end;$$;
revoke all on function public.admin_pricing_performance(uuid) from public,anon;
grant execute on function public.admin_pricing_performance(uuid) to authenticated;

-- Changing photographs, measurements or disclosed defects invalidates a prior decision.
create function private.guard_clothing_pricing_evidence() returns trigger language plpgsql security definer set search_path='' as $$
 declare target uuid; i public.items%rowtype;
 begin
 target:=case when tg_op='DELETE' then old.item_id else new.item_id end;
 select * into i from public.items where id=target for update;
 if i.status in ('listed','relisted','reserved','sold','auctioned') or exists(select 1 from public.inventory_reservations where item_id=target and status='active' and expires_at>now()) then raise exception 'Unpublish and release reservations before editing pricing evidence'; end if;
 if i.pricing_approval_id is not null then update public.items set pricing_approval_id=null where id=target; end if;
 return case when tg_op='DELETE' then old else new end;
 end;$$;
revoke all on function private.guard_clothing_pricing_evidence() from public,anon,authenticated,service_role;
create trigger clothing_pricing_evidence_guard before insert or update or delete on public.clothing_listing_evidence for each row execute function private.guard_clothing_pricing_evidence();

commit;
