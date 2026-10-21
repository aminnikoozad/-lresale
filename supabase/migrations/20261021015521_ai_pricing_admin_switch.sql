begin;

-- Runtime control for analysis only. Manual approval and publication guards stay active.
insert into public.business_setting_versions(setting_key,version,value,reason)
values('ai_pricing_feature',1,'{"enabled":false}','Initial production rollout: suggestions off; manual admin pricing available');

create function private.pricing_ai_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select (value->>'enabled')::boolean from public.business_setting_versions where setting_key='ai_pricing_feature' and effective_at<=now() order by version desc limit 1),false);
$$;

create function public.admin_pricing_control() returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 return (select jsonb_build_object('enabled',private.pricing_ai_enabled(),'version',version,'canManage',private.pricing_admin(),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.version desc) from(select version,value,reason,effective_at from public.business_setting_versions where setting_key='ai_pricing_feature' order by version desc limit 20)h),'[]'::jsonb))
 from public.business_setting_versions where setting_key='ai_pricing_feature' order by version desc limit 1);
 end;$$;

create function public.admin_set_pricing_enabled(expected_version integer,enabled boolean,reason text) returns integer language plpgsql security definer set search_path='' as $$
 declare current_version integer; old_enabled boolean;
 begin
 if not private.pricing_admin() then raise exception 'Owner or admin with MFA required'; end if;
 if enabled is null or reason is null or length(trim(reason)) not between 10 and 500 then raise exception 'State and a reason of 10 to 500 characters required'; end if;
 perform pg_advisory_xact_lock(hashtext('ai_pricing_feature'));
 select version into current_version from public.business_setting_versions where setting_key='ai_pricing_feature' order by version desc limit 1;
 if expected_version is distinct from current_version then raise exception 'Pricing controls changed; refresh'; end if;
 old_enabled:=private.pricing_ai_enabled();
 if enabled=old_enabled then return current_version; end if;
 insert into public.business_setting_versions(setting_key,version,value,created_by,reason)
 values('ai_pricing_feature',current_version+1,jsonb_build_object('enabled',enabled),auth.uid(),trim(reason));
 -- Revoke active leases when paused. Completed evidence and decisions are retained.
 if not enabled then
 update private.pricing_analyses set status='queued',lease_until=null,lease_token=null,error_code='paused_by_admin' where status='running';
 end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
 values(auth.uid(),'pricing.feature_changed','pricing_feature',(current_version+1)::text,jsonb_build_object('enabled',old_enabled),jsonb_build_object('enabled',enabled),trim(reason));
 return current_version+1;
 end;$$;

revoke all on function private.pricing_ai_enabled() from public,anon,authenticated,service_role;
revoke all on function public.admin_pricing_control(),public.admin_set_pricing_enabled(integer,boolean,text) from public,anon,service_role;
grant execute on function public.admin_pricing_control(),public.admin_set_pricing_enabled(integer,boolean,text) to authenticated;

create or replace function public.admin_request_pricing_analysis(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare payload jsonb; cache text; result uuid;
 begin
 perform pg_advisory_xact_lock_shared(hashtext('ai_pricing_feature'));
 if not private.pricing_staff() then raise exception 'Item staff with MFA required'; end if;
 if not private.pricing_ai_enabled() then raise exception 'AI pricing suggestions are off; manual approval remains available'; end if;
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

create or replace function public.claim_pricing_jobs(batch_size integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
 declare result jsonb;
 begin
 perform pg_advisory_xact_lock_shared(hashtext('ai_pricing_feature'));
 if not private.pricing_ai_enabled() then return '[]'::jsonb; end if;
 -- No user session or arbitrary service JWT claims can call this; EXECUTE is service_role only.
 update private.pricing_analyses set status='failed',error_code='retry_limit' where status='running' and lease_until<now() and attempts>=3;
 with jobs as(select id from private.pricing_analyses where (status='queued' and available_at<=now() or status='running' and lease_until<now()) and attempts<3 order by created_at for update skip locked limit greatest(1,least(batch_size,20))),
 claimed as(update private.pricing_analyses a set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid() from jobs where a.id=jobs.id returning a.id,a.input,a.lease_token)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
 end;$$;

create or replace function public.finish_pricing_job(target uuid, token uuid, result jsonb, failure_code text default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform pg_advisory_xact_lock_shared(hashtext('ai_pricing_feature'));
 if not private.pricing_ai_enabled() then raise exception 'AI pricing suggestions are off'; end if;
 if failure_code is null and (jsonb_typeof(result) is distinct from 'object' or result->>'engineVersion' is distinct from 'sold-median-v1' or octet_length(result::text)>1000000) then raise exception 'Invalid engine result'; end if;
 update private.pricing_analyses a set result=case when failure_code is null then finish_pricing_job.result else null end,
 status=case when failure_code is null then 'completed' when a.attempts>=3 then 'failed' else 'queued' end,
 completed_at=case when failure_code is null then now() else null end,error_code=case when failure_code is null then null else 'engine_error' end,
 available_at=now()+interval '1 minute'*power(2,a.attempts),lease_until=null,lease_token=null
 where a.id=target and a.status='running' and a.lease_token=token and a.lease_until>now();
 if not found then raise exception 'Job lease lost'; end if;
 end;$$;

create or replace function public.admin_approve_item_price(target uuid, expected_snapshot text, price_cents integer, reason text, analysis uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare i public.items%rowtype; a private.pricing_analyses%rowtype; result uuid; current_input jsonb;
 begin
 perform pg_advisory_xact_lock_shared(hashtext('ai_pricing_feature'));
 if analysis is not null and not private.pricing_ai_enabled() then raise exception 'AI pricing suggestions are off; use manual review'; end if;
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

commit;
