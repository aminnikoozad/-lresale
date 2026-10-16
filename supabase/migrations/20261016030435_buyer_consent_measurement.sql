-- Actual delivery timestamp is recorded prospectively; old delivery dates are not invented.
alter table public.orders add column delivered_at timestamptz;
create function private.buyer_delivery_timestamp() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='delivered' and old.status is distinct from 'delivered' then new.delivered_at:=coalesce(old.delivered_at,now());else new.delivered_at:=old.delivered_at;end if;return new;
end $$;
revoke all on function private.buyer_delivery_timestamp() from public,anon,authenticated;
create trigger orders_buyer_delivery_timestamp before update of status,delivered_at on public.orders for each row execute function private.buyer_delivery_timestamp();
-- Prepared messaging infrastructure. No sender, scheduler or SMS activation.
create table public.buyer_message_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 provider_ready boolean not null default false check(not provider_ready), sms_enabled boolean not null default false check(not sms_enabled),
 hours_between integer not null default 24 check(hours_between>=24), weekly_cap integer not null default 2 check(weekly_cap between 1 and 2)
);
insert into public.buyer_message_settings(id) values(true);
create table public.buyer_consents (
 buyer_id uuid primary key references auth.users(id), email_marketing boolean not null default false,
 analytics boolean not null default false, version integer not null default 1, updated_at timestamptz not null default now()
);
create table public.buyer_consent_evidence (
 id uuid primary key default gen_random_uuid(),buyer_id uuid not null references auth.users(id),
 email_marketing boolean not null,analytics boolean not null,notice_version text not null check(notice_version='2026-10-16'),
 source text not null check(source in ('account_preferences','checkout_optional')),recorded_at timestamptz not null default now()
);
create table public.buyer_message_queue (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references auth.users(id),
 kind text not null check(kind in ('welcome','abandoned_cart_1','abandoned_cart_2','experience','repeat_purchase','order_receipt')),
 purpose text not null check(purpose in ('marketing','transactional')),
 channel text not null default 'email' check(channel='email'),
 item_ids uuid[] not null default '{}', price_snapshot jsonb not null default '{}',
 order_id uuid references public.orders(id), consent_version integer,
 due_at timestamptz not null, created_at timestamptz not null default now(),
 status text not null default 'queued' check(status in ('queued','claimed','sent','suppressed','failed')),
 suppression_reason text,sent_at timestamptz,claimed_at timestamptz,
 dedupe_key text not null unique, provider_message_id text unique,
 check((purpose='transactional' and kind='order_receipt' and order_id is not null) or (purpose='marketing' and kind<>'order_receipt'))
);
create index buyer_message_queue_due on public.buyer_message_queue(due_at) where status='queued';
create index buyer_message_queue_buyer on public.buyer_message_queue(buyer_id,sent_at);
create table public.sales_measurement_events (
 event_id uuid primary key, event_name text not null check(event_name in ('view_item_list','select_item','view_item','add_to_cart','begin_checkout','purchase','refund')),
 item_ids uuid[] not null default '{}',order_id uuid references public.orders(id),
 value_cents integer, currency text not null default 'CAD' check(currency='CAD'),
 source text not null check(source in ('consented_browser','verified_order')),occurred_at timestamptz not null default now(),
 check((event_name in ('purchase','refund') and source='verified_order' and order_id is not null) or (event_name not in ('purchase','refund') and source='consented_browser' and order_id is null))
);
create unique index sales_purchase_once on public.sales_measurement_events(order_id) where event_name='purchase';
create table public.sales_campaign_costs (
 id uuid primary key default gen_random_uuid(),campaign_key text not null,channel text not null,period_start date not null,period_end date not null,
 advertising_cents integer not null check(advertising_cents>=0),variable_cents integer check(variable_cents>=0),
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),check(period_end>=period_start),unique(campaign_key,channel,period_start,period_end)
);
create table public.sales_order_attribution(order_id uuid primary key references public.orders(id),campaign_key text not null,channel text not null);

alter table public.buyer_message_settings enable row level security;
alter table public.buyer_consents enable row level security;
alter table public.buyer_consent_evidence enable row level security;
alter table public.buyer_message_queue enable row level security;
alter table public.sales_measurement_events enable row level security;
alter table public.sales_campaign_costs enable row level security;
alter table public.sales_order_attribution enable row level security;
revoke all on public.buyer_message_settings,public.buyer_consents,public.buyer_consent_evidence,public.buyer_message_queue,public.sales_measurement_events,public.sales_campaign_costs,public.sales_order_attribution from public,anon,authenticated;
grant select on public.buyer_consents to authenticated;
create policy buyer_own_consents on public.buyer_consents for select to authenticated using(buyer_id=(select auth.uid()));

create function public.save_my_buyer_consent(p_marketing boolean,p_analytics boolean,p_notice text,p_source text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 -- Evidence is append-only and flags default to false. This endpoint cannot enrol another account.
 insert into public.buyer_consent_evidence(buyer_id,email_marketing,analytics,notice_version,source) values(auth.uid(),p_marketing,p_analytics,p_notice,p_source);
 insert into public.buyer_consents(buyer_id,email_marketing,analytics) values(auth.uid(),p_marketing,p_analytics)
 on conflict(buyer_id) do update set email_marketing=excluded.email_marketing,analytics=excluded.analytics,version=public.buyer_consents.version+1,updated_at=now();
 update public.buyer_message_queue set status='suppressed',suppression_reason='consent_changed' where buyer_id=auth.uid() and purpose='marketing' and status in ('queued','claimed');
end $$;
revoke all on function public.save_my_buyer_consent(boolean,boolean,text,text) from public,anon;
grant execute on function public.save_my_buyer_consent(boolean,boolean,text,text) to authenticated;
create function public.admin_save_buyer_messages(p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_buyer_sales_admin();
 update public.buyer_message_settings set enabled=p_enabled where id;
 if not p_enabled then update public.buyer_message_queue set status='suppressed',suppression_reason='admin_paused' where purpose='marketing' and status in ('queued','claimed'); end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'buyer_message_settings_updated','buyer_offer','messages',jsonb_build_object('enabled',p_enabled),'Marketing processing control; no provider activated');
end $$;
revoke all on function public.admin_save_buyer_messages(boolean) from public,anon;
grant execute on function public.admin_save_buyer_messages(boolean) to authenticated;
create function public.admin_buyer_message_state() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_buyer_sales_admin();
 return jsonb_build_object('settings',(select to_jsonb(s) from public.buyer_message_settings s where id),'queueCounts',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.buyer_message_queue group by status) x));
end $$;
revoke all on function public.admin_buyer_message_state() from public,anon;
grant execute on function public.admin_buyer_message_state() to authenticated;

create function private.buyer_message_block_reason(p_message uuid) returns text language plpgsql security definer set search_path='' as $$
declare m public.buyer_message_queue%rowtype;c public.buyer_consents%rowtype;s public.buyer_message_settings%rowtype;
begin
 select * into m from public.buyer_message_queue where id=p_message;
 if not found then return 'unknown_message'; end if;
 if m.purpose='transactional' then
  if not exists(select 1 from public.orders where id=m.order_id and buyer_id=m.buyer_id and paid_at is not null) then return 'unverified_order';end if;
  return null;
 end if;
 select * into s from public.buyer_message_settings where id;
 if not s.enabled then return 'admin_paused'; end if;
 select * into c from public.buyer_consents where buyer_id=m.buyer_id;
 if not found or not c.email_marketing or c.version is distinct from m.consent_version then return 'consent_required'; end if;
 if exists(select 1 from public.buyer_message_queue where buyer_id=m.buyer_id and purpose='marketing' and id<>m.id and status='sent' and sent_at>now()-make_interval(hours=>s.hours_between)) then return 'daily_cap'; end if;
 if (select count(*) from public.buyer_message_queue where buyer_id=m.buyer_id and purpose='marketing' and status='sent' and sent_at>now()-interval '7 days')>=s.weekly_cap then return 'weekly_cap'; end if;
 if m.kind in ('welcome','abandoned_cart_1','abandoned_cart_2') and exists(select 1 from public.orders where buyer_id=m.buyer_id and paid_at>=m.created_at) then return 'purchased'; end if;
 if m.kind in ('experience','repeat_purchase') and not exists(select 1 from public.orders where id=m.order_id and buyer_id=m.buyer_id and status='delivered' and payment_status='paid') then return 'not_delivered'; end if;
 if exists(select 1 from unnest(m.item_ids) id where not exists(select 1 from public.catalog_items_v3() p where p.item_id=id and p.price_cents=(m.price_snapshot->>id::text)::integer)) then return 'inventory_or_price_changed'; end if;
 return null;
end $$;
revoke all on function private.buyer_message_block_reason(uuid) from public,anon,authenticated;

-- Service worker dry-run/claim API. Delivery is deliberately gated by provider_ready=false.
create function public.claim_buyer_message(p_message uuid,p_dry_run boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.buyer_message_queue%rowtype;reason text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service role required'; end if;
 select * into m from public.buyer_message_queue where id=p_message for update;
 if not found then return jsonb_build_object('allowed',false,'reason','unknown_message');end if;
 perform pg_advisory_xact_lock(hashtextextended(m.buyer_id::text,138));
 reason:=private.buyer_message_block_reason(p_message);
 if reason is not null then update public.buyer_message_queue set status='suppressed',suppression_reason=reason where id=p_message and status in ('queued','claimed');return jsonb_build_object('allowed',false,'reason',reason);end if;
 if m.status<>'queued' or m.due_at>now() then return jsonb_build_object('allowed',false,'reason','not_due');end if;
 if p_dry_run then return jsonb_build_object('allowed',true,'dryRun',true);end if;
 if not (select provider_ready from public.buyer_message_settings where id) then return jsonb_build_object('allowed',false,'reason','provider_not_configured');end if;
 update public.buyer_message_queue set status='claimed',claimed_at=now() where id=p_message;
 return jsonb_build_object('allowed',true,'idempotencyKey',m.id);
end $$;
revoke all on function public.claim_buyer_message(uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_buyer_message(uuid,boolean) to service_role;

create function private.suppress_incompatible_buyer_messages() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='orders' then
  if new.payment_status='paid' and old.payment_status is distinct from 'paid' then
   update public.buyer_message_queue set status='suppressed',suppression_reason='purchased' where buyer_id=new.buyer_id and purpose='marketing' and kind in ('welcome','abandoned_cart_1','abandoned_cart_2') and status in ('queued','claimed');
  end if;
 else
  if new.status is distinct from old.status or new.listed_price_cents is distinct from old.listed_price_cents then
   update public.buyer_message_queue set status='suppressed',suppression_reason='inventory_or_price_changed' where new.id=any(item_ids) and purpose='marketing' and status in ('queued','claimed');
  end if;
 end if;return new;
end $$;
revoke all on function private.suppress_incompatible_buyer_messages() from public,anon,authenticated;
create trigger orders_suppress_buyer_messages after update of payment_status on public.orders for each row execute function private.suppress_incompatible_buyer_messages();
create trigger items_suppress_buyer_messages after update of status,listed_price_cents on public.items for each row execute function private.suppress_incompatible_buyer_messages();

create function private.measure_verified_purchase() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.payment_status='paid' and old.payment_status is distinct from 'paid' then
  insert into public.sales_measurement_events(event_id,event_name,order_id,item_ids,value_cents,source) values(gen_random_uuid(),'purchase',new.id,array(select item_id from public.order_items where order_id=new.id),new.subtotal_cents-new.discount_cents,'verified_order') on conflict do nothing;
 end if;return new;
end $$;
revoke all on function private.measure_verified_purchase() from public,anon,authenticated;
create trigger orders_measure_verified_purchase after update of payment_status on public.orders for each row execute function private.measure_verified_purchase();

create function public.queue_buyer_followup(p_buyer uuid,p_kind text,p_items uuid[],p_order uuid,p_dedupe text) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.buyer_consents%rowtype;due timestamptz;prices jsonb;mid uuid;previous public.buyer_message_queue%rowtype;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service role required';end if;
 if p_kind not in ('welcome','abandoned_cart_1','abandoned_cart_2','experience','repeat_purchase') or length(p_dedupe) not between 1 and 200 or cardinality(p_items)>25 then raise exception 'Invalid follow-up';end if;
 select * into c from public.buyer_consents where buyer_id=p_buyer;
 if not found or not c.email_marketing then return null;end if;
 if not (select enabled from public.buyer_message_settings where id) then return null;end if;
 due:=case when p_kind='welcome' then now() when p_kind='abandoned_cart_1' then now()+interval '4 hours' end;
 if p_kind='abandoned_cart_2' then
  select * into previous from public.buyer_message_queue where buyer_id=p_buyer and kind='abandoned_cart_1' and status='sent' order by sent_at desc limit 1;
  if not found then return null;end if;due:=previous.sent_at+interval '24 hours';
 end if;
 if p_kind in ('experience','repeat_purchase') then
  select delivered_at+case when p_kind='experience' then interval '7 days' else interval '21 days' end into due from public.orders where id=p_order and buyer_id=p_buyer and status='delivered' and payment_status='paid';
  if due is null then return null;end if;
 end if;
 select coalesce(jsonb_object_agg(item_id::text,price_cents),'{}'::jsonb) into prices from public.catalog_items_v3() where item_id=any(p_items);
 if cardinality(p_items)>0 and (select count(*) from jsonb_object_keys(prices))<>cardinality(p_items) then return null;end if;
 insert into public.buyer_message_queue(buyer_id,kind,purpose,item_ids,price_snapshot,order_id,consent_version,due_at,dedupe_key) values(p_buyer,p_kind,'marketing',coalesce(p_items,'{}'),prices,p_order,c.version,due,p_dedupe) on conflict(dedupe_key) do nothing returning id into mid;
 return mid;
end $$;
revoke all on function public.queue_buyer_followup(uuid,text,uuid[],uuid,text) from public,anon,authenticated;
grant execute on function public.queue_buyer_followup(uuid,text,uuid[],uuid,text) to service_role;

create function public.record_buyer_browse_event(p_id uuid,p_name text,p_items uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.buyer_consents where buyer_id=auth.uid() and analytics) then raise exception 'Analytics consent required';end if;
 if p_name not in ('view_item_list','select_item','view_item','add_to_cart','begin_checkout') or cardinality(p_items) not between 1 and 25 then raise exception 'Invalid browse event';end if;
 if exists(select 1 from unnest(p_items) id where not exists(select 1 from public.catalog_items_v3() p where p.item_id=id)) then return;end if;
 insert into public.sales_measurement_events(event_id,event_name,item_ids,source) values(p_id,p_name,p_items,'consented_browser') on conflict(event_id) do nothing;
end $$;
revoke all on function public.record_buyer_browse_event(uuid,text,uuid[]) from public,anon;
grant execute on function public.record_buyer_browse_event(uuid,text,uuid[]) to authenticated;

-- Unsubscribe works without signing in; the unguessable token is sent only in a future email link.
alter table public.buyer_consents add column unsubscribe_token uuid not null unique default gen_random_uuid();
alter table public.buyer_consent_evidence drop constraint buyer_consent_evidence_source_check;
alter table public.buyer_consent_evidence add constraint buyer_consent_evidence_source_check check(source in ('account_preferences','checkout_optional','unsubscribe_link'));
create function public.unsubscribe_buyer_messages(p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.buyer_consents%rowtype;
begin
 select * into c from public.buyer_consents where unsubscribe_token=p_token for update;
 if not found then return false;end if;
 if c.email_marketing then
  update public.buyer_consents set email_marketing=false,version=version+1,updated_at=now() where buyer_id=c.buyer_id;
  insert into public.buyer_consent_evidence(buyer_id,email_marketing,analytics,notice_version,source) values(c.buyer_id,false,c.analytics,'2026-10-16','unsubscribe_link');
 end if;
 update public.buyer_message_queue set status='suppressed',suppression_reason='unsubscribed' where buyer_id=c.buyer_id and purpose='marketing' and status in ('queued','claimed');
 return true;
end $$;
revoke all on function public.unsubscribe_buyer_messages(uuid) from public;
grant execute on function public.unsubscribe_buyer_messages(uuid) to anon,authenticated;
