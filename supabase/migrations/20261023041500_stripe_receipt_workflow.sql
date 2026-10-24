-- Isolated sandbox queue dispatch. Reuse the existing durable inbox and leases.
create function public.stripe_test_event_state(p_event text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.payment_webhook_events%rowtype;begin
 perform private.assert_stripe_test();if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted adapter required';end if;
 select * into e from public.payment_webhook_events where provider='stripe_test' and provider_event_id=p_event;
 if not found then raise exception 'Receipt unavailable';end if;
 return jsonb_build_object('status',e.status,'reviewReason',e.review_reason);
end$$;
create function public.claim_stripe_test_event(p_event text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform private.assert_stripe_test();if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted adapter required';end if;
 update public.payment_webhook_events set status='failed',review_reason='retry_exhausted',last_error_code='retry_exhausted',lease_token=null,lease_until=null
 where provider='stripe_test' and provider_event_id=p_event and status in ('received','failed') and review_reason is null and processing_attempts>=10 and (lease_until is null or lease_until<now());
 with candidate as(select id from public.payment_webhook_events where provider='stripe_test' and provider_event_id=p_event and status in ('received','failed') and review_reason is null and processing_attempts<10 and next_attempt_at<=now() and (lease_until is null or lease_until<now()) for update skip locked),claimed as(update public.payment_webhook_events e set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',processing_attempts=processing_attempts+1 from candidate c where e.id=c.id returning e.provider_event_id,e.payload_sha256,e.lease_token,e.source_event_type,e.provider_object_id)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;return result;
end$$;
revoke all on function public.stripe_test_event_state(text),public.claim_stripe_test_event(text) from public,anon,authenticated;
grant execute on function public.stripe_test_event_state(text),public.claim_stripe_test_event(text) to service_role;
do $$begin if current_database()='shikimomo_staging' and exists(select 1 from pg_roles where rolname='staging_gateway') then
 grant execute on function public.stripe_test_event_state(text),public.claim_stripe_test_event(text) to staging_gateway;
end if;end$$;

create or replace function public.finish_stripe_test_event(p_event text,p_lease uuid,p_evidence jsonb,p_error text default null) returns text language plpgsql security definer set search_path='' as $$
declare e public.payment_webhook_events%rowtype;a public.order_payment_attempts%rowtype;outcome text;begin
 perform private.assert_stripe_test();if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted adapter required';end if;
 select * into e from public.payment_webhook_events where provider='stripe_test' and provider_event_id=p_event for update;
 if not found or e.lease_token is distinct from p_lease or e.lease_until<now() then raise exception 'Lease expired';end if;
 if e.status='processed' then return 'processed';end if;
 if p_error='evidence_rejected' then
  update public.payment_webhook_events set status='failed',review_reason='provider_evidence_rejected',last_error_code='provider_evidence_rejected',lease_token=null,lease_until=null where id=e.id;return 'review';
 end if;
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
