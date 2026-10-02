import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20260929152500_eight_dollar_item_sixty_dollar_collection.sql', import.meta.url), 'utf8');

test('intake policy versions $8 items and $60 collections without changing existing snapshots or free pickup', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.business_setting_versions(setting_key text,version integer,value jsonb,effective_at timestamptz,reason text);
      create table public.knowledge_base(title text,status text,approved_answer text,tags text[]);
      create function public.get_selling_rules() returns jsonb language sql stable as $$
        select value from public.business_setting_versions where setting_key='selling_rules' and effective_at<=now()
        order by effective_at desc,version desc limit 1
      $$;
      insert into public.business_setting_versions values
        ('selling_rules',1,'{"minimumIndividualItemValueCents":2000,"minimumPickupEstimatedValueCents":1,"minimumSellingPriceCents":2000,"commissionTiers":[{"minCents":2000,"maxCents":9999,"sellerBps":4500,"platformBps":5500},{"minCents":10000,"maxCents":null,"sellerBps":5000,"platformBps":5000}],"pickupRules":{"bagMinimumEstimatedValueCents":10000,"freePickupThresholdCents":10000,"processingFeeCents":1200}}'::jsonb,now()-interval '1 day','old');
      insert into public.knowledge_base values ('Clothing preparation and acceptance','approved','Old $20 answer',array['minimum value']);
    `);
    await db.exec(migration);
    const {rows} = await db.query<{version:number;value:{minimumIndividualItemValueCents:number;minimumPickupEstimatedValueCents:number;minimumSellingPriceCents:number;commissionTiers:{minCents:number;sellerBps:number}[];pickupRules:{bagMinimumEstimatedValueCents:number;freePickupThresholdCents:number;processingFeeCents:number}}}>(
      `select version,value from public.business_setting_versions order by version`);
    assert.equal(rows.length,2);
    assert.equal(rows[0].value.minimumIndividualItemValueCents,2000);
    assert.equal(rows[1].value.minimumIndividualItemValueCents,800);
    assert.equal(rows[1].value.minimumPickupEstimatedValueCents,6000);
    assert.equal(rows[1].value.minimumSellingPriceCents,800);
    assert.equal(rows[1].value.commissionTiers[0].minCents,800);
    assert.equal(rows[1].value.commissionTiers[0].sellerBps,4500);
    assert.equal(rows[1].value.pickupRules.bagMinimumEstimatedValueCents,6000);
    assert.equal(rows[1].value.pickupRules.freePickupThresholdCents,10000);
    assert.equal(rows[1].value.pickupRules.processingFeeCents,1200);
    const answer = await db.query<{approved_answer:string}>(`select approved_answer from public.knowledge_base where title='Clothing preparation and acceptance'`);
    assert.match(answer.rows[0].approved_answer,/\$8 CAD/);
    assert.match(answer.rows[0].approved_answer,/rejects items/);
  } finally { await db.close(); }
});
