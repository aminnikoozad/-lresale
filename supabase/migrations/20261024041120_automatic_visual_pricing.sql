begin;
-- Suggestions are private; these tables have no direct API grants.
create table private.visual_pricing_jobs (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.items(id),
 fingerprint text not null, cache_day date not null default ((now() at time zone 'UTC')::date), status text not null default 'queued' check(status in ('queued','running','completed','failed','superseded')),
 available_at timestamptz not null default now()+interval '90 seconds', created_at timestamptz not null default now(),
 attempts integer not null default 0, lease_token uuid, lease_until timestamptz, result jsonb, error_code text,
 unique(item_id,fingerprint,cache_day)
);
create index visual_pricing_pending on private.visual_pricing_jobs(available_at,created_at) where status in ('queued','running');
create index visual_pricing_item on private.visual_pricing_jobs(item_id,created_at desc);
create table private.visual_pricing_calls(job_id uuid references private.visual_pricing_jobs(id), reserved_at timestamptz not null default now());
create index visual_pricing_calls_time on private.visual_pricing_calls(reserved_at);
create table private.visual_pricing_reviews (
 id uuid primary key default gen_random_uuid(), job_id uuid not null unique references private.visual_pricing_jobs(id),
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default now(),
 price_cents integer not null check(price_cents between 800 and 100000000), reason text not null check(length(reason) between 10 and 500),
 pricing_approval_id uuid references private.pricing_approvals(id)
);
alter table private.visual_pricing_jobs enable row level security;
alter table private.visual_pricing_calls enable row level security;
alter table private.visual_pricing_reviews enable row level security;
revoke all on private.visual_pricing_jobs,private.visual_pricing_calls,private.visual_pricing_reviews from public,anon,authenticated,service_role;
create trigger visual_review_immutable before update or delete on private.visual_pricing_reviews for each row execute function private.pricing_immutable();
insert into public.business_setting_versions(setting_key,version,value,reason)
values('visual_pricing_feature',1,'{"enabled":false}','Visual search waits for provider configuration and owner activation');

create function private.visual_pricing_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select (value->>'enabled')::boolean from public.business_setting_versions where setting_key='visual_pricing_feature' and effective_at<=now() order by version desc limit 1),false);
$$;
create function private.enqueue_visual_pricing(target uuid) returns void language plpgsql security definer set search_path='' as $$
 declare i public.items%rowtype; fp text;
 begin
 select * into i from public.items where id=target;
 if not found or cardinality(coalesce(i.photo_urls,'{}'))=0 then return; end if;
 if i.status in ('sold','archived','rejected','donated','returned','disposed') then return; end if;
 fp:=private.pricing_fingerprint(i);
 update private.visual_pricing_jobs set status='superseded',lease_token=null,lease_until=null where item_id=target and fingerprint<>fp and status in ('queued','running');
 insert into private.visual_pricing_jobs(item_id,fingerprint) values(target,fp) on conflict(item_id,fingerprint,cache_day) do update set status=case when private.visual_pricing_jobs.status='superseded' then 'queued' else private.visual_pricing_jobs.status end;
 end;$$;
create function private.visual_pricing_upload_changed() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if tg_table_name='items' then perform private.enqueue_visual_pricing(new.id);
 else perform private.enqueue_visual_pricing(coalesce(new.item_id,old.item_id)); end if;
 return null;
 end;$$;
create trigger visual_pricing_item_upload after insert or update of photo_urls,name,brand,category,subcategory,size,item_condition,color,material,pattern,condition_notes,inspected_at on public.items for each row execute function private.visual_pricing_upload_changed();
create trigger visual_pricing_evidence_upload after insert or update or delete on public.clothing_listing_evidence for each row execute function private.visual_pricing_upload_changed();

create function public.admin_visual_pricing_queue(after_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 return jsonb_build_object('enabled',private.visual_pricing_enabled(),'canManage',private.pricing_admin(),
 'version',(select max(version) from public.business_setting_versions where setting_key='visual_pricing_feature'),
 'monthlyUsed',(select count(*) from private.visual_pricing_calls where reserved_at>now()-interval '31 days'), 'monthlyLimit',200,
 'rows',coalesce((select jsonb_agg(to_jsonb(q) order by q.id) from (
 select i.id,i.name,i.brand,i.sale_mode,i.listed_price_cents,i.photo_urls,j.id as job_id,j.status,j.result,j.error_code,j.created_at,
 j.fingerprint=private.pricing_fingerprint(i) as current, j.created_at>now()-interval '7 days' as fresh,
 (select to_jsonb(r) from private.visual_pricing_reviews r where r.job_id=j.id order by reviewed_at desc limit 1) as review
 from public.items i join lateral(select * from private.visual_pricing_jobs v where v.item_id=i.id order by (v.fingerprint=private.pricing_fingerprint(i)) desc,created_at desc,id desc limit 1)j on true
 where (after_id is null or i.id>after_id) order by i.id limit 25
 )q),'[]'::jsonb));
 end;$$;
create function public.admin_set_visual_pricing(expected_version integer, enabled boolean, reason text) returns void language plpgsql security definer set search_path='' as $$
 declare v integer;
 begin
 if not private.pricing_admin() then raise exception 'Owner or admin with MFA required'; end if;
 if enabled is null or reason is null or length(trim(reason)) not between 10 and 500 then raise exception 'State and reason required'; end if;
 perform pg_advisory_xact_lock(hashtext('visual_pricing_feature'));
 select max(version) into v from public.business_setting_versions where setting_key='visual_pricing_feature';
 if expected_version is distinct from v then raise exception 'Controls changed; refresh'; end if;
 insert into public.business_setting_versions(setting_key,version,value,reason,created_by) values('visual_pricing_feature',v+1,jsonb_build_object('enabled',enabled),trim(reason),auth.uid());
 if not enabled then update private.visual_pricing_jobs set status='queued',lease_token=null,lease_until=null where status='running'; end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,new_value,reason) values(auth.uid(),'pricing.visual_toggle','pricing_feature',jsonb_build_object('enabled',enabled),trim(reason));
 end;$$;
create function public.admin_request_visual_pricing(target uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 perform 1 from public.items where id=target for update;
 if not found then raise exception 'Item not found'; end if;
 perform private.enqueue_visual_pricing(target);
 update private.visual_pricing_jobs v set status='queued',attempts=0,available_at=now()+interval '90 seconds',error_code=null
 where v.item_id=target and v.status='failed' and v.cache_day=(now() at time zone 'UTC')::date
 and v.fingerprint=(select private.pricing_fingerprint(i) from public.items i where i.id=target);
 end;$$;

create function private.visual_pricing_image(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(
 (select jsonb_build_object('key',a.storage_key,'provider',a.provider) from private.marketplace_photo_assets a join public.items i on i.id=a.item_id
 where a.item_id=target and a.withdrawn_at is null and ('/api/marketplace/photos/'||a.id::text)=any(i.photo_urls)
 order by (a.role='front') desc,a.created_at,a.id limit 1),
 (select jsonb_build_object('url',u) from public.items i cross join lateral unnest(i.photo_urls)u where i.id=target and u like 'https://%' limit 1));
$$;
create function public.admin_visual_pricing_photo(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 return private.visual_pricing_image(target); end;$$;
revoke all on function private.visual_pricing_image(uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_visual_pricing_photo(uuid) from public,anon,service_role;
grant execute on function public.admin_visual_pricing_photo(uuid) to authenticated;

-- Claim one job per invocation. Reservations count even failed calls conservatively.
create function public.claim_visual_pricing_job() returns jsonb language plpgsql security definer set search_path='' as $$
 declare j private.visual_pricing_jobs%rowtype; i public.items%rowtype; image jsonb;
 begin
 perform pg_advisory_xact_lock_shared(hashtext('visual_pricing_feature'));
 if not private.visual_pricing_enabled() then return null; end if;
 perform pg_advisory_xact_lock(hashtext('visual_pricing_budget'));
 if (select count(*) from private.visual_pricing_calls where reserved_at>now()-interval '31 days')>=200
 or (select count(*) from private.visual_pricing_calls where reserved_at>now()-interval '1 hour')>=40 then return null; end if;
 update private.visual_pricing_jobs v set status='superseded',lease_token=null,lease_until=null from public.items it
 where v.item_id=it.id and v.status in ('queued','running') and (v.fingerprint<>private.pricing_fingerprint(it) or it.status in ('sold','archived','rejected','donated','returned','disposed') or cardinality(coalesce(it.photo_urls,'{}'))=0);
 update private.visual_pricing_jobs set status='failed',error_code='retry_limit' where status='running' and lease_until<now() and attempts>=2;
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
create function public.finish_visual_pricing_job(target uuid, token uuid, result jsonb, failure_code text default null) returns void language plpgsql security definer set search_path='' as $$
 declare j private.visual_pricing_jobs%rowtype; fp text;
 begin
 perform pg_advisory_xact_lock_shared(hashtext('visual_pricing_feature'));
 if not private.visual_pricing_enabled() then raise exception 'Visual search is paused'; end if;
 select * into j from private.visual_pricing_jobs where id=target for update;
 if not found or j.status<>'running' or j.lease_token is distinct from token or j.lease_until<=now() then raise exception 'Job lease lost'; end if;
 select private.pricing_fingerprint(i) into fp from public.items i where id=j.item_id;
 if fp is distinct from j.fingerprint then update private.visual_pricing_jobs set status='superseded',lease_token=null,lease_until=null where id=j.id; return; end if;
 if failure_code is null and (jsonb_typeof(result) is distinct from 'object' or result->>'version' is distinct from 'visual-listed-v1' or jsonb_typeof(result->'matches') is distinct from 'array' or octet_length(result::text)>100000) then raise exception 'Invalid visual result'; end if;
 update private.visual_pricing_jobs set status=case when failure_code is null then 'completed' when j.attempts>=2 then 'failed' else 'queued' end,
 result=case when failure_code is null then finish_visual_pricing_job.result else null end,error_code=case when failure_code is null then null else 'search_unavailable' end,
 available_at=now()+interval '5 minutes',lease_token=null,lease_until=null where id=j.id;
 end;$$;

create function public.admin_review_visual_price(job uuid, price_cents integer, reason text) returns void language plpgsql security definer set search_path='' as $$
 declare j private.visual_pricing_jobs%rowtype; i public.items%rowtype; approval uuid;
 begin
 if not private.pricing_admin() then raise exception 'Owner or admin with MFA required'; end if;
 -- Lock item before job, matching photo-upload lock order.
 select * into i from public.items where id=(select item_id from private.visual_pricing_jobs where id=job) for update;
 select * into j from private.visual_pricing_jobs where id=job for update;
 if not found or j.status<>'completed' or j.fingerprint is distinct from private.pricing_fingerprint(i) or j.created_at<now()-interval '7 days' then raise exception 'Suggestion changed or expired; refresh'; end if;
 if exists(select 1 from private.visual_pricing_reviews where job_id=job) then raise exception 'This suggestion was already reviewed'; end if;
 if reason is null or length(trim(reason)) not between 10 and 500 or price_cents is null or price_cents not between 800 and 100000000 then raise exception 'Valid final price and reason required'; end if;
 if i.sale_mode='managed_consignment' then
 approval:=public.admin_approve_item_price(i.id,private.pricing_snapshot(i),price_cents,'Visual evidence reviewed: '||left(trim(reason),470),null);
 else
 if i.status not in ('draft','changes_requested','pending_review','ready_to_publish','listed','relisted','approved','listing_preparation') then raise exception 'Item unavailable for review'; end if;
 -- P2P price remains seller-owned. This records evidence review only, not publication/moderation.
 end if;
 insert into private.visual_pricing_reviews(job_id,reviewed_by,price_cents,reason,pricing_approval_id) values(j.id,auth.uid(),price_cents,trim(reason),approval);
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'pricing.visual_reviewed','item',i.id::text,jsonb_build_object('job',j.id,'priceCents',price_cents,'approvalId',approval),trim(reason));
 end;$$;
revoke all on function private.visual_pricing_enabled(),private.enqueue_visual_pricing(uuid),private.visual_pricing_upload_changed() from public,anon,authenticated,service_role;
revoke all on function public.admin_visual_pricing_queue(uuid),public.admin_set_visual_pricing(integer,boolean,text),public.admin_request_visual_pricing(uuid),public.admin_review_visual_price(uuid,integer,text) from public,anon,service_role;
grant execute on function public.admin_visual_pricing_queue(uuid),public.admin_set_visual_pricing(integer,boolean,text),public.admin_request_visual_pricing(uuid),public.admin_review_visual_price(uuid,integer,text) to authenticated;
revoke all on function public.claim_visual_pricing_job(),public.finish_visual_pricing_job(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_visual_pricing_job(),public.finish_visual_pricing_job(uuid,uuid,jsonb,text) to service_role;
commit;
