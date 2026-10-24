begin;
-- Preserve all existing grants and pricing/commission guards.
-- Respect approvals made through either admin workflow, and email only the latest estimate.
create or replace function private.queue_visual_price_emails(target uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 insert into private.visual_price_email_jobs(job_id,recipient_id,payload)
 select j.id,s.user_id,private.visual_price_email_payload(j.id,s.user_id)
 from private.visual_pricing_jobs j join public.items i on i.id=j.item_id
 cross join private.visual_price_email_subscriptions s
 join auth.users u on u.id=s.user_id join public.admin_roles a on a.user_id=s.user_id
 where j.id=target and j.status='completed' and j.result->>'suggestedCents' is not null
 and i.category in ('women','men','kids') and j.fingerprint=private.pricing_fingerprint(i)
 and j.created_at>now()-interval '7 days' and i.status not in ('sold','archived','rejected','donated','returned','disposed')
 and not exists(select 1 from private.visual_pricing_reviews r where r.job_id=j.id)
 and (i.sale_mode<>'managed_consignment' or not exists(select 1 from private.pricing_approvals p where p.item_id=i.id and p.approved_at>=j.created_at))
 and not exists(select 1 from private.visual_pricing_jobs newer where newer.item_id=j.item_id and newer.fingerprint=j.fingerprint and (newer.created_at,newer.id)>(j.created_at,j.id))
 and s.enabled and a.role in ('owner','admin') and u.email is not null and u.email_confirmed_at is not null
 on conflict(job_id,recipient_id) do nothing;
 end;$$;

create or replace function private.dispatch_visual_price_emails() returns void language plpgsql security definer set search_path='' as $$
 declare j record; response record; api_key text; request_number bigint;
 begin
 if not pg_try_advisory_xact_lock(74206424042315::bigint) then return; end if;
 for j in select * from private.visual_price_email_jobs where status='sending' for update skip locked loop
 select * into response from net._http_response where id=j.http_request_id;
 if found then
 if response.status_code between 200 and 299 then
 update private.visual_price_email_jobs set status='accepted',last_status=response.status_code,provider_id=response.content::jsonb->>'id',accepted_at=now(),payload='{}'::jsonb where id=j.id;
 elsif j.attempts>=8 or (response.status_code between 400 and 499 and response.status_code not in (408,429)) then
 update private.visual_price_email_jobs set status='failed',last_status=response.status_code where id=j.id;
 else
 update private.visual_price_email_jobs set status='pending',last_status=response.status_code,next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,j.attempts)::integer)) where id=j.id;
 end if;
 elsif j.attempted_at<now()-interval '2 minutes' then
 update private.visual_price_email_jobs set status=case when attempts>=8 then 'failed' else 'pending' end,next_attempt_at=now()+interval '2 minutes' where id=j.id;
 end if;
 end loop;
 -- A stable payload/key is reused only inside the provider's 24-hour idempotency window.
 update private.visual_price_email_jobs set status='failed' where status='pending' and created_at<now()-interval '23 hours';
 update private.visual_price_email_jobs e set status='cancelled' where e.status='pending' and not exists(
 select 1 from private.visual_pricing_jobs v join public.items i on i.id=v.item_id
 join private.visual_price_email_subscriptions s on s.user_id=e.recipient_id
 join auth.users u on u.id=s.user_id join public.admin_roles a on a.user_id=s.user_id
 where v.id=e.job_id and v.status='completed' and v.fingerprint=private.pricing_fingerprint(i) and v.created_at>now()-interval '7 days'
 and i.status not in ('sold','archived','rejected','donated','returned','disposed')
 and not exists(select 1 from private.visual_pricing_reviews r where r.job_id=v.id)
 and (i.sale_mode<>'managed_consignment' or not exists(select 1 from private.pricing_approvals p where p.item_id=i.id and p.approved_at>=v.created_at))
 and not exists(select 1 from private.visual_pricing_jobs newer where newer.item_id=v.item_id and newer.fingerprint=v.fingerprint and (newer.created_at,newer.id)>(v.created_at,v.id))
 and s.enabled and a.role in ('owner','admin') and u.email_confirmed_at is not null and u.email=e.payload->'to'->>0);
 select decrypted_secret into api_key from vault.decrypted_secrets where name='shikimomo_pricing_resend';
 if api_key is null then select decrypted_secret into api_key from vault.decrypted_secrets where name='shikimomo_pickup_resend'; end if;
 if api_key is null then return; end if;
 for j in select * from private.visual_price_email_jobs where status='pending' and next_attempt_at<=now() order by created_at,id limit 1 for update skip locked loop
 request_number:=net.http_post(url:='https://api.resend.com/emails',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||api_key,'Idempotency-Key','shikimomo-price-review-'||j.id::text),body:=j.payload,timeout_milliseconds:=15000);
 update private.visual_price_email_jobs set status='sending',attempts=attempts+1,http_request_id=request_number,attempted_at=now() where id=j.id;
 end loop;
 end;$$;

-- Pausing the second worker attempt must not leave an unclaimable queued job forever.
create or replace function public.claim_visual_pricing_job() returns jsonb language plpgsql security definer set search_path='' as $$
 declare j private.visual_pricing_jobs%rowtype; i public.items%rowtype; image jsonb;
 begin
 perform pg_advisory_xact_lock_shared(hashtext('visual_pricing_feature'));
 if not private.visual_pricing_enabled() then return null; end if;
 perform pg_advisory_xact_lock(hashtext('visual_pricing_budget'));
 if (select count(*) from private.visual_pricing_calls where reserved_at>now()-interval '31 days')>=200
 or (select count(*) from private.visual_pricing_calls where reserved_at>now()-interval '1 hour')>=40 then return null; end if;
 update private.visual_pricing_jobs v set status='superseded',lease_token=null,lease_until=null from public.items it
 where v.item_id=it.id and v.status in ('queued','running') and (v.fingerprint<>private.pricing_fingerprint(it) or it.status in ('sold','archived','rejected','donated','returned','disposed') or cardinality(coalesce(it.photo_urls,'{}'))=0);
 update private.visual_pricing_jobs set status='failed',error_code='retry_limit' where attempts>=2 and (status='queued' or (status='running' and lease_until<now()));
 select * into j from private.visual_pricing_jobs v where ((status='queued' and available_at<=now()) or (status='running' and lease_until<now())) and attempts<2
 and (select count(*) from private.visual_pricing_calls c join private.visual_pricing_jobs x on x.id=c.job_id where x.item_id=v.item_id and c.reserved_at>now()-interval '24 hours')<4
 order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 select * into i from public.items where id=j.item_id;
 image:=private.visual_pricing_image(i.id);
 if image is null then update private.visual_pricing_jobs set status='failed',error_code='image_unavailable' where id=j.id; return null; end if;
 update private.visual_pricing_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=j.id returning * into j;
 insert into private.visual_pricing_calls(job_id) values(j.id);
 return jsonb_build_object('id',j.id,'token',j.lease_token,'image',image);
 end;$$;
commit;
