-- Operational pickup alerts, independent of admin login email and browser push.
-- Configure the domain-restricted Resend key separately in Vault; never commit it.
create table private.pickup_email_jobs (
 id uuid primary key default gen_random_uuid(),
 request_id uuid unique references public.collection_requests(id) on delete cascade,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 http_request_id bigint,
 last_status integer,
 provider_id text,
 created_at timestamptz not null default now(),
 attempted_at timestamptz,
 accepted_at timestamptz
);
alter table private.pickup_email_jobs enable row level security;
revoke all on private.pickup_email_jobs from public,anon,authenticated;
create index pickup_email_pending_idx on private.pickup_email_jobs(next_attempt_at) where status in ('pending','sending');

create function private.pickup_email_payload(r public.collection_requests)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; customer_email text; details text; window_text text;
begin
 select * into p from public.profiles where id=r.user_id;
 select email into customer_email from auth.users where id=r.user_id;
 window_text := case when r.scheduled_window_start is not null then
 to_char(r.scheduled_window_start at time zone 'America/Toronto','YYYY-MM-DD HH24:MI') ||
 coalesce(' – '||to_char(r.scheduled_window_end at time zone 'America/Toronto','YYYY-MM-DD HH24:MI'),'') || ' (Montréal / America/Toronto)'
 else 'Not scheduled / À planifier' end;
 details := concat_ws(E'\n',
 'New pickup request / Nouvelle demande de collecte',
 '',
 'Request / Demande: '||r.id::text,
 'Bag reference / Référence du sac: '||coalesce(r.batch_code,'—'),
 'Customer / Client: '||coalesce(nullif(p.full_name,''),p.username,'—'),
 'Email / Courriel: '||coalesce(customer_email,'—'),
 'Phone / Téléphone: '||coalesce(p.phone,'—'),
 'Address / Adresse: '||coalesce(r.address,'—'),
 'Pickup window / Créneau de collecte: '||window_text,
 'Request type / Type de demande: '||coalesce(r.request_type,'—'),
 'Category / Catégorie: '||coalesce(r.category,'—'),
 'Subcategory / Sous-catégorie: '||coalesce(r.subcategory_hint,'—'),
 'Items / Articles: '||coalesce(r.item_count::text,'—'),
 'Notes / Remarques: '||coalesce(r.brand_notes,'—'),
 'Status / Statut: '||coalesce(r.status,'—'),
 'Confirmation: '||coalesce(r.confirmation_status,'—'),
 '',
 'Review in the admin panel / Consulter dans le panneau :',
 'https://shikimomo.com/admin/operations#pickup-requests');
 return jsonb_build_object('from','Shikimomo <notifications@shikimomo.com>',
 'to',jsonb_build_array('shikimomo.customer@gmail.com'),
 'subject','Shikimomo · New pickup / Nouvelle collecte · '||r.id::text,
 'text',details);
end;$$;
revoke all on function private.pickup_email_payload(public.collection_requests) from public,anon,authenticated;

create function private.dispatch_pickup_emails()
returns void language plpgsql security definer set search_path='' as $$
declare j record; response record; api_key text; request_number bigint;
begin
 -- Serialize workers; customer inserts only queue a job and never wait for HTTP.
 if not pg_try_advisory_xact_lock(742061905721::bigint) then return; end if;
 -- A provider acceptance is distinct from inbox delivery.
 for j in select * from private.pickup_email_jobs where status='sending' for update skip locked loop
  select * into response from net._http_response where id=j.http_request_id;
  if found then
   if response.status_code between 200 and 299 then
    update private.pickup_email_jobs set status='accepted',last_status=response.status_code,
    provider_id=(response.content::jsonb->>'id'),accepted_at=now(),payload='{}'::jsonb where id=j.id;
   elsif j.attempts>=8 or (response.status_code between 400 and 499 and response.status_code not in (408,429)) then
    update private.pickup_email_jobs set status='failed',last_status=response.status_code where id=j.id;
   else
    update private.pickup_email_jobs set status='pending',last_status=response.status_code,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,j.attempts)::integer)) where id=j.id;
   end if;
  elsif j.attempted_at < now()-interval '2 minutes' then
   update private.pickup_email_jobs set status=case when attempts>=8 then 'failed' else 'pending' end,
   next_attempt_at=now()+interval '2 minutes' where id=j.id;
  end if;
 end loop;
 -- Never retry past Resend's 24-hour idempotency window.
 update private.pickup_email_jobs set status='failed' where status='pending' and created_at<now()-interval '23 hours';
 delete from private.pickup_email_jobs where created_at<now()-interval '30 days';
 select decrypted_secret into api_key from vault.decrypted_secrets where name='shikimomo_pickup_resend';
 if api_key is null then return; end if;
 -- One send per minute respects shared provider throughput without bursts.
 for j in select * from private.pickup_email_jobs where status='pending' and next_attempt_at<=now() order by created_at limit 1 for update skip locked loop
  request_number := net.http_post(url:='https://api.resend.com/emails',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||api_key,'Idempotency-Key','shikimomo-pickup-'||j.id::text),
   body:=j.payload,timeout_milliseconds:=15000);
  update private.pickup_email_jobs set status='sending',attempts=attempts+1,http_request_id=request_number,attempted_at=now() where id=j.id;
 end loop;
end;$$;
revoke all on function private.dispatch_pickup_emails() from public,anon,authenticated;

create function private.queue_pickup_email()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.pickup_email_jobs(request_id,payload) values(new.id,private.pickup_email_payload(jsonb_populate_record(null::public.collection_requests,to_jsonb(new))))
 on conflict(request_id) do nothing;
 return new;
end;$$;
revoke all on function private.queue_pickup_email() from public,anon,authenticated;
create trigger collection_request_email_alert after insert on public.collection_requests for each row execute function private.queue_pickup_email();
select cron.schedule('shikimomo-pickup-email','* * * * *','select private.dispatch_pickup_emails();');
