-- Additive controls: disabled categories and existing inventory are never deleted.
create table public.pilot_settings (
 id boolean primary key default true check(id), enabled boolean not null default true,
 categories text[] not null default array['women'], item_cap integer not null default 30 check(item_cap between 1 and 10000),
 pickup_days integer[] not null default array[6], duration_weeks integer not null default 8 check(duration_weeks between 6 and 8),
 started_at timestamptz, updated_at timestamptz not null default now(),
 check(cardinality(categories)>0 and categories <@ array['women','men','kids','shoes','accessories','electronics','home_decor']::text[]),
 check(cardinality(pickup_days)>0 and pickup_days <@ array[0,1,2,3,4,5,6])
);
insert into public.pilot_settings(id) values(true);
alter table public.pilot_settings enable row level security;
revoke all on public.pilot_settings from public,anon,authenticated;
grant select on public.pilot_settings to anon,authenticated;
create policy public_pilot_settings on public.pilot_settings for select to anon,authenticated using(true);
create function public.admin_save_pilot(p_enabled boolean,p_categories text[],p_cap integer,p_days integer[],p_weeks integer,p_start timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare old_value jsonb;
begin
 if not coalesce(public.can_manage_selling_rules(),false) or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'Admin MFA required'; end if;
 select to_jsonb(s) into old_value from public.pilot_settings s where id for update;
 update public.pilot_settings set enabled=p_enabled,categories=p_categories,item_cap=p_cap,pickup_days=p_days,duration_weeks=p_weeks,started_at=p_start,updated_at=now() where id;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
 select auth.uid(),'pilot.settings','pilot','default',old_value,to_jsonb(s),'Admin pilot settings' from public.pilot_settings s where id;
end; $$;
revoke all on function public.admin_save_pilot(boolean,text[],integer,integer[],integer,timestamptz) from public,anon;
grant execute on function public.admin_save_pilot(boolean,text[],integer,integer[],integer,timestamptz) to authenticated;
create function private.pilot_category_active(cat text) returns boolean language sql stable security definer set search_path='' as $$
 select not enabled or cat=any(categories) from public.pilot_settings where id;
$$;
revoke all on function private.pilot_category_active(text) from public,anon,authenticated;
create function private.pilot_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.pilot_settings%rowtype; n integer;
begin
 select * into cfg from public.pilot_settings where id for update;
 if not cfg.enabled then return new; end if;
 if tg_op='INSERT' or new.category is distinct from old.category or (new.status='listed' and old.status is distinct from 'listed') then
  if not(new.category=any(cfg.categories)) then raise exception 'Category paused for pilot'; end if;
 end if;
 if tg_op='INSERT' then
  select count(*) into n from public.items;
  if n>=cfg.item_cap then raise exception 'Pilot intake capacity reached'; end if;
 end if;
 return new;
end; $$;
create trigger pilot_item_guard before insert or update on public.items for each row execute function private.pilot_item_guard();
create function private.pilot_pickup_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.pilot_settings%rowtype; slot_start timestamptz;
begin
 select * into cfg from public.pilot_settings where id;
 if cfg.enabled then
  if not(new.category=any(cfg.categories)) then raise exception 'Category paused for pilot'; end if;
  select window_start into slot_start from public.pickup_slots where id=new.pickup_slot_id;
  if slot_start is null or not(extract(dow from slot_start at time zone 'America/Toronto')::integer=any(cfg.pickup_days)) then raise exception 'Pickup day unavailable during pilot'; end if;
 end if;
 if exists(select 1 from public.profiles where id=new.user_id and free_pickup_status='suspended') then raise exception 'Pickup temporarily suspended: contact support'; end if;
 return new;
end; $$;
create trigger pilot_pickup_guard before insert or update of pickup_slot_id,category on public.collection_requests for each row execute function private.pilot_pickup_guard();
-- Each request can count as a confirmed no-show once. Preserve historical records.
alter table public.collection_requests add column pilot_miss_recorded boolean not null default false;
create function private.pilot_missed_pickup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='missed' and old.status is distinct from 'missed' and old.confirmation_status='confirmed' and not old.pilot_miss_recorded then
  new.pilot_miss_recorded:=true;
  update public.profiles set missed_pickup_count=missed_pickup_count+1,
   free_pickup_status=case when missed_pickup_count+1>=2 then 'suspended' else free_pickup_status end where id=new.user_id;
 end if;
 return new;
end; $$;
create trigger pilot_missed_pickup before update on public.collection_requests for each row execute function private.pilot_missed_pickup();
create function private.block_missed_fee() returns trigger language plpgsql set search_path='' as $$
begin
 if new.transaction_type='missed_pickup_fee' then raise exception 'Missed pickup earnings deductions are disabled'; end if;
 return new;
end; $$;
create trigger block_missed_fee before insert on public.wallet_transactions for each row execute function private.block_missed_fee();
-- Immutable item work/cost entries, with append-only corrections recorded as new entries.
create table public.pilot_work_logs (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.items(id),
 admin_id uuid not null references auth.users(id), minutes integer not null check(minutes between 0 and 1440),
 cost_cents integer not null default 0 check(cost_cents between 0 and 10000000),
 task text not null check(length(task) between 3 and 300),created_at timestamptz not null default now()
);
create index on public.pilot_work_logs(item_id);
create index on public.pilot_work_logs(admin_id);
alter table public.pilot_work_logs enable row level security;
revoke all on public.pilot_work_logs from public,anon,authenticated;
grant select,insert on public.pilot_work_logs to authenticated;
create policy pilot_work_read on public.pilot_work_logs for select to authenticated using(public.can_manage_selling_rules() and auth.jwt()->>'aal'='aal2');
create policy pilot_work_write on public.pilot_work_logs for insert to authenticated with check(admin_id=auth.uid() and public.can_manage_selling_rules() and auth.jwt()->>'aal'='aal2');
-- Guest questions are private staff inbox records, never shared customer chats.
create table public.product_questions (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.items(id),
 email text not null check(length(email) between 3 and 254),question text not null check(length(question) between 10 and 2000),
 created_at timestamptz not null default now(),status text not null default 'new' check(status in ('new','resolved'))
);
create index on public.product_questions(item_id);
create index on public.product_questions(created_at);
alter table public.product_questions enable row level security;
revoke all on public.product_questions from public,anon,authenticated;
grant select,update on public.product_questions to authenticated;
create policy questions_staff on public.product_questions for select to authenticated using(public.can_manage_selling_rules() and auth.jwt()->>'aal'='aal2');
create policy questions_staff_update on public.product_questions for update to authenticated using(public.can_manage_selling_rules() and auth.jwt()->>'aal'='aal2') with check(public.can_manage_selling_rules() and auth.jwt()->>'aal'='aal2');
create function public.submit_product_question(p_item uuid,p_email text,p_question text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(792451);
 if p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_question is null then raise exception 'Invalid question'; end if;
 if not exists(select 1 from public.items where id=p_item and status='listed' and private.pilot_category_active(category)) then raise exception 'Item unavailable'; end if;
 if (select count(*) from public.product_questions where created_at>now()-interval '1 hour')>=50 or
 (select count(*) from public.product_questions where lower(email)=lower(trim(p_email)) and created_at>now()-interval '1 hour')>=3 then raise exception 'Please try again later'; end if;
 insert into public.product_questions(item_id,email,question) values(p_item,lower(trim(p_email)),trim(p_question));
end; $$;
revoke all on function public.submit_product_question(uuid,text,text) from public;
grant execute on function public.submit_product_question(uuid,text,text) to anon,authenticated;

create or replace function public.catalog_items_v3()
returns table(
  item_id uuid, name text, brand text, category text, subcategory text, size text,
  item_condition text, color text, material text, pattern text, photo_url text,
  price_cents integer, published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.subcategory,i.size,i.item_condition,
         i.color,i.material,i.pattern,
         case when cardinality(i.photo_urls)>0 then i.photo_urls[1] else null end,
         coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at
  from public.items i
  where private.pilot_category_active(i.category) and i.status='listed'
    and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
    and not exists (
      select 1 from public.inventory_reservations r
      where r.item_id=i.id and r.status='active' and r.expires_at>now()
    )
  order by i.published_at desc nulls last,i.created_at desc
  limit 1000;
$$;
revoke all on function public.catalog_items_v3() from public;
grant execute on function public.catalog_items_v3() to anon, authenticated, service_role;

create or replace function public.catalog_item_detail_v3(target_item_id uuid)
returns table(
  item_id uuid, name text, brand text, category text, subcategory text, size text,
  item_condition text, color text, material text, pattern text, condition_notes text,
  photo_urls text[], description text, price_cents integer, published_at timestamptz,
  inspected_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.subcategory,i.size,i.item_condition,
         i.color,i.material,i.pattern,i.condition_notes,i.photo_urls,i.description,
         coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at,i.inspected_at
  from public.items i
  where private.pilot_category_active(i.category) and i.id=target_item_id
    and i.status='listed'
    and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
    and not exists (
      select 1 from public.inventory_reservations r
      where r.item_id=i.id and r.status='active' and r.expires_at>now()
    )
  limit 1;
$$;
revoke all on function public.catalog_item_detail_v3(uuid) from public;
grant execute on function public.catalog_item_detail_v3(uuid) to anon, authenticated, service_role;
-- Block checkout of a paused category, including direct legacy checkout RPC calls.
create function private.pilot_reservation_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' and not exists(select 1 from public.items where id=new.item_id and private.pilot_category_active(category)) then raise exception 'Category paused for pilot'; end if;
 return new;
end; $$;
create trigger pilot_reservation_guard before insert or update on public.inventory_reservations for each row execute function private.pilot_reservation_guard();
revoke all on function public.get_selling_rules() from public,anon;
grant execute on function public.get_selling_rules() to authenticated,service_role;
-- Suspend conflicting knowledge until a reviewed replacement is published; keep its history.
update public.knowledge_base set status='archived',updated_at=now()
where status='approved' and (approved_answer ilike '%missed%' or approved_answer ilike '%deduct%')
and (approved_answer ilike '%earnings%' or approved_answer ilike '%$10%');
-- No new missed-fee debt may be added by any existing mutation.
create function private.block_missed_debt() returns trigger language plpgsql set search_path='' as $$
begin
 if new.outstanding_missed_pickup_fee_cents > old.outstanding_missed_pickup_fee_cents then raise exception 'Missed pickup debt is disabled'; end if;
 return new;
end; $$;
create trigger block_missed_debt before update on public.profiles for each row execute function private.block_missed_debt();
revoke all on function private.pilot_item_guard(),private.pilot_pickup_guard(),private.pilot_missed_pickup(),private.block_missed_fee(),private.pilot_reservation_guard(),private.block_missed_debt() from public,anon,authenticated;
update public.knowledge_base set status='archived',updated_at=now()
where status='approved' and title in ('First missed pickup','Second missed pickup','Three missed pickups','Missed pickup fee can be deducted from future earnings');
insert into public.knowledge_base(title,question_examples,approved_answer,category_code,tags,status,source_kind,source_ref,approved_at)
values('Missed pickup policy: no earnings deductions',array['What if I miss a pickup?','What happens after the second missed pickup?'],
'The first missed confirmed pickup has no fee and receives a reminder. From the second missed confirmed pickup, pickup access is temporarily suspended for review. No missed-pickup amount is deducted from seller earnings. A deposit option is not currently active. Contact human support for a disputed missed pickup.',
'pickup.missed',array['missed pickup','no show','second pickup'],'approved','admin','owner-approved-pilot-policy-20260924',now());
with latest as (select value from public.business_setting_versions where setting_key='selling_rules' and effective_at<=now() order by version desc limit 1)
insert into public.business_setting_versions(setting_key,version,value,effective_at,reason)
select 'selling_rules',(select coalesce(max(version),0)+1 from public.business_setting_versions where setting_key='selling_rules'),
jsonb_set(value,'{pickupRules}',coalesce(value->'pickupRules','{}'::jsonb)||'{"firstMissedPickupFeeCents":0,"secondMissedPickupFeeCents":0,"suspendFreePickupAfterMisses":2}'::jsonb),now(),'Owner-approved pilot: no missed-pickup earnings deductions' from latest;
