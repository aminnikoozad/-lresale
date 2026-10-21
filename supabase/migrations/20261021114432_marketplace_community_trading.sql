-- Additive social commerce. No payment, publication, inspection or ledger state is forged.
-- Existing staff-support conversations and managed bundles have different participants/
-- unique inventory semantics; they are not reused for buyer/seller negotiations.
create table private.marketplace_sellers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id),
 display_name text not null check(length(display_name) between 2 and 60),
 city text not null check(length(city) between 2 and 80), bio text not null default '' check(length(bio)<=500),
 business_type text not null check(business_type in ('individual','business')),
 vacation boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.marketplace_follows (
 user_id uuid not null references auth.users(id), seller_id uuid not null references private.marketplace_sellers(id),
 created_at timestamptz not null default now(),primary key(user_id,seller_id)
);
create table private.marketplace_blocks (
 user_id uuid not null references auth.users(id), blocked_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),primary key(user_id,blocked_id),check(user_id<>blocked_id)
);
create table private.marketplace_threads (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.items(id),
 buyer_id uuid not null references auth.users(id),seller_id uuid not null references auth.users(id),
 buyer_read_at timestamptz,seller_read_at timestamptz,created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),unique(item_id,buyer_id),check(buyer_id<>seller_id)
);
create index marketplace_threads_buyer_idx on private.marketplace_threads(buyer_id,updated_at desc);
create index marketplace_threads_seller_idx on private.marketplace_threads(seller_id,updated_at desc);
create table private.marketplace_messages (
 id uuid primary key default gen_random_uuid(),thread_id uuid not null references private.marketplace_threads(id),
 sender_id uuid references auth.users(id),kind text not null check(kind in ('user','offer_created','offer_accepted','offer_declined','offer_countered')),
 body text not null check(length(body) between 1 and 2000),request_id uuid not null,
 created_at timestamptz not null default now(),unique(sender_id,request_id)
);
create index marketplace_messages_thread_idx on private.marketplace_messages(thread_id,created_at desc,id);
create index marketplace_messages_rate_idx on private.marketplace_messages(sender_id,created_at desc);
create table private.marketplace_offers (
 id uuid primary key default gen_random_uuid(),thread_id uuid not null references private.marketplace_threads(id),
 buyer_id uuid not null references auth.users(id),seller_id uuid not null references auth.users(id),
 proposer_id uuid not null references auth.users(id),recipient_id uuid not null references auth.users(id),
 amount_cents integer not null check(amount_cents between 800 and 100000000),
 lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 20),
 parent_id uuid references private.marketplace_offers(id),request_id uuid not null,
 policy_version integer not null default 1,policy_snapshot jsonb not null default '{"offerHours":24,"commercialApproved":false}',
 status text not null default 'pending' check(status in ('pending','accepted','declined','countered','expired','invalidated')),
 expires_at timestamptz not null default(now()+interval '24 hours'),created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),unique(proposer_id,request_id),check(proposer_id<>recipient_id)
);
create index marketplace_offers_thread_idx on private.marketplace_offers(thread_id,created_at desc);
create index marketplace_offers_party_idx on private.marketplace_offers(recipient_id,status,expires_at);
create table private.marketplace_notifications (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 event_key text not null,event_type text not null,thread_id uuid references private.marketplace_threads(id),
 read_at timestamptz,created_at timestamptz not null default now(),unique(user_id,event_key)
);
create index marketplace_notifications_user_idx on private.marketplace_notifications(user_id,created_at desc);
create table private.marketplace_reports (
 id uuid primary key default gen_random_uuid(),reporter_id uuid not null references auth.users(id),
 item_id uuid references public.items(id),message_id uuid references private.marketplace_messages(id),
 reason text not null check(length(reason) between 10 and 1000),status text not null default 'open' check(status in ('open','resolved','dismissed')),
 resolution text,created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references auth.users(id),
 request_id uuid not null,unique(reporter_id,request_id),check(num_nonnulls(item_id,message_id)=1)
);
create index marketplace_reports_queue_idx on private.marketplace_reports(status,created_at);
-- Explicit preview grants never expose drafts publicly. Only isolated commissioning may
-- populate this owner-only allowlist. It cannot publish an item or enable checkout.
create table private.marketplace_rehearsal_access (
 item_id uuid not null references public.items(id),viewer_id uuid not null references auth.users(id),
 primary key(item_id,viewer_id)
);
create table private.marketplace_listing_reviews (
 item_id uuid primary key references public.items(id),listing_version integer not null,
 status text not null check(status in ('pending','approved','rejected')),reason text,
 requested_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id)
);
do $$declare t text;begin foreach t in array array['marketplace_sellers','marketplace_follows','marketplace_blocks','marketplace_threads','marketplace_messages','marketplace_offers','marketplace_notifications','marketplace_reports','marketplace_rehearsal_access','marketplace_listing_reviews'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
end loop;end$$;

create function private.marketplace_require_user() returns uuid language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;return auth.uid();end$$;
create function private.marketplace_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.marketplace_blocks where (user_id=a and blocked_id=b) or (user_id=b and blocked_id=a))$$;
create function private.marketplace_visible(p_item uuid,p_viewer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.items i where i.id=p_item and i.sale_mode='peer_to_peer' and (
 (i.status='listed' and i.published_at is not null) or
 (current_database()='shikimomo_staging' and i.status='listing_preparation' and exists(select 1 from private.marketplace_rehearsal_access a where a.item_id=i.id and a.viewer_id=p_viewer))))$$;
create function private.marketplace_notify(p_user uuid,p_key text,p_type text,p_thread uuid) returns void language sql security definer set search_path='' as $$
 insert into private.marketplace_notifications(user_id,event_key,event_type,thread_id) values(p_user,p_key,p_type,p_thread) on conflict do nothing$$;
create function private.marketplace_offer_valid(p_lines jsonb,p_seller uuid,p_buyer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(count(*)=jsonb_array_length(p_lines) and bool_and(coalesce(i.id is not null and i.owner_id=p_seller and i.listed_price_cents>=800 and i.listing_version=(l->>'version')::integer
 and i.listed_price_cents=(l->>'price')::integer and private.marketplace_visible(i.id,p_buyer)
 and not exists(select 1 from public.inventory_reservations r where r.item_id=i.id and r.status='active')
 and not exists(select 1 from public.order_items oi where oi.item_id=i.id),false)),false)
 from jsonb_array_elements(p_lines) l left join public.items i on i.id=(l->>'id')::uuid$$;

create function public.save_marketplace_seller(p_name text,p_city text,p_bio text,p_business text,p_vacation boolean,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$declare u uuid:=private.marketplace_require_user();s private.marketplace_sellers%rowtype;begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,7401));
 if p_name is null or length(trim(p_name)) not between 2 and 60 or p_city is null or length(trim(p_city)) not between 2 and 80 or p_bio is null or length(p_bio)>500 or p_business is null or p_business not in ('individual','business') or p_vacation is null then raise exception 'Invalid seller profile';end if;
 select * into s from private.marketplace_sellers where user_id=u for update;
 if (s.id is null and p_version is distinct from 0) or (s.id is not null and s.version is distinct from p_version) then raise exception 'Profile changed';end if;
 insert into private.marketplace_sellers(user_id,display_name,city,bio,business_type,vacation) values(u,trim(p_name),trim(p_city),trim(p_bio),p_business,p_vacation)
 on conflict(user_id) do update set display_name=excluded.display_name,city=excluded.city,bio=excluded.bio,business_type=excluded.business_type,vacation=excluded.vacation,version=private.marketplace_sellers.version+1,updated_at=now() returning * into s;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(u,'marketplace.seller_profile_saved','seller',s.id::text,jsonb_build_object('version',s.version,'vacation',s.vacation),'Public display profile; no bank or identity documents');
 return jsonb_build_object('id',s.id,'version',s.version);end$$;
create function public.marketplace_store(p_seller uuid,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$declare s private.marketplace_sellers%rowtype;begin
 select * into s from private.marketplace_sellers where id=p_seller;if s.id is null then return null;end if;
 return jsonb_build_object('id',s.id,'name',s.display_name,'city',s.city,'bio',s.bio,'businessType',s.business_type,'vacation',s.vacation,
 'followed',exists(select 1 from private.marketplace_follows where user_id=auth.uid() and seller_id=s.id),
 'items',coalesce((select jsonb_agg(x) from(select i.id,i.name,i.brand,i.category,i.size,i.item_condition,i.listed_price_cents as price,i.listing_version as version,
 case when i.published_at is not null then i.photo_urls else '{}'::text[] end as photos from public.items i where i.owner_id=s.user_id and private.marketplace_visible(i.id,auth.uid()) order by i.created_at desc,i.id limit 24 offset (greatest(1,least(coalesce(p_page,1),10000))-1)*24)x),'[]'::jsonb));end$$;
create function public.marketplace_follow(p_seller uuid,p_follow boolean) returns void language plpgsql security definer set search_path='' as $$declare u uuid:=private.marketplace_require_user();v uuid;begin
 select user_id into v from private.marketplace_sellers where id=p_seller;if v is null or v=u or p_follow is null or private.marketplace_blocked(u,v) then raise exception 'Seller unavailable';end if;
 if p_follow then insert into private.marketplace_follows(user_id,seller_id) values(u,p_seller) on conflict do nothing;else delete from private.marketplace_follows where user_id=u and seller_id=p_seller;end if;end$$;

create function public.marketplace_start_thread(p_item uuid) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.marketplace_require_user();s uuid;t uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,7402));
 select owner_id into s from public.items where id=p_item;
 if s is null or s=u or not private.marketplace_visible(p_item,u) or private.marketplace_blocked(u,s) then raise exception 'Item unavailable';end if;
 select id into t from private.marketplace_threads where item_id=p_item and buyer_id=u;if t is not null then return t;end if;
 if (select count(*) from private.marketplace_threads where buyer_id=u and created_at>now()-interval '1 hour')>=20 then raise exception 'Please wait before starting more conversations';end if;
 insert into private.marketplace_threads(item_id,buyer_id,seller_id) values(p_item,u,s) returning id into t;return t;end$$;
create function public.marketplace_send_message(p_thread uuid,p_body text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();t private.marketplace_threads%rowtype;m private.marketplace_messages%rowtype;v uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,7403));
 select * into t from private.marketplace_threads where id=p_thread and u in(buyer_id,seller_id) for update;
 if t.id is null or private.marketplace_blocked(t.buyer_id,t.seller_id) then raise exception 'Conversation unavailable';end if;
 if p_request is null or p_body is null or length(trim(p_body)) not between 1 and 2000 then raise exception 'Message must contain 1-2000 characters';end if;
 select * into m from private.marketplace_messages where sender_id=u and request_id=p_request;
 if m.id is not null then if m.thread_id<>t.id or m.body<>trim(p_body) or m.kind<>'user' then raise exception 'Request already used';end if;return m.id;end if;
 if (select count(*) from private.marketplace_messages where sender_id=u and created_at>now()-interval '1 minute')>=10 or (select count(*) from private.marketplace_messages where sender_id=u and created_at>now()-interval '1 hour')>=120 then raise exception 'Message rate limit';end if;
 insert into private.marketplace_messages(thread_id,sender_id,kind,body,request_id) values(t.id,u,'user',trim(p_body),p_request) returning id into v;
 update private.marketplace_threads set updated_at=now() where id=t.id;
 perform private.marketplace_notify(case when u=t.buyer_id then t.seller_id else t.buyer_id end,'message:'||v,'message',t.id);return v;end$$;
create function public.marketplace_block(p_thread uuid,p_block boolean) returns void language plpgsql security definer set search_path='' as $$declare u uuid:=private.marketplace_require_user();v uuid;begin
 select case when buyer_id=u then seller_id else buyer_id end into v from private.marketplace_threads where id=p_thread and u in(buyer_id,seller_id) for update;
 if v is null or p_block is null then raise exception 'Conversation unavailable';end if;
 if p_block then insert into private.marketplace_blocks(user_id,blocked_id) values(u,v) on conflict do nothing;else delete from private.marketplace_blocks where user_id=u and blocked_id=v;end if;end$$;
create function public.marketplace_read_thread(p_thread uuid) returns void language plpgsql security definer set search_path='' as $$declare u uuid:=private.marketplace_require_user();begin
 update private.marketplace_threads set buyer_read_at=case when buyer_id=u then now() else buyer_read_at end,seller_read_at=case when seller_id=u then now() else seller_read_at end where id=p_thread and u in(buyer_id,seller_id);
 if not found then raise exception 'Conversation unavailable';end if;
 update private.marketplace_notifications set read_at=now() where user_id=u and thread_id=p_thread and read_at is null;end$$;

create function public.marketplace_make_offer(p_thread uuid,p_items uuid[],p_amount integer,p_parent uuid,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();t private.marketplace_threads%rowtype;o private.marketplace_offers%rowtype;prior private.marketplace_offers%rowtype;ls jsonb;v uuid;r uuid;pv integer;policy jsonb;hours integer;begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,7404));
 select * into t from private.marketplace_threads where id=p_thread and u in(buyer_id,seller_id) for update;
 if t.id is null or private.marketplace_blocked(t.buyer_id,t.seller_id) then raise exception 'Conversation unavailable';end if;
 if p_request is null or p_items is null or array_length(p_items,1) is null or cardinality(p_items) not between 1 and 20 or array_position(p_items,null) is not null or cardinality(p_items)<>(select count(distinct x) from unnest(p_items)x) or not(t.item_id=any(p_items)) or p_amount is null or p_amount not between 800 and 100000000 then raise exception 'Invalid offer';end if;
 select * into prior from private.marketplace_offers where proposer_id=u and request_id=p_request;
 if prior.id is not null then
 if prior.thread_id<>p_thread or prior.amount_cents<>p_amount or prior.parent_id is distinct from p_parent or (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(prior.lines)x)<>(select array_agg(x order by x) from unnest(p_items)x) then raise exception 'Request already used';end if;return prior.id;end if;
 perform 1 from private.marketplace_sellers where user_id=t.seller_id for share;
 if exists(select 1 from private.marketplace_sellers where user_id=t.seller_id and vacation) then raise exception 'Seller is on vacation';end if;
 if (select count(*) from private.marketplace_offers where proposer_id=u and created_at>now()-interval '1 hour')>=30 then raise exception 'Offer rate limit';end if;
 -- Sorted inventory locks coordinate offers with version edits and future checkout.
 perform 1 from public.items where id=any(p_items) order by id for update;
 select jsonb_agg(jsonb_build_object('id',i.id,'version',i.listing_version,'price',i.listed_price_cents,'name',i.name) order by i.id) into ls from public.items i where i.id=any(p_items);
 if ls is null or jsonb_array_length(ls)<>cardinality(p_items) or not private.marketplace_offer_valid(ls,t.seller_id,t.buyer_id) then raise exception 'Bundle changed or unavailable';end if;
 if p_parent is not null then
 select * into o from private.marketplace_offers where id=p_parent and thread_id=t.id for update;
 if o.id is null or o.recipient_id<>u or o.status<>'pending' or o.expires_at<=now() or (select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(o.lines)x)<>(select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(ls)x) then raise exception 'Offer unavailable';end if;
 update private.marketplace_offers set status='countered',updated_at=now() where id=o.id;
 end if;
 select version,value into pv,policy from public.business_setting_versions where setting_key='marketplace_policy' and effective_at<=now() order by version desc limit 1;
 hours:=(policy->>'offerHours')::integer;if pv is null or hours is null or hours not between 1 and 168 then raise exception 'Offer policy unavailable';end if;
 r:=case when u=t.buyer_id then t.seller_id else t.buyer_id end;
 insert into private.marketplace_offers(thread_id,buyer_id,seller_id,proposer_id,recipient_id,amount_cents,lines,parent_id,request_id,policy_version,policy_snapshot,expires_at) values(t.id,t.buyer_id,t.seller_id,u,r,p_amount,ls,p_parent,p_request,pv,jsonb_build_object('offerHours',hours,'commercialApproved',coalesce((policy->>'commercialApproved')::boolean,false)),now()+hours*interval '1 hour') returning id into v;
 insert into private.marketplace_messages(thread_id,sender_id,kind,body,request_id) values(t.id,null,case when p_parent is null then 'offer_created' else 'offer_countered' end,v::text,gen_random_uuid());
 update private.marketplace_threads set updated_at=now() where id=t.id;
 perform private.marketplace_notify(r,'offer:'||v,'offer',t.id);return v;end$$;
create function public.marketplace_respond_offer(p_offer uuid,p_accept boolean) returns text language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();o private.marketplace_offers%rowtype;t private.marketplace_threads%rowtype;v text;begin
 -- Thread first, then inventory then offer: consistent with counteroffer lock order.
 select t0.* into t from private.marketplace_threads t0 join private.marketplace_offers o0 on o0.thread_id=t0.id where o0.id=p_offer and u in(t0.buyer_id,t0.seller_id) for update of t0;
 if t.id is null then raise exception 'Offer unavailable';end if;
 perform 1 from private.marketplace_sellers where user_id=t.seller_id for share;
 perform 1 from public.items where id in(select (l->>'id')::uuid from private.marketplace_offers x,jsonb_array_elements(x.lines)l where x.id=p_offer) order by id for update;
 select * into o from private.marketplace_offers where id=p_offer and recipient_id=u for update;
 if o.id is null or p_accept is null then raise exception 'Offer unavailable';end if;
 if o.status in('accepted','declined') then if (o.status='accepted')<>p_accept then raise exception 'Offer already resolved';end if;return o.status;end if;
 if o.status<>'pending' then return o.status;end if;
 if o.expires_at<=now() then v:='expired';
 elsif private.marketplace_blocked(o.buyer_id,o.seller_id) or exists(select 1 from private.marketplace_sellers where user_id=o.seller_id and vacation) or not private.marketplace_offer_valid(o.lines,o.seller_id,o.buyer_id) then v:='invalidated';
 else v:=case when p_accept then 'accepted' else 'declined' end;end if;
 update private.marketplace_offers set status=v,updated_at=now() where id=o.id;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(u,'marketplace.offer_response','offer',o.id::text,jsonb_build_object('status',v),'Negotiation only: no inventory reservation, charge or payment confirmation');
 if v in ('accepted','declined') then
 insert into private.marketplace_messages(thread_id,kind,body,request_id) values(t.id,case when v='accepted' then 'offer_accepted' else 'offer_declined' end,o.id::text,gen_random_uuid());
 perform private.marketplace_notify(o.proposer_id,'response:'||o.id,v,t.id);end if;return v;end$$;

create function public.marketplace_report(p_item uuid,p_message uuid,p_reason text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.marketplace_require_user();r private.marketplace_reports%rowtype;v uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,7405));
 if num_nonnulls(p_item,p_message)<>1 or p_request is null or p_reason is null or length(trim(p_reason)) not between 10 and 1000 then raise exception 'Describe the issue';end if;
 if p_item is not null and not private.marketplace_visible(p_item,u) and not exists(select 1 from public.items where id=p_item and owner_id=u) then raise exception 'Item unavailable';end if;
 if p_message is not null and not exists(select 1 from private.marketplace_messages m join private.marketplace_threads t on t.id=m.thread_id where m.id=p_message and u in(t.buyer_id,t.seller_id)) then raise exception 'Message unavailable';end if;
 select * into r from private.marketplace_reports where reporter_id=u and request_id=p_request;
 if r.id is not null then if r.item_id is distinct from p_item or r.message_id is distinct from p_message or r.reason<>trim(p_reason) then raise exception 'Request already used';end if;return r.id;end if;
 if(select count(*) from private.marketplace_reports where reporter_id=u and created_at>now()-interval '1 hour')>=20 then raise exception 'Report rate limit';end if;
 insert into private.marketplace_reports(reporter_id,item_id,message_id,reason,request_id) values(u,p_item,p_message,trim(p_reason),p_request) returning id into v;return v;end$$;

create function public.marketplace_workspace(p_thread uuid default null,p_before timestamptz default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare u uuid:=private.marketplace_require_user();t private.marketplace_threads%rowtype;begin
 if p_thread is not null then select * into t from private.marketplace_threads where id=p_thread and u in(buyer_id,seller_id);if t.id is null then raise exception 'Conversation unavailable';end if;end if;
 return jsonb_build_object('self',u,'profile',(select jsonb_build_object('id',s.id,'name',s.display_name,'city',s.city,'bio',s.bio,'businessType',s.business_type,'vacation',s.vacation,'version',s.version) from private.marketplace_sellers s where user_id=u),
 'shops',coalesce((select jsonb_agg(x) from(select s.id,s.display_name as name,s.city from private.marketplace_sellers s where exists(select 1 from public.items i where i.owner_id=s.user_id and private.marketplace_visible(i.id,u)) order by s.created_at desc limit 30)x),'[]'::jsonb),
 'following',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name)) from private.marketplace_follows f join private.marketplace_sellers s on s.id=f.seller_id where f.user_id=u),'[]'::jsonb),
 'threads',coalesce((select jsonb_agg(x) from(select t0.id,t0.item_id,i.name as item_name,t0.buyer_id=u as is_buyer,s.display_name as seller_name,t0.updated_at,
 (select count(*) from private.marketplace_messages m where m.thread_id=t0.id and (m.sender_id is distinct from u) and m.created_at>coalesce(case when t0.buyer_id=u then t0.buyer_read_at else t0.seller_read_at end,'epoch')) as unread
 from private.marketplace_threads t0 join public.items i on i.id=t0.item_id left join private.marketplace_sellers s on s.user_id=t0.seller_id
 where u in(t0.buyer_id,t0.seller_id) and (p_before is null or t0.updated_at<p_before) order by t0.updated_at desc,t0.id limit 30)x),'[]'::jsonb),
 'thread',case when t.id is null then null else jsonb_build_object('id',t.id,'item',t.item_id,'isBuyer',t.buyer_id=u,'blocked',private.marketplace_blocked(t.buyer_id,t.seller_id),'blockedByMe',exists(select 1 from private.marketplace_blocks b where b.user_id=u and b.blocked_id=case when t.buyer_id=u then t.seller_id else t.buyer_id end),'store',(select s.id from private.marketplace_sellers s where s.user_id=t.seller_id),'peerReadAt',case when t.buyer_id=u then t.seller_read_at else t.buyer_read_at end) end,
 'messages',coalesce((select jsonb_agg(x order by x.created_at,x.id) from(select m.id,m.kind,m.body,m.sender_id=u as mine,m.created_at from private.marketplace_messages m where m.thread_id=t.id order by m.created_at desc,m.id desc limit 50)x),'[]'::jsonb),
 'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'amount',o.amount_cents,'lines',o.lines,'parent',o.parent_id,'mine',o.proposer_id=u,'status',case when o.status in('pending','accepted') and o.expires_at<=now() then 'expired' when o.status in('pending','accepted') and not private.marketplace_offer_valid(o.lines,o.seller_id,o.buyer_id) then 'invalidated' else o.status end,'expires',o.expires_at,'created',o.created_at) order by o.created_at desc) from (select * from private.marketplace_offers where thread_id=t.id order by created_at desc limit 50)o),'[]'::jsonb),
 'notifications',coalesce((select jsonb_agg(x) from(select id,event_type,thread_id,read_at,created_at from private.marketplace_notifications where user_id=u order by created_at desc limit 30)x),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'version',r.listing_version,'currentVersion',i.listing_version,'status',r.status,'reason',r.reason)) from private.marketplace_listing_reviews r join public.items i on i.id=r.item_id where i.owner_id=u),'[]'::jsonb));end$$;
create function public.marketplace_request_review(p_item uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$declare u uuid:=private.marketplace_require_user();i public.items%rowtype;begin
 select * into i from public.items where id=p_item and owner_id=u and sale_mode='peer_to_peer' and status='listing_preparation' for update;
 if i.id is null or i.listing_version is distinct from p_version then raise exception 'Draft changed';end if;
 if not exists(select 1 from private.marketplace_sellers where user_id=u) or not exists(select 1 from public.clothing_listing_evidence e where e.item_id=i.id and e.evidence_source='seller' and e.listing_version=i.listing_version) or i.listed_price_cents is null or i.listed_price_cents<800 then raise exception 'Complete profile, price, photos and disclosures first';end if;
 if exists(select 1 from private.marketplace_listing_reviews where item_id=i.id and listing_version=i.listing_version and status in('pending','approved')) then return;end if;
 if exists(select 1 from private.marketplace_listing_reviews where item_id=i.id and listing_version=i.listing_version and status='rejected') then raise exception 'Revise the listing before requesting again';end if;
 insert into private.marketplace_listing_reviews(item_id,listing_version,status) values(i.id,i.listing_version,'pending') on conflict(item_id) do update set listing_version=excluded.listing_version,status='pending',reason=null,requested_at=now(),reviewed_at=null,reviewed_by=null;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(u,'marketplace.review_requested','item',i.id::text,jsonb_build_object('version',i.listing_version),'Content moderation request; no physical inspection or publication');end$$;
create function public.admin_marketplace_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2' or not public.can_manage_items() then raise exception 'Moderation capability with MFA required';end if;
 return jsonb_build_object('reviews',coalesce((select jsonb_agg(x) from(select r.item_id,r.listing_version,r.status,r.requested_at,i.name,i.description,i.condition_notes from private.marketplace_listing_reviews r join public.items i on i.id=r.item_id where r.status='pending' order by r.requested_at limit 100)x),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(x) from(select r.id,r.item_id,r.message_id,r.reason,r.created_at,m.body as reported_message from private.marketplace_reports r left join private.marketplace_messages m on m.id=r.message_id where r.status='open' order by r.created_at limit 100)x),'[]'::jsonb));end$$;
create function public.admin_marketplace_moderate(p_kind text,p_id uuid,p_version integer,p_approve boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare old jsonb;begin
 if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2' or not public.can_manage_items() then raise exception 'Moderation capability with MFA required';end if;
 if p_approve is null or p_reason is null or length(trim(p_reason)) not between 10 and 1000 then raise exception 'Reason required';end if;
 if p_kind='listing' then
 perform 1 from public.items where id=p_id and listing_version=p_version for update;if not found then raise exception 'Listing changed';end if;
 select to_jsonb(r) into old from private.marketplace_listing_reviews r where item_id=p_id and listing_version=p_version and status='pending' for update;if old is null then raise exception 'Review unavailable';end if;
 update private.marketplace_listing_reviews set status=case when p_approve then 'approved' else 'rejected' end,reason=trim(p_reason),reviewed_at=now(),reviewed_by=auth.uid() where item_id=p_id;
 perform private.marketplace_notify((select owner_id from public.items where id=p_id),'review:'||p_id||':'||p_version,case when p_approve then 'listing_approved' else 'listing_changes_requested' end,null);
 elsif p_kind='report' then
 select to_jsonb(r) into old from private.marketplace_reports r where id=p_id and status='open' for update;if old is null then raise exception 'Report unavailable';end if;
 update private.marketplace_reports set status=case when p_approve then 'resolved' else 'dismissed' end,resolution=trim(p_reason),resolved_at=now(),resolved_by=auth.uid() where id=p_id;
 else raise exception 'Invalid moderation action';end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason) values(auth.uid(),'marketplace.moderated',p_kind,p_id::text,old,jsonb_build_object('approved',p_approve,'version',p_version),trim(p_reason));end$$;
-- Explicit RPC-only API. No raw chat, private address, moderation or financial grants.
do $$declare r record;begin for r in select p.oid::regprocedure as sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'marketplace_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);end loop;
 for r in select p.oid::regprocedure as sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'marketplace_%' or p.proname in ('save_marketplace_seller','admin_marketplace_queue','admin_marketplace_moderate')) loop
 execute format('revoke all on function %s from public,anon,authenticated',r.sig);execute format('grant execute on function %s to authenticated',r.sig);end loop;
end$$;
grant execute on function public.marketplace_store(uuid,integer) to anon;
-- The newly merged admin AI Pricing trigger is managed-only. Direct price authority
-- stays with the owner; direct drafts cannot attach a managed pricing decision.
create function private.guard_direct_pricing_decision() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.sale_mode='peer_to_peer' and to_jsonb(new)->>'pricing_approval_id' is not null then raise exception 'Direct items cannot attach managed price approvals';end if;return new;end$$;
revoke all on function private.guard_direct_pricing_decision() from public,anon,authenticated;
create trigger zy_direct_pricing_decision before insert or update on public.items for each row execute function private.guard_direct_pricing_decision();
do $$begin if to_regprocedure('private.guard_pricing_approval()') is not null then
 execute 'drop trigger zz_pricing_approval_guard on public.items';
 execute $q$create trigger zz_pricing_approval_guard before insert or update on public.items for each row when(new.sale_mode='managed_consignment') execute function private.guard_pricing_approval()$q$;
end if;end$$;
create function public.my_managed_priced_items() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.marketplace_require_user();
 return coalesce((select jsonb_agg(x) from jsonb_array_elements(public.my_priced_items())x join public.items i on i.id=(x->>'id')::uuid where i.owner_id=auth.uid() and i.sale_mode='managed_consignment'),'[]'::jsonb);end$$;
revoke all on function public.my_managed_priced_items() from public,anon;
grant execute on function public.my_managed_priced_items() to authenticated;
-- Public seller link contains a random shop ID, never a raw owner/address record.
create function public.marketplace_item_shop(p_item uuid) returns uuid language sql stable security definer set search_path='' as $$
 select s.id from public.items i join private.marketplace_sellers s on s.user_id=i.owner_id where i.id=p_item and private.marketplace_visible(i.id,auth.uid())$$;
revoke all on function public.marketplace_item_shop(uuid) from public,anon,authenticated;
grant execute on function public.marketplace_item_shop(uuid) to anon,authenticated;
