create policy item_rule_overrides_admin_select
on public.item_rule_overrides for select
to authenticated
using (public.can_manage_items());

grant select on public.item_rule_overrides to authenticated;
