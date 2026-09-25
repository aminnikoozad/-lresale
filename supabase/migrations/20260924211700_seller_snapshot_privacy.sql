begin;

create or replace function public.seller_operations_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    else jsonb_build_object(
      'items',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'itemId', i.id,
            'itemCode', o.item_code,
            'name', i.name,
            'status', i.status,
            'stage', o.stage,
            'reviewReadyAt', o.review_ready_at,
            'reviewDeadlineAt', o.review_deadline_at,
            'autoPublishAt', o.auto_publish_at,
            'publishedAt', i.published_at,
            'lastChanceAt', o.last_chance_at,
            'sellingExpiresAt', o.selling_expires_at,
            'listedPriceCents', i.listed_price_cents,
            'initialPriceCents', i.initial_approved_price_cents,
            'dispositionPreference', i.seller_disposition_preference,
            'rejectionReason', case when i.status = 'rejected' then i.seller_rejection_reason else null end,
            'rejectionPhotoUrl', case when i.status = 'rejected' then i.seller_rejection_photo_url else null end,
            'timeline', coalesce((
              select jsonb_agg(ev order by occurred_at desc)
              from (
                select
                  jsonb_build_object(
                    'type', 'status',
                    'label', h.new_status,
                    'at', h.created_at
                  ) ev,
                  h.created_at occurred_at
                from public.item_status_history h
                where h.item_id = i.id

                union all

                select
                  jsonb_build_object(
                    'type', e.event_type,
                    'label', coalesce(e.stage, e.event_type),
                    'at', e.created_at
                  ) ev,
                  e.created_at occurred_at
                from public.item_operation_events e
                where e.item_id = i.id

                order by occurred_at desc
                limit 20
              ) t
            ), '[]'::jsonb)
          )
          order by i.created_at desc
        )
        from public.items i
        join public.item_operations o on o.item_id = i.id
        where i.owner_id = auth.uid()
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.seller_operations_snapshot() from public, anon;
grant execute on function public.seller_operations_snapshot() to authenticated;

commit;
