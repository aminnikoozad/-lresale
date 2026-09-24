-- Keep all seller approval paths on the same review-window publishing behavior.
-- Existing approval and commission-lock rules remain unchanged.

create or replace function private.defer_rewear_auto_publish_to_review_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.seller_pricing_approved_at is null and new.seller_pricing_approved_at is not null then
    update public.item_operations
       set auto_publish_enabled = true,
           auto_publish_at = coalesce(review_deadline_at, now())
     where item_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_items_defer_auto_publish_to_review_deadline on public.items;
create trigger zz_items_defer_auto_publish_to_review_deadline
after update of seller_pricing_approved_at on public.items
for each row
when (old.seller_pricing_approved_at is null and new.seller_pricing_approved_at is not null)
execute function private.defer_rewear_auto_publish_to_review_deadline();
