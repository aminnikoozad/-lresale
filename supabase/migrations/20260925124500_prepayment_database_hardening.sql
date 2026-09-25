create index if not exists customer_account_updates_author_id_idx on public.customer_account_updates(author_id);
create index if not exists item_sale_records_recorded_by_idx on public.item_sale_records(recorded_by);
create index if not exists item_sale_records_seller_id_idx on public.item_sale_records(seller_id);
create index if not exists order_seller_credits_item_id_idx on public.order_seller_credits(item_id);

alter table public.product_questions
  drop constraint if exists product_questions_question_length_chk,
  drop constraint if exists product_questions_email_length_chk;

alter table public.product_questions
  add constraint product_questions_question_length_chk check (char_length(trim(question)) between 10 and 2000),
  add constraint product_questions_email_length_chk check (char_length(trim(email)) between 3 and 254);

-- The current storefront no longer exposes product-question submission. Keep the
-- legacy routine available only for trusted server-side/service-role use so an
-- unauthenticated caller cannot use it as an abuse or denial-of-service surface.
revoke all on function public.submit_product_question(uuid,text,text) from public, anon, authenticated;
grant execute on function public.submit_product_question(uuid,text,text) to service_role;
