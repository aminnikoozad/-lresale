create index if not exists pickup_reminder_settings_updated_by_idx on public.pickup_reminder_settings(updated_by);
create index if not exists shipping_settings_updated_by_idx on public.shipping_settings(updated_by);
create index if not exists support_business_hour_exceptions_created_by_idx on public.support_business_hour_exceptions(created_by);

drop policy if exists notif_prefs_own on public.admin_notification_preferences;
create policy notif_prefs_own on public.admin_notification_preferences for all to authenticated
using ((admin_id = (select auth.uid())) and private.is_support_admin())
with check ((admin_id = (select auth.uid())) and private.is_support_admin());

drop policy if exists ai_admin_conversations_own on public.ai_admin_conversations;
create policy ai_admin_conversations_own on public.ai_admin_conversations for all to authenticated
using ((admin_id = (select auth.uid())) and private.support_has_permission('ai.view'))
with check ((admin_id = (select auth.uid())) and private.support_has_permission('ai.view'));

drop policy if exists ai_admin_messages_own_insert on public.ai_admin_messages;
create policy ai_admin_messages_own_insert on public.ai_admin_messages for insert to authenticated
with check ((exists (select 1 from public.ai_admin_conversations c where c.id=ai_admin_messages.conversation_id and c.admin_id=(select auth.uid()))) and private.support_has_permission('ai.view'));

drop policy if exists ai_admin_messages_own_read on public.ai_admin_messages;
create policy ai_admin_messages_own_read on public.ai_admin_messages for select to authenticated
using ((exists (select 1 from public.ai_admin_conversations c where c.id=ai_admin_messages.conversation_id and c.admin_id=(select auth.uid()))) and private.support_has_permission('ai.view'));

drop policy if exists feedback_customer_read on public.ai_feedback;
create policy feedback_customer_read on public.ai_feedback for select to authenticated
using ((customer_id=(select auth.uid())) or private.support_has_permission('ai.view'));

drop policy if exists read_messages on public.support_messages;
create policy read_messages on public.support_messages for select to authenticated
using (exists (select 1 from public.support_conversations c where c.id=support_messages.conversation_id and (c.customer_id=(select auth.uid()) or private.is_support_admin())));

drop policy if exists send_messages on public.support_messages;
create policy send_messages on public.support_messages for insert to authenticated
with check (
  sender_id=(select auth.uid())
  and sender_kind=any(array['customer'::text,'agent'::text])
  and exists (
    select 1 from public.support_conversations c
    where c.id=support_messages.conversation_id
      and (
        (support_messages.sender_kind='customer' and c.customer_id=(select auth.uid()) and c.status<>'closed')
        or (support_messages.sender_kind='agent' and private.is_support_admin() and c.assigned_to=(select auth.uid()) and c.status='human')
      )
  )
);

drop policy if exists notifications_own_read on public.support_notifications;
create policy notifications_own_read on public.support_notifications for select to authenticated
using ((admin_id=(select auth.uid())) and private.is_support_admin());

drop policy if exists notifications_own_update on public.support_notifications;
create policy notifications_own_update on public.support_notifications for update to authenticated
using ((admin_id=(select auth.uid())) and private.is_support_admin())
with check ((admin_id=(select auth.uid())) and private.is_support_admin());

drop policy if exists support_presence_delete on public.support_presence;
create policy support_presence_delete on public.support_presence for delete to authenticated
using (actor_id=(select auth.uid()));

drop policy if exists support_presence_insert on public.support_presence;
create policy support_presence_insert on public.support_presence for insert to authenticated
with check (
  actor_id=(select auth.uid())
  and exists (
    select 1 from public.support_conversations c
    where c.id=support_presence.conversation_id
      and (
        (support_presence.actor_kind='customer' and c.customer_id=(select auth.uid()))
        or (support_presence.actor_kind='agent' and private.is_support_admin())
      )
  )
);

drop policy if exists support_presence_read on public.support_presence;
create policy support_presence_read on public.support_presence for select to authenticated
using (exists (select 1 from public.support_conversations c where c.id=support_presence.conversation_id and (c.customer_id=(select auth.uid()) or private.is_support_admin())));

drop policy if exists support_presence_update on public.support_presence;
create policy support_presence_update on public.support_presence for update to authenticated
using (actor_id=(select auth.uid()))
with check (actor_id=(select auth.uid()));

drop policy if exists push_subscriptions_own on public.support_push_subscriptions;
create policy push_subscriptions_own on public.support_push_subscriptions for all to authenticated
using ((admin_id=(select auth.uid())) and private.is_support_admin())
with check ((admin_id=(select auth.uid())) and private.is_support_admin());
