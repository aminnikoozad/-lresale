begin;
-- Every subscription is explicitly tied to the signed-in owner's verified email.
create table private.visual_price_email_subscriptions (
 user_id uuid primary key references auth.users(id), enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table private.visual_price_email_jobs (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references private.visual_pricing_jobs(id),
 recipient_id uuid not null references auth.users(id), payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed','cancelled')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 http_request_id bigint, last_status integer, provider_id text, created_at timestamptz not null default now(),
 attempted_at timestamptz, accepted_at timestamptz, unique(job_id,recipient_id)
);
alter table private.visual_price_email_subscriptions enable row level security;
alter table private.visual_price_email_jobs enable row level security;
revoke all on private.visual_price_email_subscriptions,private.visual_price_email_jobs from public,anon,authenticated,service_role;
create index visual_price_email_pending on private.visual_price_email_jobs(next_attempt_at) where status in ('pending','sending');

create function private.visual_email_escape(v text) returns text language sql immutable set search_path='' as $$
 select replace(replace(replace(replace(replace(coalesce(v,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');
$$;
create function private.visual_price_email_payload(target uuid, recipient uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare j private.visual_pricing_jobs%rowtype; i public.items%rowtype; email text; price text; low text; high text; link text; title text; body text;
 begin
 select * into j from private.visual_pricing_jobs where id=target;
 select * into i from public.items where id=j.item_id;
 select u.email into email from auth.users u where u.id=recipient and u.email_confirmed_at is not null;
 if email is null then raise exception 'Verified admin email required'; end if;
 price:=to_char((j.result->>'suggestedCents')::numeric/100,'FM999999990.00')||' CAD';
 low:=to_char((j.result->>'lowCents')::numeric/100,'FM999999990.00')||' CAD';
 high:=to_char((j.result->>'highCents')::numeric/100,'FM999999990.00')||' CAD';
 title:=left(regexp_replace(i.name,'[[:cntrl:]]',' ','g'),120);
 link:='https://shikimomo.com/admin/visual-pricing?item='||i.id::text||'#item-'||i.id::text;
 body:=concat_ws(E'\n','Price ready for admin review / Prix à valider',
 'Item / Article: '||i.name,'Brand / Marque: '||coalesce(i.brand,'—'),'Size / Taille: '||coalesce(i.size,'—'),
 'Suggested price / Prix suggéré: '||price,'Approximate range / Fourchette approximative: '||low||' – '||high,
 'Low confidence: visual matches and asking prices require your review. No final price approval or publication has occurred.',
 'Faible confiance : les articles visuellement similaires et les prix demandés doivent être vérifiés. Aucun prix final n’a été approuvé et aucune publication n’a eu lieu.',
 'Open item photos, compare sources and review / Voir les photos, les sources et valider :',link);
 return jsonb_build_object('from','Shikimomo <notifications@shikimomo.com>','to',jsonb_build_array(email),
 'subject','Shikimomo · Price to review / Prix à valider · '||title,'text',body,
 'html','<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shikimomo — Price to review</title></head><body style="font-family:Arial,sans-serif;color:#222;line-height:1.6"><h1 style="font-size:24px">Price ready for review <span lang="fr">/ Prix à valider</span></h1><h2>'||private.visual_email_escape(i.name)||'</h2><p>'||private.visual_email_escape(coalesce(i.brand,'—'))||' · '||private.visual_email_escape(coalesce(i.size,'—'))||'</p><p><strong>'||price||'</strong></p><p>Approximate range <span lang="fr">/ Fourchette approximative</span>: '||low||' – '||high||'</p><p>Low confidence: review the photos and comparable asking prices before making a final decision.</p><p lang="fr">Faible confiance : vérifiez les photos et les prix demandés pour les articles similaires avant de prendre une décision finale.</p><p><a href="'||link||'">View photos and review price / Voir les photos et valider le prix</a></p><p>Sign in with admin MFA to review. Opening this link never approves or publishes an item.</p><p lang="fr">Connectez-vous avec l’authentification multifacteur administrateur. Ce lien n’approuve et ne publie jamais un article.</p></body></html>');
 end;$$;

create function private.queue_visual_price_emails(target uuid) returns void language plpgsql security definer set search_path='' as $$
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
 and s.enabled and a.role in ('owner','admin') and u.email is not null and u.email_confirmed_at is not null
 on conflict(job_id,recipient_id) do nothing;
 end;$$;
create function private.on_visual_price_completed_email() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.status='completed' and old.status is distinct from new.status and new.result->>'suggestedCents' is not null then
 perform private.queue_visual_price_emails(new.id);
 end if;
 return null;
 end;$$;
create trigger visual_price_completed_email after update of status on private.visual_pricing_jobs for each row execute function private.on_visual_price_completed_email();

create function public.admin_visual_price_email_preferences() returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
 if not private.pricing_admin() then raise exception 'Owner or admin with MFA required'; end if;
 return jsonb_build_object('enabled',coalesce((select enabled from private.visual_price_email_subscriptions where user_id=auth.uid()),false),
 'email',(select email from auth.users where id=auth.uid()),'verified',exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null),
 'waiting',(select count(*) from private.visual_price_email_jobs where recipient_id=auth.uid() and status in ('pending','sending')),
 'accepted',(select count(*) from private.visual_price_email_jobs where recipient_id=auth.uid() and status='accepted'),
 'failed',(select count(*) from private.visual_price_email_jobs where recipient_id=auth.uid() and status='failed'));
 end;$$;
create function public.admin_set_visual_price_email(enabled boolean) returns void language plpgsql security definer set search_path='' as $$
 declare target uuid;
 begin
 if not private.pricing_admin() then raise exception 'Owner or admin with MFA required'; end if;
 if enabled is null or (enabled and not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and email is not null)) then raise exception 'Verified email required'; end if;
 insert into private.visual_price_email_subscriptions(user_id,enabled) values(auth.uid(),enabled)
 on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now();
 if not enabled then update private.visual_price_email_jobs set status='cancelled' where recipient_id=auth.uid() and status='pending';
 else
 for target in select j.id from private.visual_pricing_jobs j where j.status='completed' and j.created_at>now()-interval '7 days' order by j.created_at desc limit 200 loop
 perform private.queue_visual_price_emails(target);
 end loop;
 end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,new_value) values(auth.uid(),'pricing.email_preference','pricing_notifications',jsonb_build_object('enabled',enabled));
 end;$$;

-- Outbox is independent of photo upload and price analysis; network work is asynchronous.
create function private.dispatch_visual_price_emails() returns void language plpgsql security definer set search_path='' as $$
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
 and s.enabled and a.role in ('owner','admin') and u.email_confirmed_at is not null and u.email=e.payload->'to'->>0);
 select decrypted_secret into api_key from vault.decrypted_secrets where name='shikimomo_pricing_resend';
 if api_key is null then select decrypted_secret into api_key from vault.decrypted_secrets where name='shikimomo_pickup_resend'; end if;
 if api_key is null then return; end if;
 for j in select * from private.visual_price_email_jobs where status='pending' and next_attempt_at<=now() order by created_at,id limit 1 for update skip locked loop
 request_number:=net.http_post(url:='https://api.resend.com/emails',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||api_key,'Idempotency-Key','shikimomo-price-review-'||j.id::text),body:=j.payload,timeout_milliseconds:=15000);
 update private.visual_price_email_jobs set status='sending',attempts=attempts+1,http_request_id=request_number,attempted_at=now() where id=j.id;
 end loop;
 end;$$;

-- Read the exact emailed item even when it is beyond the first queue page.
create function public.admin_visual_pricing_item(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 return (select to_jsonb(q) from (
 select i.id,i.name,i.brand,i.sale_mode,i.listed_price_cents,i.photo_urls,j.id as job_id,j.status,j.result,j.error_code,j.created_at,
 j.fingerprint=private.pricing_fingerprint(i) as current,j.created_at>now()-interval '7 days' as fresh,
 (select to_jsonb(r) from private.visual_pricing_reviews r where r.job_id=j.id order by reviewed_at desc limit 1) as review
 from public.items i join lateral(select * from private.visual_pricing_jobs v where v.item_id=i.id order by (v.fingerprint=private.pricing_fingerprint(i)) desc,created_at desc,id desc limit 1)j on true
 where i.id=target)q);
 end;$$;
revoke all on function private.visual_email_escape(text),private.visual_price_email_payload(uuid,uuid),private.queue_visual_price_emails(uuid),private.on_visual_price_completed_email(),private.dispatch_visual_price_emails() from public,anon,authenticated,service_role;
revoke all on function public.admin_visual_price_email_preferences(),public.admin_set_visual_price_email(boolean),public.admin_visual_pricing_item(uuid) from public,anon,service_role;
grant execute on function public.admin_visual_price_email_preferences(),public.admin_set_visual_price_email(boolean),public.admin_visual_pricing_item(uuid) to authenticated;
select cron.schedule('shikimomo-visual-price-email','* * * * *','select private.dispatch_visual_price_emails();');
commit;
