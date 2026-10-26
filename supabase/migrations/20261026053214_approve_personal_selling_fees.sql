-- Owner-approved personal-selling fee only. No managed rates or existing
-- financial snapshots change, and no payment/payout connection is enabled.
lock table public.business_setting_versions in share row exclusive mode;
insert into public.business_setting_versions(setting_key,version,value,reason)
select 'marketplace_policy',coalesce(max(version),0)+1,
 coalesce((select value from public.business_setting_versions where setting_key='marketplace_policy' order by version desc limit 1),'{}'::jsonb)
 ||jsonb_build_object('status','fees_approved_awaiting_payments','feesApproved',true,'commissionBps',1500,'minimumCommissionCents',150,'commissionScope','seller_suborder','commissionBasis','item_subtotal_after_discounts_excluding_shipping_and_tax','currency','CAD','newPurchasesEnabled',false,'commercialApproved',false),
 'Owner approved 15% personal-selling commission, minimum CAD 1.50 once per seller suborder. Separate from managed consignment; no new commission at cash-out. Payment and transaction activation remain pending.'
from public.business_setting_versions where setting_key='marketplace_policy';

create function public.personal_selling_fee_policy() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',p.version,'commissionBps',(p.value->>'commissionBps')::integer,
 'minimumCommissionCents',(p.value->>'minimumCommissionCents')::integer,'currency',p.value->>'currency',
 'scope',p.value->>'commissionScope','basis',p.value->>'commissionBasis')
 from (select version,value from public.business_setting_versions where setting_key='marketplace_policy' and effective_at<=now() order by version desc limit 1)p
 where p.value->>'feesApproved'='true';
$$;
revoke all on function public.personal_selling_fee_policy() from public;
grant execute on function public.personal_selling_fee_policy() to anon,authenticated;
notify pgrst,'reload schema';
