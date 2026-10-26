begin;

-- The owner retired the low-value transportation surcharge. Preserve the one
-- existing processing/pickup service fee and its first-batch promotion.
create or replace function private.retire_pickup_surcharge_setting()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.setting_key='selling_rules' then
    new.value := jsonb_set(new.value, '{pickupRules}',
      coalesce(new.value->'pickupRules','{}'::jsonb) || '{"lowValuePickupItemFeeCents":0}'::jsonb);
  end if;
  return new;
end;
$$;
revoke all on function private.retire_pickup_surcharge_setting() from public,anon,authenticated;
create trigger retire_pickup_surcharge_setting
before insert or update on public.business_setting_versions
for each row execute function private.retire_pickup_surcharge_setting();

-- Version the new rule; historical snapshots stay available for audit.
insert into public.business_setting_versions(setting_key,version,value,effective_at,reason)
select 'selling_rules', coalesce((select max(version) from public.business_setting_versions where setting_key='selling_rules'),0)+1,
  jsonb_set(public.get_selling_rules(),'{pickupRules}',
    coalesce(public.get_selling_rules()->'pickupRules','{}'::jsonb) || '{"lowValuePickupItemFeeCents":0}'::jsonb),
  now(), 'Owner removed the low-value pickup surcharge; retain the existing batch pickup and processing fee';

-- Ignore a retired fee even if an older scheduled version becomes effective.
create or replace function public.get_selling_rules()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_set(value,'{pickupRules}',
    coalesce(value->'pickupRules','{}'::jsonb) || '{"lowValuePickupItemFeeCents":0}'::jsonb)
  from public.business_setting_versions
  where setting_key='selling_rules' and effective_at<=now()
  order by effective_at desc,version desc limit 1;
$$;
revoke execute on function public.get_selling_rules() from public,anon;

create or replace function private.apply_collection_pickup_pricing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pickup_rules jsonb := coalesce(public.get_selling_rules()->'pickupRules','{}'::jsonb);
  bag_minimum integer := greatest(1,coalesce((pickup_rules->>'bagMinimumEstimatedValueCents')::integer,6000));
  priority_threshold integer := greatest(1,coalesce((pickup_rules->>'freePickupThresholdCents')::integer,10000));
begin
  if new.item_count is null or new.item_count<1 then
    raise exception 'A valid item count is required for pickup pricing.';
  end if;
  if new.request_type='bag' and new.estimated_resale_value_cents<bag_minimum then
    raise exception 'Bag or Box requests require at least % cents in estimated resale value.',bag_minimum;
  end if;
  new.pickup_fee_cents := 0;
  -- Retain legacy mode names for compatibility; neither mode adds a charge.
  new.pickup_pricing_mode := case when new.estimated_resale_value_cents>=priority_threshold then 'free_priority' else 'paid_flat' end;
  new.priority_pickup := new.estimated_resale_value_cents>=priority_threshold
    and coalesce((pickup_rules->>'priorityPickupAtOrAboveThreshold')::boolean,true);
  return new;
end;
$$;
revoke all on function private.apply_collection_pickup_pricing() from public,anon,authenticated;

-- Remove obsolete responses from the approved knowledge retrieved by support.
update public.knowledge_base set
  approved_answer='One batch service fee covers pickup and processing, regardless of the estimated resale value. No additional transportation surcharge applies. The current fee and any eligible launch waiver are shown before submission. Collection minimums, service area, available slots and physical inspection still apply.',
  title=case when title='Paid pickup below $100' then 'Pickup and processing fee' else title end
where status='approved' and title in (
  'Paid pickup below $100','Free priority pickup threshold',
  'Standard pickup is an alternative when Bag value is too low',
  'No deposit or card hold for current free pickup','Bag or Box minimum',
  'Pickup status in the customer account');

-- Patch only the pickup policy branch of the existing account-aware assistant.
-- Keep its authorization and all other support actions intact.
do $migration$
declare
  definition text := pg_get_functiondef('private.support_quick_reply(text)'::regprocedure);
  start_at integer;
  end_at integer;
  replacement text := $reply$
    if v_amount_cents is not null or q ~ '(free|fee|cost|minimum|threshold|gratuit|frais|coût|cout)' then
      return case when v_fr then
        'Un seul montant de '||private.support_number_cents(coalesce((v_rules#>>'{pickupRules,processingFeeCents}')::integer,1200))||' $ CAD couvre la collecte et le traitement de chaque nouveau lot. Aucun supplément de transport ne dépend de sa valeur estimée. Une offre de lancement admissible peut exonérer ces frais; le montant final est affiché avant l’envoi de la demande.'
      else
        'One '||private.support_money_cents(coalesce((v_rules#>>'{pickupRules,processingFeeCents}')::integer,1200))||' CAD fee covers pickup and processing per new collection. No extra transportation charge depends on estimated resale value. An eligible launch offer may waive this fee; final fees are shown before submission.' end;
    end if;
  end if;

$reply$;
begin
  start_at := strpos(definition,'    if v_amount_cents is not null and v_free_threshold>0 then');
  end_at := strpos(definition,'  if v_min_item>0 and q ~');
  if start_at=0 or end_at<=start_at then raise exception 'Unexpected support pickup policy definition'; end if;
  definition := substr(definition,1,start_at-1)||replacement||substr(definition,end_at);
  definition := replace(definition,'  v_low_fee integer;','');
  definition := regexp_replace(definition,E'    v_low_fee := [^\n]*\n','','g');
  definition := replace(definition,
    'The current $100+ free-priority-pickup policy does not use a deposit or temporary card hold. Below the free-pickup threshold, the applicable pickup fee is calculated under the current rules.',
    'Pickup and processing use one batch service fee, with no extra transportation charge based on resale value and no temporary card hold. Current fees and launch eligibility are shown before submission.');
  definition := replace(definition,
    'La politique actuelle de ramassage gratuit à 100 $ CAD ou plus n’utilise ni dépôt ni retenue temporaire sur carte. En dessous du seuil gratuit, les frais de ramassage applicables sont calculés selon les règles actuelles.',
    'La collecte et le traitement sont couverts par les frais de service du lot, sans supplément lié à sa valeur et sans retenue temporaire sur carte. Les frais et l’offre de lancement sont affichés avant l’envoi de la demande.');
  definition := replace(definition,', with free pickup',', with no additional transportation charge');
  definition := replace(definition,', ramassage gratuit',', sans supplément de transport');
  definition := replace(definition,'pickup|pick up|ramassage|bag|box|sac|boite|boîte','pickup|pick up|ramassage|collecte|bag|box|sac|boite|boîte');
  execute definition;
end;
$migration$;

commit;
