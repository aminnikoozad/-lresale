begin;
-- A temporary photo session precedes an item, without guessing its owner, category or price.
create table private.visual_pricing_intakes (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users(id),
 request_id uuid not null, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), storage_key text not null unique,
 status text not null default 'uploading' check(status in ('uploading','queued','running','completed','failed','attached')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours',
 attempts integer not null default 0, lease_token uuid, lease_until timestamptz, available_at timestamptz not null default now(),
 result jsonb, error_code text, attached_item_id uuid references public.items(id),
 unique(created_by,request_id)
);
alter table private.visual_pricing_intakes enable row level security;
revoke all on private.visual_pricing_intakes from public,anon,authenticated,service_role;
create index visual_intake_pending on private.visual_pricing_intakes(available_at) where status in ('queued','running');
alter table private.visual_pricing_calls add column intake_id uuid references private.visual_pricing_intakes(id);
alter table private.visual_pricing_calls add constraint visual_call_one_subject check ((job_id is null) <> (intake_id is null));
create index visual_call_intake on private.visual_pricing_calls(intake_id,reserved_at);

create function public.admin_visual_intake_config() returns boolean language plpgsql stable security definer set search_path='' as $$begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required';end if;return private.visual_pricing_enabled();
end$$;
revoke all on function public.admin_visual_intake_config() from public,anon,service_role;
grant execute on function public.admin_visual_intake_config() to authenticated;
create function public.admin_begin_visual_intake(request_id uuid, sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.visual_pricing_intakes%rowtype; v uuid:=gen_random_uuid();begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required';end if;
 if not private.visual_pricing_enabled() then raise exception 'Visual search is paused';end if;
 if request_id is null or sha256 is null or sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid photo request';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7418));
 select * into r from private.visual_pricing_intakes x where x.created_by=auth.uid() and x.request_id=admin_begin_visual_intake.request_id;
 if found then
  if r.sha256 is distinct from sha256 or r.expires_at<=now() then raise exception 'Photo request changed or expired';end if;
 else
  select * into r from private.visual_pricing_intakes x where x.created_by=auth.uid() and x.sha256=admin_begin_visual_intake.sha256 and x.expires_at>now() and x.status in ('uploading','queued','running','completed') order by x.created_at desc limit 1;
  if not found then
   if (select count(*) from private.visual_pricing_intakes x where x.created_by=auth.uid() and x.created_at>now()-interval '1 hour')>=20 then raise exception 'Photo request limit';end if;
   insert into private.visual_pricing_intakes(id,created_by,request_id,sha256,storage_key)
   values(v,auth.uid(),request_id,sha256,'visual-intake/'||auth.uid()::text||'/'||v::text||'.webp') returning * into r;
  end if;
 end if;
 return jsonb_build_object('id',r.id,'key',r.storage_key,'status',r.status);
end$$;
create function public.admin_queue_visual_intake(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare r private.visual_pricing_intakes%rowtype;begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required';end if;
 select * into r from private.visual_pricing_intakes where id=target and created_by=auth.uid() and expires_at>now() for update;
 if not found then raise exception 'Photo session unavailable';end if;
 if r.status<>'uploading' then return;end if;
 if not exists(select 1 from storage.objects where bucket_id='shikimomo-listing-photos' and name=r.storage_key) then raise exception 'Photo upload not complete';end if;
 update private.visual_pricing_intakes set status='queued' where id=target;
end$$;
create function public.admin_visual_intake_status(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required';end if;
 return (select jsonb_build_object('id',id,'status',status,'result',result,'error',error_code) from private.visual_pricing_intakes where id=target and created_by=auth.uid() and expires_at>now());
end$$;
create function public.claim_visual_intake_job(target uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.visual_pricing_intakes%rowtype;begin
 perform pg_advisory_xact_lock_shared(hashtext('visual_pricing_feature'));
 if not private.visual_pricing_enabled() then return null;end if;
 perform pg_advisory_xact_lock(hashtext('visual_pricing_budget'));
 if (select count(*) from private.visual_pricing_calls where reserved_at>now()-interval '31 days')>=200 or (select count(*) from private.visual_pricing_calls where reserved_at>now()-interval '1 hour')>=40 then return null;end if;
 update private.visual_pricing_intakes set status='failed',error_code='retry_limit',lease_token=null,lease_until=null where status not in ('attached','failed') and (expires_at<=now() or (status='running' and lease_until<now() and attempts>=2));
 select * into r from private.visual_pricing_intakes x where (target is null or x.id=target) and x.expires_at>now() and x.attempts<2 and ((x.status='queued' and x.available_at<=now()) or (x.status='running' and x.lease_until<now())) order by x.created_at for update skip locked limit 1;
 if not found then return null;end if;
 update private.visual_pricing_intakes set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=r.id returning * into r;
 insert into private.visual_pricing_calls(intake_id) values(r.id);
 return jsonb_build_object('id',r.id,'token',r.lease_token,'kind','intake','image',jsonb_build_object('key',r.storage_key,'provider','supabase'));
end$$;
create function public.finish_visual_intake_job(target uuid, token uuid, result jsonb, failure_code text default null) returns void language plpgsql security definer set search_path='' as $$
declare r private.visual_pricing_intakes%rowtype;begin
 perform pg_advisory_xact_lock_shared(hashtext('visual_pricing_feature'));
 if not private.visual_pricing_enabled() then raise exception 'Visual search is paused';end if;
 select * into r from private.visual_pricing_intakes where id=target for update;
 if not found or r.status<>'running' or r.lease_token is distinct from token or r.lease_until<=now() or r.expires_at<=now() then raise exception 'Photo lease lost';end if;
 if failure_code is null and (jsonb_typeof(result) is distinct from 'object' or result->>'version' is distinct from 'visual-listed-v1' or jsonb_typeof(result->'matches') is distinct from 'array' or octet_length(result::text)>100000) then raise exception 'Invalid visual result';end if;
 update private.visual_pricing_intakes set status=case when failure_code is null then 'completed' when r.attempts>=2 then 'failed' else 'queued' end,result=case when failure_code is null then finish_visual_intake_job.result else null end,error_code=case when failure_code is null then null else 'search_unavailable' end,available_at=now()+interval '5 minutes',lease_token=null,lease_until=null where id=target;
end$$;
create function public.admin_attach_visual_intake(target uuid, item uuid, photo_sha256 text) returns void language plpgsql security definer set search_path='' as $$
declare r private.visual_pricing_intakes%rowtype;i public.items%rowtype;fp text;begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required';end if;
 select * into r from private.visual_pricing_intakes where id=target and created_by=auth.uid() for update;
 if not found or r.expires_at<=now() or r.sha256 is distinct from photo_sha256 then raise exception 'Photo session changed or expired';end if;
 if r.attached_item_id is not null then if r.attached_item_id=item then return;else raise exception 'Photo already attached';end if;end if;
 select * into i from public.items where id=item for update;
 if not found or i.sale_mode<>'managed_consignment' or i.status not in ('accepted','waiting_for_seller_approval','approved','listing_preparation','photography_pending','bundle_candidate','manual_review') or cardinality(i.photo_urls)=0 then raise exception 'Item unavailable';end if;
 if r.status='completed' and r.result is not null then
  fp:=private.pricing_fingerprint(i);
  insert into private.visual_pricing_jobs(item_id,fingerprint,status,result) values(i.id,fp,'completed',r.result)
  on conflict(item_id,fingerprint,cache_day) do update set status='completed',result=excluded.result,error_code=null,lease_token=null,lease_until=null
  where private.visual_pricing_jobs.status='queued' and private.visual_pricing_jobs.attempts=0;
  -- INSERT does not fire the existing completion UPDATE trigger.
  perform private.queue_visual_price_emails(j.id) from private.visual_pricing_jobs j where j.item_id=i.id and j.fingerprint=fp and j.status='completed' and j.cache_day=(now() at time zone 'UTC')::date;
 end if;
 update private.visual_pricing_intakes set attached_item_id=i.id,status='attached',lease_token=null,lease_until=null where id=target;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'pricing.intake_attached','item',i.id::text,jsonb_build_object('intake',target),'Photo-first suggestion linked; no financial approval or publication');
end$$;
create function private.pause_visual_intakes() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.setting_key='visual_pricing_feature' and coalesce((new.value->>'enabled')::boolean,false)=false then
  update private.visual_pricing_intakes set status='queued',lease_token=null,lease_until=null where status='running';
 end if;return null;
end$$;
create trigger pause_visual_intakes after insert on public.business_setting_versions for each row execute function private.pause_visual_intakes();
revoke all on function private.pause_visual_intakes() from public,anon,authenticated,service_role;
revoke all on function public.admin_begin_visual_intake(uuid,text),public.admin_queue_visual_intake(uuid),public.admin_visual_intake_status(uuid),public.admin_attach_visual_intake(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.admin_begin_visual_intake(uuid,text),public.admin_queue_visual_intake(uuid),public.admin_visual_intake_status(uuid),public.admin_attach_visual_intake(uuid,uuid,text) to authenticated;
revoke all on function public.claim_visual_intake_job(uuid),public.finish_visual_intake_job(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_visual_intake_job(uuid),public.finish_visual_intake_job(uuid,uuid,jsonb,text) to service_role;
commit;
