-- Cover the item operations audit actor foreign key for delete/update maintenance.
create index if not exists item_operation_events_changed_by_idx
  on public.item_operation_events(changed_by)
  where changed_by is not null;
