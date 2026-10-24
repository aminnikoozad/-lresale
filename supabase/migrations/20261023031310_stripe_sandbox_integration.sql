-- Isolated Neon sandbox only. No production activation or parallel financial ledger.
create table private.stripe_test_connection(id boolean primary key default true check(id),enabled boolean not null default false,platform_account text check(platform_account ~ '^acct_[A-Za-z0-9]+$'));
insert into private.stripe_test_connection(id) values(true);
alter table private.stripe_test_connection enable row level security;
revoke all on private.stripe_test_connection from public,anon,authenticated,service_role;
create function private.assert_stripe_test() returns void language plpgsql security definer set search_path='' as $$begin
 if current_database()<>'shikimomo_staging' or not exists(select 1 from private.stripe_test_connection where enabled and platform_account is not null) then raise exception 'Stripe sandbox disabled';end if;
end$$;
revoke all on function private.assert_stripe_test() from public,anon,authenticated,service_role;
alter table public.order_payment_attempts add column stripe_test_expires_at timestamptz;
alter table public.payment_webhook_events add column source_event_type text,add column provider_object_id text,add column lease_token uuid,add column lease_until timestamptz,add column next_attempt_at timestamptz not null default now(),add column review_reason text;
create index stripe_test_inbox_work on public.payment_webhook_events(next_attempt_at) where provider='stripe_test' and status in ('received','failed');
create function public.begin_stripe_test_checkout(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;a public.order_payment_attempts%rowtype;u uuid:=auth.uid();expiry timestamptz;begin
 perform private.assert_stripe_test();
 if u is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 select * into o from public.orders where id=p_order and buyer_id=u for update;
 if not found or o.status<>'awaiting_payment' or o.payment_status not in ('not_configured','pending') or o.reservation_expires_at<=now() or o.buyer_terms_accepted_at is null or o.tax_cents is null or o.shipping_cents is null or o.total_cents<=0 then raise exception 'Checkout unavailable';end if;
 perform i.id from public.items i join public.order_items oi on oi.item_id=i.id where oi.order_id=o.id order by i.id for update of i;
 if not exists(select 1 from public.order_items where order_id=o.id) or exists(select 1 from public.order_items oi join public.items i on i.id=oi.item_id where oi.order_id=o.id and (i.sale_mode<>'managed_consignment' or i.status<>'listed' or i.listed_price_cents<>oi.unit_price_cents or not exists(select 1 from public.inventory_reservations r where r.item_id=i.id and r.order_id=o.id and r.status='active' and r.expires_at>now()))) then raise exception 'Inventory unavailable or direct-payment launch gate closed';end if;
 select * into a from public.order_payment_attempts where order_id=o.id and status in ('created','pending') order by created_at limit 1 for update;
 if found then
  if a.provider<>'stripe_test' or a.expected_total_cents<>o.total_cents or a.stripe_test_expires_at<=now() then raise exception 'Payment attempt unavailable';end if;
 else
  -- Stripe Checkout has a 30-minute minimum. This 35-minute reservation applies only to synthetic sandbox orders.
  expiry:=now()+interval '35 minutes';
  update public.orders set reservation_expires_at=expiry where id=o.id;
  update public.inventory_reservations set expires_at=expiry where order_id=o.id and status='active';
  insert into public.order_payment_attempts(order_id,buyer_id,provider,expected_total_cents,stripe_test_expires_at) values(o.id,u,'stripe_test',o.total_cents,expiry) returning * into a;
 end if;
 return jsonb_build_object('orderId',o.id,'attemptId',a.id,'idempotencyKey',a.idempotency_key,'totalCents',a.expected_total_cents,'currency','CAD','expiresAt',floor(extract(epoch from a.stripe_test_expires_at)));
end$$;
revoke all on function public.begin_stripe_test_checkout(uuid) from public,anon,service_role;
grant execute on function public.begin_stripe_test_checkout(uuid) to authenticated;
create function public.bind_stripe_test_checkout(p_attempt uuid,p_session text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.assert_stripe_test();if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted adapter required';end if;
 if p_session !~ '^cs_test_[A-Za-z0-9]+$' then raise exception 'Invalid session';end if;
 perform 1 from public.order_payment_attempts where id=p_attempt and provider='stripe_test' and status in ('created','pending') for update;
 if not found then raise exception 'Attempt unavailable';end if;
 update public.order_payment_attempts set provider_checkout_id=p_session,status='pending',updated_at=now() where id=p_attempt and (provider_checkout_id is null or provider_checkout_id=p_session);
 if not found then raise exception 'Conflicting session';end if;
end$$;
create function public.receive_stripe_test_event(p_event text,p_type text,p_digest text,p_object text) returns void language plpgsql security definer set search_path='' as $$
declare e public.payment_webhook_events%rowtype;begin
 perform private.assert_stripe_test();if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted adapter required';end if;
 if p_event !~ '^evt_[A-Za-z0-9]+$' or length(p_type)>120 or p_digest !~ '^[a-f0-9]{64}$' or length(p_object)>255 then raise exception 'Invalid event';end if;
 insert into public.payment_webhook_events(provider,provider_event_id,event_type,source_event_type,payload_sha256,provider_object_id) values('stripe_test',p_event,'payment.succeeded',p_type,p_digest,p_object) on conflict(provider,provider_event_id) do nothing;
 select * into e from public.payment_webhook_events where provider='stripe_test' and provider_event_id=p_event for update;
 if e.payload_sha256<>p_digest or e.source_event_type<>p_type or e.provider_object_id is distinct from p_object then raise exception 'Conflicting replay';end if;
end$$;
create function public.claim_stripe_test_events(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform private.assert_stripe_test();if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted adapter required';end if;
 update public.payment_webhook_events set status='failed',review_reason='retry_exhausted',last_error_code='retry_exhausted',lease_token=null,lease_until=null
 where provider='stripe_test' and status in ('received','failed') and review_reason is null and processing_attempts>=10 and (lease_until is null or lease_until<now());
 with candidates as(select id from public.payment_webhook_events where provider='stripe_test' and status in ('received','failed') and review_reason is null and processing_attempts<10 and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by received_at for update skip locked limit greatest(1,least(p_limit,20))),claimed as(update public.payment_webhook_events e set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',processing_attempts=processing_attempts+1 from candidates c where e.id=c.id returning e.provider_event_id,e.payload_sha256,e.lease_token,e.processing_attempts,e.source_event_type,e.provider_object_id)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;return result;
end$$;
create function public.finish_stripe_test_event(p_event text,p_lease uuid,p_evidence jsonb,p_error text default null) returns text language plpgsql security definer set search_path='' as $$
declare e public.payment_webhook_events%rowtype;a public.order_payment_attempts%rowtype;outcome text;begin
 perform private.assert_stripe_test();if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted adapter required';end if;
 select * into e from public.payment_webhook_events where provider='stripe_test' and provider_event_id=p_event for update;
 if not found or e.lease_token is distinct from p_lease or e.lease_until<now() then raise exception 'Lease expired';end if;
 if e.status='processed' then return 'processed';end if;
 if p_error is not null then
  update public.payment_webhook_events set status='failed',lease_until=null,lease_token=null,last_error_code='provider_unavailable',next_attempt_at=now()+least(3600,30*power(2,processing_attempts)::integer)*interval '1 second',review_reason=case when processing_attempts>=10 then 'retry_exhausted' else null end where id=e.id;return 'retry';
 end if;
 if p_evidence is null or p_evidence='null'::jsonb then
  update public.payment_webhook_events set status='ignored',lease_token=null,lease_until=null,review_reason=case when e.source_event_type like 'charge.%' or e.source_event_type like 'refund.%' or e.source_event_type like 'payout.%' or e.source_event_type like 'transfer.%' then 'financial_reconciliation_required' else null end where id=e.id;return 'ignored';
 end if;
 -- Order and attempt locks use the same order as the existing trusted payment boundary.
 select * into a from public.order_payment_attempts where id=(p_evidence->>'attemptId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(a.buyer_id::text,137));
 perform 1 from public.orders where id=a.order_id for update;
 select * into a from public.order_payment_attempts where id=(p_evidence->>'attemptId')::uuid for update;
 if a.id is null or a.provider<>'stripe_test' or a.order_id::text is distinct from p_evidence->>'orderId' or a.expected_total_cents is distinct from (p_evidence->>'amountCents')::integer or p_evidence->>'currency' is distinct from 'CAD' or p_evidence->>'eventId' is distinct from p_event or p_evidence->>'digest' is distinct from e.payload_sha256 or p_evidence->>'eventType' is distinct from e.source_event_type or e.provider_object_id is distinct from p_evidence->>'sessionId' then outcome:='payment_evidence_mismatch';
 elsif a.provider_checkout_id is null then
  update public.payment_webhook_events set status='failed',lease_token=null,lease_until=null,next_attempt_at=now()+interval '1 minute' where id=e.id;return 'retry';
 elsif a.provider_checkout_id is distinct from p_evidence->>'sessionId' then outcome:='session_mismatch';
 else
  begin
   update public.payment_webhook_events set order_id=a.order_id where id=e.id;
   perform public.accept_verified_buyer_payment(a.id,p_event,p_evidence->>'paymentId',e.payload_sha256,(p_evidence->>'amountCents')::integer,'CAD',true);
  exception when others then outcome:='payment_not_applied_review_refund';end;
 end if;
 if outcome is not null then
  -- Keep a successful but unapplied payment durably visible; never resell inventory or lose the receipt.
  update public.payment_webhook_events set status='failed',review_reason=outcome,last_error_code=outcome,lease_token=null,lease_until=null where id=e.id;return 'review';
 end if;
 update public.payment_webhook_events set lease_token=null,lease_until=null where id=e.id;return 'processed';
end$$;
-- Provider account mapping reuses the marketplace seller identity, without storing bank/ID details.
create table private.marketplace_payment_accounts(user_id uuid not null references auth.users(id),provider text not null check(provider='stripe_test'),request_id uuid not null default gen_random_uuid(),provider_account_id text unique,created_at timestamptz not null default now(),primary key(user_id,provider));
alter table private.marketplace_payment_accounts enable row level security;
revoke all on private.marketplace_payment_accounts from public,anon,authenticated,service_role;
create function public.begin_stripe_test_seller() returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.marketplace_payment_accounts%rowtype;begin
 perform private.assert_stripe_test();if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 if not exists(select 1 from private.marketplace_sellers where user_id=auth.uid()) then raise exception 'Seller profile required';end if;
 insert into private.marketplace_payment_accounts(user_id,provider) values(auth.uid(),'stripe_test') on conflict do nothing;
 select * into a from private.marketplace_payment_accounts where user_id=auth.uid() and provider='stripe_test';
 if a.provider_account_id is null and a.created_at<now()-interval '23 hours' then raise exception 'Account creation needs provider reconciliation';end if;return jsonb_build_object('requestId',a.request_id,'accountId',a.provider_account_id);
end$$;
create function public.bind_stripe_test_seller(p_user uuid,p_request uuid,p_account text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.assert_stripe_test();if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted adapter required';end if;
 if p_account !~ '^acct_[A-Za-z0-9]+$' then raise exception 'Invalid account';end if;
 update private.marketplace_payment_accounts set provider_account_id=p_account where user_id=p_user and provider='stripe_test' and request_id=p_request and (provider_account_id is null or provider_account_id=p_account);
 if not found then raise exception 'Account binding unavailable';end if;
end$$;
revoke all on function public.begin_stripe_test_seller() from public,anon,service_role;
grant execute on function public.begin_stripe_test_seller() to authenticated;
revoke all on function public.bind_stripe_test_seller(uuid,uuid,text),public.bind_stripe_test_checkout(uuid,text),public.receive_stripe_test_event(text,text,text,text),public.claim_stripe_test_events(integer),public.finish_stripe_test_event(text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.bind_stripe_test_seller(uuid,uuid,text),public.bind_stripe_test_checkout(uuid,text),public.receive_stripe_test_event(text,text,text,text),public.claim_stripe_test_events(integer),public.finish_stripe_test_event(text,uuid,jsonb,text) to service_role;
-- Only the existing isolated Neon server gateway receives these RPC capabilities.
do $$begin if current_database()='shikimomo_staging' and exists(select 1 from pg_roles where rolname='staging_gateway') then
 grant execute on function public.bind_stripe_test_seller(uuid,uuid,text),public.bind_stripe_test_checkout(uuid,text),public.receive_stripe_test_event(text,text,text,text),public.claim_stripe_test_events(integer),public.finish_stripe_test_event(text,uuid,jsonb,text) to staging_gateway;
end if;end$$;
