-- Public availability contains no credentials or private model configuration.
create table public.smart_shop_settings (
 id smallint primary key default 1 check(id=1),
 enabled boolean not null default false,
 chat_enabled boolean not null default true,
 voice_enabled boolean not null default true,
 memory_enabled boolean not null default true,
 notice_en text not null default 'Smart Shopping is coming soon.' check(length(notice_en)<=300),
 notice_fr text not null default 'L’achat intelligent sera bientôt disponible.' check(length(notice_fr)<=300),
 updated_at timestamptz not null default now()
);
alter table public.smart_shop_settings enable row level security;
revoke all on public.smart_shop_settings from public,anon,authenticated;
grant select on public.smart_shop_settings to anon,authenticated;
grant update(enabled,chat_enabled,voice_enabled,memory_enabled,notice_en,notice_fr) on public.smart_shop_settings to authenticated;
grant all on public.smart_shop_settings to service_role;
create policy smart_shop_public_status on public.smart_shop_settings for select to anon,authenticated using(true);
create policy smart_shop_admin_update on public.smart_shop_settings for update to authenticated
 using(auth.uid() is not null and public.can_manage_selling_rules() and auth.jwt()->>'aal'='aal2')
 with check(auth.uid() is not null and public.can_manage_selling_rules() and auth.jwt()->>'aal'='aal2');
insert into public.smart_shop_settings(id) values(1);
create table public.smart_shop_settings_audit (
 id uuid primary key default gen_random_uuid(),
 changed_at timestamptz not null default now(),
 changed_by uuid references auth.users(id) on delete set null,
 settings jsonb not null
);
alter table public.smart_shop_settings_audit enable row level security;
revoke all on public.smart_shop_settings_audit from public,anon,authenticated;
grant select on public.smart_shop_settings_audit to authenticated;
grant all on public.smart_shop_settings_audit to service_role;
create policy smart_shop_admin_audit on public.smart_shop_settings_audit for select to authenticated
 using(auth.uid() is not null and public.can_manage_selling_rules() and auth.jwt()->>'aal'='aal2');
create function public.smart_shop_record_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.updated_at=now();
 insert into public.smart_shop_settings_audit(changed_by,settings) values(auth.uid(),to_jsonb(new));
 return new;
end $$;
revoke all on function public.smart_shop_record_change() from public,anon,authenticated;
create trigger smart_shop_audit before update on public.smart_shop_settings for each row execute function public.smart_shop_record_change();
