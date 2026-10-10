-- Expand the original women-only pilot to Women, Men and Kids.
-- No inventory, pricing, fees, pickup schedule, cap, permissions or inspection
-- rules are changed. Explicitly customized category selections are preserved.
alter table public.pilot_settings
  alter column categories set default array['women','men','kids']::text[];

update public.pilot_settings
set categories = array['women','men','kids']::text[],
    updated_at = now()
where id = true and categories = array['women']::text[];
