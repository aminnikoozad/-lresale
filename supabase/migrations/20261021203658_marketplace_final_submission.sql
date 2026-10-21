-- Additive only. No publication, payment, warehouse or commission activation.
create function private.marketplace_request_review_core(p_item uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$declare u uuid:=private.marketplace_require_user();i public.items%rowtype;begin
 perform private.marketplace_require_seller_terms();
 select * into i from public.items where id=p_item and owner_id=u and sale_mode='peer_to_peer' and status='listing_preparation' for update;
 if i.id is null or i.listing_version is distinct from p_version then raise exception 'Draft changed';end if;
 if not exists(select 1 from private.marketplace_sellers where user_id=u) or not exists(select 1 from public.clothing_listing_evidence e where e.item_id=i.id and e.evidence_source='seller' and e.listing_version=i.listing_version and e.disclosure_version='seller-disclosure-v2') or i.listed_price_cents is null or i.listed_price_cents<800 then raise exception 'Complete profile, price, photos and disclosures first';end if;
 if exists(select 1 from private.marketplace_listing_reviews where item_id=i.id and listing_version=i.listing_version and status in('pending','approved')) then return;end if;
 if exists(select 1 from private.marketplace_listing_reviews where item_id=i.id and listing_version=i.listing_version and status='rejected') then raise exception 'Revise the listing before requesting again';end if;
 insert into private.marketplace_listing_reviews(item_id,listing_version,status) values(i.id,i.listing_version,'pending') on conflict(item_id) do update set listing_version=excluded.listing_version,status='pending',reason=null,requested_at=now(),reviewed_at=null,reviewed_by=null;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(u,'marketplace.review_requested','item',i.id::text,jsonb_build_object('version',i.listing_version),'Content moderation request; no physical inspection or publication');end$$;

revoke all on function private.marketplace_request_review_core(uuid,integer) from public,anon,authenticated,service_role;
create or replace function public.marketplace_request_review(p_item uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$begin
 raise exception 'Use final submission with explicit policy acceptance';end$$;

create table private.marketplace_listing_submissions(
 item_id uuid not null references public.items(id),owner_id uuid not null references auth.users(id),
 listing_version integer not null,policy_version integer not null,
 locale text not null check(locale in ('en-CA','fr-CA')),submitted_at timestamptz not null default now(),
 primary key(item_id,listing_version,policy_version),
 foreign key(owner_id,policy_version) references private.marketplace_terms_acceptances(user_id,policy_version)
);
alter table private.marketplace_listing_submissions enable row level security;
revoke all on private.marketplace_listing_submissions from public,anon,authenticated,service_role;
create trigger marketplace_submission_immutable before update or delete on private.marketplace_listing_submissions for each row execute function private.guard_marketplace_terms_acceptance();
create function public.marketplace_submit_listing(p_item uuid,p_version integer,p_policy_version integer,p_locale text,p_accept boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();begin
 -- Acceptance, readiness, moderation queue and receipt commit together or not at all.
 perform public.marketplace_accept_seller_terms(p_policy_version,p_locale,p_accept);
 perform private.marketplace_request_review_core(p_item,p_version);
 insert into private.marketplace_listing_submissions(item_id,owner_id,listing_version,policy_version,locale)
 values(p_item,u,p_version,p_policy_version,p_locale) on conflict do nothing;
 return jsonb_build_object('submitted',true,'public',false,'version',p_version);
end$$;
revoke all on function public.marketplace_submit_listing(uuid,integer,integer,text,boolean) from public,anon;
grant execute on function public.marketplace_submit_listing(uuid,integer,integer,text,boolean) to authenticated;

-- Reuse the existing audit log for retry receipts, rather than creating a draft store.
create unique index marketplace_editor_request on public.audit_logs(admin_user_id,(new_value->>'requestId')) where action='marketplace.editor_saved';
create function public.marketplace_save_editor(p_request uuid,p_item uuid,p_version integer,p_fields jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();prior jsonb;input jsonb;result jsonb;v uuid;begin
 if p_request is null then raise exception 'Request required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,7407));
 input:=jsonb_build_object('item',p_item,'version',p_version,'fields',p_fields);
 select new_value into prior from public.audit_logs where admin_user_id=u and action='marketplace.editor_saved' and new_value->>'requestId'=p_request::text;
 if prior is not null then
   if prior->'input' is distinct from input then raise exception 'Request already used';end if;
   v:=(prior->'result'->>'id')::uuid;
 else
   result:=public.save_marketplace_draft(p_item,p_version,p_fields);v:=(result->>'id')::uuid;
   insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
   values(u,'marketplace.editor_saved','item',v::text,jsonb_build_object('requestId',p_request,'input',input,'result',result),'Idempotent private draft save from listing composer');
 end if;
 return (select x from jsonb_array_elements(public.my_marketplace_drafts()) x where x->>'id'=v::text);
end$$;
revoke all on function public.marketplace_save_editor(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.marketplace_save_editor(uuid,uuid,integer,jsonb) to authenticated;

create or replace function public.my_marketplace_drafts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by (r.status='listing_preparation') desc,r.updated_at desc,r.id) from (
 select i.id,i.name,i.brand,i.category,i.subcategory,i.size,i.item_condition,i.color,i.material,i.description,i.condition_notes,i.listed_price_cents,i.marketplace_details,i.listing_version,i.status,i.marketplace_closure_reason,i.updated_at,
 (select r.status from private.marketplace_listing_reviews r where r.item_id=i.id and r.listing_version=i.listing_version) as review_status,
 case when e.evidence_source='seller' and e.listing_version=i.listing_version and e.disclosure_version='seller-disclosure-v2' then 'documented' else 'incomplete' end as evidence_status,
 coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'role',a.role,'defect',a.defect,'url','/api/marketplace/photos/'||a.id::text) order by a.created_at,a.id) from private.marketplace_photo_assets a where a.item_id=i.id and a.withdrawn_at is null),'[]') as photo_assets
 from public.items i left join public.clothing_listing_evidence e on e.item_id=i.id
 where i.owner_id=auth.uid() and i.sale_mode='peer_to_peer' order by (i.status='listing_preparation') desc,i.updated_at desc,i.id limit 400
 )r),'[]');
end $$;
revoke all on function public.my_marketplace_drafts() from public,anon;
grant execute on function public.my_marketplace_drafts() to authenticated;
