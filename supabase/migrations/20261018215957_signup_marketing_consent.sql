-- Capture the optional signup choice once; later profile edits cannot re-subscribe anyone.
alter table public.buyer_consent_evidence drop constraint buyer_consent_evidence_source_check;
alter table public.buyer_consent_evidence add constraint buyer_consent_evidence_source_check
 check(source in ('account_preferences','checkout_optional','unsubscribe_link','signup_optional'));

create function private.capture_signup_marketing_consent() returns trigger
language plpgsql security definer set search_path='' as $$
declare marketing boolean;
begin
 if new.raw_user_meta_data->>'marketing_notice_version' is distinct from '2026-10-16'
    or jsonb_typeof(new.raw_user_meta_data->'email_marketing') is distinct from 'boolean' then
  return new;
 end if;
 marketing := (new.raw_user_meta_data->>'email_marketing')::boolean;
 insert into public.buyer_consents(buyer_id,email_marketing,analytics)
 values(new.id,marketing,false) on conflict(buyer_id) do nothing;
 insert into public.buyer_consent_evidence(buyer_id,email_marketing,analytics,notice_version,source)
 values(new.id,marketing,false,'2026-10-16','signup_optional');
 return new;
end $$;
revoke all on function private.capture_signup_marketing_consent() from public,anon,authenticated;
create trigger capture_signup_marketing_consent after insert on auth.users
for each row execute function private.capture_signup_marketing_consent();
