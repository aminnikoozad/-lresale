-- The real role constraint permits logistics, not pickup_logistics. Native API
-- testing proved explicitly pickup-authorized logistics staff could manage a
-- pickup but could not read it for the inbox/Realtime. Add only that demonstrated
-- role+capability combination; preserve existing intake readers and own reads.
begin;

alter policy collection_requests_select_authenticated
on public.collection_requests
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.admin_roles ar
    where ar.user_id = (select auth.uid())
      and (
        ar.role in ('owner','admin','operations_manager','warehouse')
        or (ar.role='logistics' and ar.can_manage_pickups)
      )
      and (not ar.require_mfa or coalesce((select auth.jwt())->>'aal','aal1')='aal2')
  )
);

commit;
