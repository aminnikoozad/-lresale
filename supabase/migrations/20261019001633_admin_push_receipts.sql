alter table private.admin_push_jobs add column received_at timestamptz,add column shown_at timestamptz,add column display_error text;
create function public.record_admin_push_receipt(p_job uuid,p_displayed boolean,p_error text)
returns void language sql security definer set search_path='' as $$
 update private.admin_push_jobs set received_at=coalesce(received_at,now()),
 shown_at=case when p_displayed then coalesce(shown_at,now()) else shown_at end,
 display_error=case when p_displayed then null else left(p_error,100) end where id=p_job;
$$;
revoke all on function public.record_admin_push_receipt(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.record_admin_push_receipt(uuid,boolean,text) to service_role;
