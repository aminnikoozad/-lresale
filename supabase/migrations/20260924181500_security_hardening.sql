-- Security/performance hardening identified in the 2026-09-24 audit.
-- These changes preserve authorization semantics while reducing RLS overhead
-- and adding indexes for foreign-key maintenance paths.

create index if not exists pilot_cost_entries_created_by_idx
  on public.pilot_cost_entries (created_by);

create index if not exists return_requests_order_item_order_idx
  on public.return_requests (order_item_id, order_id);

drop policy if exists pilot_work_read on public.pilot_work_logs;
create policy pilot_work_read
  on public.pilot_work_logs
  for select
  to authenticated
  using (
    (select public.can_manage_selling_rules())
    and (((select auth.jwt()) ->> 'aal') = 'aal2')
  );

drop policy if exists pilot_work_write on public.pilot_work_logs;
create policy pilot_work_write
  on public.pilot_work_logs
  for insert
  to authenticated
  with check (
    admin_id = (select auth.uid())
    and (select public.can_manage_selling_rules())
    and (((select auth.jwt()) ->> 'aal') = 'aal2')
  );

drop policy if exists questions_staff on public.product_questions;
create policy questions_staff
  on public.product_questions
  for select
  to authenticated
  using (
    (select public.can_manage_selling_rules())
    and (((select auth.jwt()) ->> 'aal') = 'aal2')
  );

drop policy if exists questions_staff_update on public.product_questions;
create policy questions_staff_update
  on public.product_questions
  for update
  to authenticated
  using (
    (select public.can_manage_selling_rules())
    and (((select auth.jwt()) ->> 'aal') = 'aal2')
  )
  with check (
    (select public.can_manage_selling_rules())
    and (((select auth.jwt()) ->> 'aal') = 'aal2')
  );
