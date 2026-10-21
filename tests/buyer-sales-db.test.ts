import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,identity,enable,offer,prepare,attempt,buyer,other,staff,ids} from './fixtures/buyer-sales-db.ts';

test('offer ownership, cents floor, concurrency reservation, failure/expiry and first success are enforced in SQL',async()=>{
 const db=await fixture();try{
  await identity(db,buyer);assert.equal(await offer(db),null);
  await identity(db,other);await assert.rejects(db.query('select public.admin_save_buyer_offer(true,1000,6000,800,1)'));
  await identity(db,staff,'authenticated','aal1');await assert.rejects(db.query('select public.admin_save_buyer_offer(true,1000,6000,800,1)'));
  await enable(db);await identity(db,buyer);
  const code=await offer(db);assert.equal(code.discountCents,600);assert.equal((await offer(db)).code,code.code);
  await identity(db,other);await assert.rejects(prepare(db,code.code));
  await identity(db,buyer);const oid=await prepare(db,code.code);
  const lines=await db.query<{unit_price_cents:number;discount_cents:number}>('select unit_price_cents,discount_cents from public.order_items where order_id=$1 order by unit_price_cents',[oid]);
  assert.deepEqual(lines.rows,[{unit_price_cents:800,discount_cents:0},{unit_price_cents:5200,discount_cents:600}]);
  await assert.rejects(prepare(db,code.code,ids.slice(2)),/already reserved/);
  await identity(db,other);await assert.rejects(db.query(`select public.create_checkout_order($1::uuid[],'Other Buyer','123 Main Street',null,'Montreal','QC','H1A 1A1')`,[ids.slice(0,2)]),/temporarily reserved/);
  await identity(db,buyer);await db.query('select public.cancel_prepared_checkout($1)',[oid]);assert.equal((await offer(db)).code,code.code);
  const failed=await prepare(db,code.code);const fa=await attempt(db,failed);await identity(db,buyer);await assert.rejects(db.query(`select public.accept_verified_buyer_payment($1,'f','fail',repeat('a',64),$2,'CAD',false)`,[fa.id,fa.amount]));
  await identity(db,buyer,'service_role');await db.query(`select public.accept_verified_buyer_payment($1,'f','fail',repeat('a',64),$2,'CAD',false)`,[fa.id,fa.amount]);
  await identity(db,buyer);assert.equal((await offer(db)).code,code.code);
  const expired=await prepare(db,code.code);await db.exec('reset role');await db.query(`update public.orders set reservation_expires_at=now()-interval '1 hour' where id=$1`,[expired]);await db.query(`update public.inventory_reservations set expires_at=now()-interval '1 hour' where order_id=$1`,[expired]);await identity(db,buyer,'service_role');await db.query('select public.expire_prepared_checkouts(200)');
  await identity(db,buyer);assert.equal((await offer(db)).code,code.code);
  const paid=await prepare(db,code.code);const a=await attempt(db,paid);await identity(db,buyer,'service_role');
  await assert.rejects(db.query(`select public.accept_verified_buyer_payment($1,'ok','pay',repeat('b',64),$2,'CAD',true)`,[a.id,a.amount+1]),/amount/);
  const args=[a.id,a.amount];const payment=`select public.accept_verified_buyer_payment($1,'ok','pay',repeat('b',64),$2,'CAD',true)`;
  await db.query(payment,args);await db.query(payment,args);await db.query(`select public.accept_verified_buyer_payment($1,'ok-again','pay',repeat('c',64),$2,'CAD',true)`,args);
  await db.exec('reset role');assert.equal((await db.query<{n:number}>('select count(*)::int n from public.order_seller_credits')).rows[0].n,2);
  assert.equal((await db.query<{n:number}>("select count(*)::int n from public.sales_measurement_events where event_name='purchase'")).rows[0].n,1);
  assert.equal((await db.query<{n:number}>('select sum(seller_cents)::int n from public.order_seller_credits')).rows[0].n,3600); // full base 6000 x 60%, funded by platform
  assert.equal((await db.query<{n:number}>("select sum(c.sale_cents-c.seller_cents-l.discount_cents)::int n from public.order_seller_credits c join public.order_items l on l.id=c.order_item_id")).rows[0].n,1800);
  await identity(db,buyer);assert.equal(await offer(db,ids.slice(2)),null);
  await assert.rejects(db.query('update public.buyer_offer_codes set disabled=false'));
 }finally{await db.close();}
});

test('discount math meets threshold boundaries, cap and $8 floor with deterministic integer cents',async()=>{
 const db=await fixture();try{
  for(const [prices,expected] of [[[5999],0],[[6000],600],[[6001],600],[[10000],800],[Array(8).fill(800),0],[[800,800,800,800,800,800,800,801],1]] as [number[],number][]){
   const {rows}=await db.query<{v:number[]}>('select private.buyer_discount_lines($1::integer[],1000,6000,800) v',[prices]);assert.equal(rows[0].v.reduce((s,v)=>s+v,0),expected);assert.ok(rows[0].v.every((v,i)=>prices[i]-v>=800));
  }
 }finally{await db.close();}
});

test('production legacy total guard permits discounted merchandise with zero shipping and tax',async()=>{
 const db=await fixture();try{
  await enable(db);await identity(db,buyer);const c=await offer(db);const oid=await prepare(db,c.code);
  await db.exec('reset role');
  await db.query('update public.orders set shipping_cents=0,tax_cents=0,total_cents=subtotal_cents-discount_cents where id=$1',[oid]);
  assert.equal((await db.query<{n:number}>('select total_cents n from public.orders where id=$1',[oid])).rows[0].n,5400);
  await assert.rejects(db.query('update public.orders set discount_cents=subtotal_cents+1,total_cents=-1 where id=$1',[oid]));
 }finally{await db.close();}
});

test('consent evidence, unsubscribe, price/purchase suppression, caps and provider gate work in SQL',async()=>{
 const db=await fixture();try{
  await identity(db,buyer);await db.query(`select public.save_my_buyer_consent(true,true,'2026-10-16','account_preferences')`);
  await db.exec('reset role');assert.equal((await db.query<{n:number}>('select count(*)::int n from public.buyer_consent_evidence')).rows[0].n,1);
  await identity(db,staff);await db.query('select public.admin_save_buyer_messages(true)');
  await identity(db,buyer,'service_role');
  const queued=await db.query<{id:string}>('select public.queue_buyer_followup($1,\'abandoned_cart_1\',$2::uuid[],null,\'cart-1\') id',[buyer,[ids[0]]]);const id=queued.rows[0].id;assert.ok(id);
  await db.exec('reset role');await db.query(`update public.buyer_message_queue set due_at=now()-interval '1 minute' where id=$1`,[id]);
  await identity(db,buyer,'service_role');assert.equal((await db.query<{v:{allowed:boolean}}>('select public.claim_buyer_message($1,true) v',[id])).rows[0].v.allowed,true);
  assert.equal((await db.query<{v:{reason:string}}>('select public.claim_buyer_message($1,false) v',[id])).rows[0].v.reason,'provider_not_configured');
  await identity(db,buyer);await db.query(`select public.save_my_buyer_consent(false,true,'2026-10-16','account_preferences')`);
  await db.exec('reset role');assert.equal((await db.query<{status:string}>('select status from public.buyer_message_queue where id=$1',[id])).rows[0].status,'suppressed');
  await identity(db,buyer);await db.query(`select public.save_my_buyer_consent(true,true,'2026-10-16','account_preferences')`);
  await identity(db,buyer,'service_role');const price=(await db.query<{id:string}>('select public.queue_buyer_followup($1,\'welcome\',$2::uuid[],null,\'price-1\') id',[buyer,[ids[1]]])).rows[0].id;
  await db.exec('reset role');await db.query('update public.items set listed_price_cents=listed_price_cents+1 where id=$1',[ids[1]]);assert.equal((await db.query<{status:string}>('select status from public.buyer_message_queue where id=$1',[price])).rows[0].status,'suppressed');
  const token=(await db.query<{unsubscribe_token:string}>('select unsubscribe_token from public.buyer_consents where buyer_id=$1',[buyer])).rows[0].unsubscribe_token;
  await identity(db,'','anon');await db.query('select public.unsubscribe_buyer_messages($1)',[token]);await db.query('select public.unsubscribe_buyer_messages($1)',[token]);
  await db.exec('reset role');assert.equal((await db.query<{email_marketing:boolean}>('select email_marketing from public.buyer_consents where buyer_id=$1',[buyer])).rows[0].email_marketing,false);
  await identity(db,buyer);const event='20000000-0000-4000-8000-000000000001';await db.query(`select public.record_buyer_browse_event($1,'view_item',$2::uuid[])`,[event,[ids[0]]]);await db.query(`select public.record_buyer_browse_event($1,'view_item',$2::uuid[])`,[event,[ids[0]]]);
  await assert.rejects(db.query(`select public.record_buyer_browse_event($1,'purchase',$2::uuid[])`,[event,[ids[0]]]));
  await db.exec('reset role');assert.equal((await db.query<{n:number}>('select count(*)::int n from public.sales_measurement_events')).rows[0].n,1);
 }finally{await db.close();}
});

test('published sold/reserved pages retain detail; first publication cannot reset; clothing publication requires staff evidence',async()=>{
 const db=await fixture();try{
  await db.exec(`update public.items set published_at=now()+interval '1 day' where id='${ids[0]}'`);
  const times=(await db.query<{same:boolean}>('select first_published_at=published_at as same from public.items where id=$1',[ids[0]])).rows[0];assert.equal(times.same,true);
  await db.query(`update public.items set status='sold' where id=$1`,[ids[0]]);
  await identity(db,'','anon');const sold=(await db.query<{v:{availability:string}[]}>('select public.buyer_catalog_item_detail($1) v',[ids[0]])).rows[0].v;assert.equal(sold[0].availability,'sold');
  await db.exec('reset role');await db.query(`insert into public.inventory_reservations(order_id,item_id,buyer_id,status,expires_at) values(gen_random_uuid(),$1,$2,'active',now()+interval '10 minutes')`,[ids[1],buyer]);
  await identity(db,'','anon');assert.equal((await db.query<{v:{availability:string}[]}>('select public.buyer_catalog_item_detail($1) v',[ids[1]])).rows[0].v[0].availability,'reserved');
  await db.exec('reset role');const fresh='10000000-0000-4000-8000-000000000099';await db.query(`insert into public.items(id,owner_id,status,listed_price_cents,published_at) values($1,$2,'accepted',2400,null)`,[fresh,staff]);
  await assert.rejects(db.query(`update public.items set status='listed',published_at=now() where id=$1`,[fresh]),/photos/);
  const photos=[{url:'https://example.test/front',role:'front'},{url:'https://example.test/back',role:'back'},{url:'https://example.test/label',role:'size_label'}];
  await identity(db,buyer);await assert.rejects(db.query('select public.admin_save_clothing_evidence($1,$2,$3,$4)',[fresh,JSON.stringify(photos),'{}',[]]));
  await identity(db,staff);await assert.rejects(db.query('select public.admin_save_clothing_evidence($1,$2,$3,$4)',[fresh,JSON.stringify(photos),'{}',['tear']]));
  await db.query('select public.admin_save_clothing_evidence($1,$2,$3,$4)',[fresh,JSON.stringify(photos),'{"chest":48}',[]]);
  await db.exec('reset role');await db.query(`update public.items set status='listed',published_at=now() where id=$1`,[fresh]);
  await assert.rejects(db.query('select public.admin_save_clothing_evidence($1,$2,$3,$4)',[fresh,JSON.stringify(photos),'{"chest":-1}',[]]));
 }finally{await db.close();}
});

test('verified refunds are bounded, idempotent, order-linked, do not restore offer or claim seller reconciliation',async()=>{
 const db=await fixture();try{
  await enable(db);await identity(db,buyer);const c=await offer(db);const oid=await prepare(db,c.code);const a=await attempt(db,oid);await identity(db,buyer,'service_role');await db.query(`select public.accept_verified_buyer_payment($1,'paid','pay',repeat('a',64),$2,'CAD',true)`,[a.id,a.amount]);
  await db.exec('reset role');const oi=(await db.query<{id:string}>('select id from public.order_items where order_id=$1 and unit_price_cents=5200',[oid])).rows[0].id;
  const lines=JSON.stringify([{orderItemId:oi,cents:1000}]);await identity(db,buyer);await assert.rejects(db.query(`select public.record_verified_buyer_refund($1,'fixture-provider','refund',$2,0,0)`,[oid,lines]));
  await identity(db,buyer,'service_role');await db.query(`select public.record_verified_buyer_refund($1,'fixture-provider','refund',$2,0,0)`,[oid,lines]);await db.query(`select public.record_verified_buyer_refund($1,'fixture-provider','refund',$2,0,0)`,[oid,lines]);
  await assert.rejects(db.query(`select public.record_verified_buyer_refund($1,'fixture-provider','over',$2,0,0)`,[oid,JSON.stringify([{orderItemId:oi,cents:4600}])]),/exceeds/);
  await db.exec('reset role');assert.equal((await db.query<{n:number}>("select count(*)::int n from public.sales_measurement_events where event_name='refund'")).rows[0].n,1);
  assert.equal((await db.query<{s:string}>('select seller_reconciliation_status s from public.verified_buyer_refunds')).rows[0].s,'pending_review');
  await identity(db,buyer);assert.equal(await offer(db,ids.slice(2)),null);
  await identity(db,staff);await db.query(`select public.admin_save_sales_campaign_cost('test','manual','2026-01-01','2026-12-31',500,null)`);await db.query(`select public.admin_attribute_sales_order($1,'test','manual')`,[oid]);
  await assert.rejects(db.query(`select public.admin_attribute_sales_order($1,'other','manual')`,[oid]));
  const state=(await db.query<{v:{net_merchandise_cents:number;margin_cents:number|null}[]}>('select public.admin_sales_campaign_state() v')).rows[0].v[0];assert.equal(Number(state.net_merchandise_cents),4400);assert.equal(state.margin_cents,null);
 }finally{await db.close();}
});
