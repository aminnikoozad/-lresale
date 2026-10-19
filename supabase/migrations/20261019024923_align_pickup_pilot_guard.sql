create or replace function private.pilot_pickup_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.pilot_settings%rowtype; slot_start timestamptz; calendar_slot boolean;
begin
 select * into cfg from public.pilot_settings where id;
 if cfg.enabled then
  if not(new.category=any(cfg.categories)) and not(new.category='clothing' and array['women','men','kids']::text[] <@ cfg.categories) then raise exception 'Category paused for pilot';end if;
  select window_start,calendar_managed into slot_start,calendar_slot from public.pickup_slots where id=new.pickup_slot_id;
  if slot_start is null or (not coalesce(calendar_slot,false) and not(extract(dow from slot_start at time zone 'America/Toronto')::integer=any(cfg.pickup_days))) then raise exception 'Pickup day unavailable during pilot';end if;
 end if;
 if exists(select 1 from public.profiles where id=new.user_id and free_pickup_status='suspended') then raise exception 'Pickup temporarily suspended: contact support';end if;
 return new;
end; $$;
