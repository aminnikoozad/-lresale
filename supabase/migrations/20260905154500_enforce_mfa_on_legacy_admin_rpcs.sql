-- Privileged legacy Admin RPCs must also require AAL2 when MFA is required.

create or replace function public.can_manage_items()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_roles
    where user_id = auth.uid()
      and role in ('owner','admin','operations_manager','warehouse')
      and (not require_mfa or coalesce(auth.jwt() ->> 'aal','aal1') = 'aal2')
  );
$$;

create or replace function public.can_manage_selling_rules()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = auth.uid()
      and (role = 'owner' or can_manage_selling_rules)
      and (not require_mfa or coalesce(auth.jwt() ->> 'aal','aal1') = 'aal2')
  );
$$;

revoke all on function public.can_manage_items() from public;
grant execute on function public.can_manage_items() to authenticated;
revoke all on function public.can_manage_selling_rules() from public;
grant execute on function public.can_manage_selling_rules() to authenticated;
