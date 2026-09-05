alter table public.collection_requests drop constraint if exists collection_minimum_value;
alter table public.collection_requests add constraint collection_minimum_value
  check (estimated_resale_value_cents between 1 and 100000000);

create or replace function private.guard_collection_minimum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_minimum integer;
begin
  if new.status = 'submitted' then
    configured_minimum := (public.get_selling_rules() ->> 'minimumPickupEstimatedValueCents')::integer;
    if new.estimated_resale_value_cents < configured_minimum then
      raise exception 'Collection is below the current minimum pickup estimated value';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_collection_minimum() from public, anon, authenticated;
drop trigger if exists collection_requests_guard_minimum on public.collection_requests;
create trigger collection_requests_guard_minimum
before insert or update of estimated_resale_value_cents, status on public.collection_requests
for each row execute function private.guard_collection_minimum();
