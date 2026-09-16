-- Defense in depth: remove authenticated table privileges for operations that
-- have no authenticated RLS policy. Such operations were already denied by RLS;
-- these revokes make the privilege layer match the actual authorization model.

revoke update, delete on public.ai_admin_messages from authenticated;
revoke delete on public.ai_behavior_rules from authenticated;
revoke insert, update, delete on public.ai_feedback from authenticated;
revoke insert, update, delete on public.ai_rule_versions from authenticated;
revoke insert, update, delete on public.ai_training_actions from authenticated;
revoke delete on public.ai_training_drafts from authenticated;
revoke delete on public.knowledge_base from authenticated;
revoke insert, update, delete on public.knowledge_base_versions from authenticated;
revoke insert, update, delete on public.support_assignments from authenticated;
revoke insert, update, delete on public.support_categories from authenticated;
revoke insert, update, delete on public.support_notification_deliveries from authenticated;
revoke insert, delete on public.support_notifications from authenticated;
revoke select, insert, update, delete on public.support_rate_limit_events from authenticated;
