create index collection_requests_service_area_idx
on public.collection_requests (service_area_id);

create index collection_requests_pickup_slot_idx
on public.collection_requests (pickup_slot_id);
