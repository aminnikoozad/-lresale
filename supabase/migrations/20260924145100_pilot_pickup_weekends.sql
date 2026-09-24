-- Keep the pilot pickup schedule aligned with the approved weekend-only operating plan.
update public.pilot_settings
set pickup_days = array[0,6]::integer[],
    updated_at = now()
where id;
