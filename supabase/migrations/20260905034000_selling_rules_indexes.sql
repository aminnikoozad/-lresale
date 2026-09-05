create index if not exists bundles_owner_created_idx
  on public.bundles (owner_id, created_at desc);

create index if not exists business_setting_versions_created_by_idx
  on public.business_setting_versions (created_by);

create index if not exists item_rule_overrides_item_idx
  on public.item_rule_overrides (item_id, created_at desc);

create index if not exists item_rule_overrides_admin_idx
  on public.item_rule_overrides (admin_user_id, created_at desc);

create index if not exists item_status_history_changed_by_idx
  on public.item_status_history (changed_by, created_at desc);
