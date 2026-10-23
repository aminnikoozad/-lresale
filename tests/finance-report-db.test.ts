import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,identity,buyer,staff,seller,ids,attempt} from './fixtures/buyer-sales-db.ts';
import {marketplaceCommission} from '../lib/marketplace.ts';
import {earningsFromSalePrice} from '../lib/commission.ts';
import {financeFilter} from '../lib/finance-report.ts';
import {adminNavigation} from '../lib/workspace-navigation.ts';
const migration=readFileSync(new URL('../supabase/migrations/20261023042837_owner_finance_report.sql',import.meta.url),'utf8');

test('both fee calculations match independent integer arithmetic across rounding and boundaries',()=>{
 const policy={version:7,commissionBps:1500,minimumCommissionCents:150};
 for(const amount of [0,1,8,799,800,999,1000,1003,1010,1599,1600,4000,9999,10000,24999,25000,49999,50000,100000000]) {
  const expected=Number((BigInt(amount)*1500n+5000n)/10000n);
  const fee=Math.min(amount,Math.max(150,expected));
  const direct=marketplaceCommission(amount,policy);
  assert.equal(direct.commissionCents,fee);assert.equal(direct.sellerNetCents+fee,amount);assert.equal(direct.policyVersion,7);
  for(const bps of [4500,5000,5500,6500]){
   const managed=earningsFromSalePrice(amount,bps);
   assert.equal(managed.sellerEarningsCents,Number((BigInt(amount)*BigInt(bps)+5000n)/10000n));
   assert.equal(managed.sellerEarningsCents+managed.platformEarningsCents,amount);
  }
 }
 assert.equal(marketplaceCommission(800,policy).sellerNetCents,650);
 assert.equal(marketplaceCommission(4000,policy).sellerNetCents,3400);
 assert.equal(marketplaceCommission(800+800,policy).commissionCents,240); // One suborder minimum.
 assert.equal(marketplaceCommission(4000-1000,policy).sellerNetCents,2550); // Seller-funded discount changes base.
 assert.equal(marketplaceCommission(4000,policy).sellerNetCents,3400); // Platform coupon does not change base.
});

test('owner report exposes authoritative paid shares, funded coupons, reversals and no bank success inference',async()=>{
 const db=await fixture();try{
  await db.exec(`alter table public.profiles add column full_name text;alter table public.items add column sale_mode text default 'managed_consignment';alter table public.wallet_transactions add column created_at timestamptz default now();create table public.admin_roles(user_id uuid,role text);insert into public.admin_roles values('${staff}','owner');update public.profiles set full_name='Synthetic Seller' where id='${seller}';`);
  await db.exec(migration);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261023043902_finance_parties_and_simple_details.sql',import.meta.url),'utf8'));
  await identity(db,staff);await db.query('select public.admin_save_buyer_offer(true,1000,6000,800,1)');
  await identity(db,buyer);
  const offer=(await db.query<{v:{code:string}}>('select public.my_first_purchase_offer($1::uuid[])v',[ids.slice(0,2)])).rows[0].v;
  const order=(await db.query<{id:string}>(`select public.prepare_buyer_checkout($1::uuid[],null,null,'Test Buyer','123 Main Street',null,'Montreal','QC','H1A 1A1','2026-09-25','2026-09-25','2026-09-25',$2)id`,[ids.slice(0,2),offer.code])).rows[0].id;
  const payment=await attempt(db,order);
  await identity(db,staff,'service_role');await db.query("select public.accept_verified_buyer_payment($1,'finance-event','finance-payment',repeat('a',64),$2,'CAD',true)",[payment.id,payment.amount]);
  await identity(db,staff);
  const report=async(kind:string)=>(await db.query<{v:Array<Record<string,unknown>>}>('select public.owner_finance_report($1,1)v',[kind])).rows[0].v;
  const payments=await report('payments');assert.equal(payments[0].buyerName,'Test Buyer');const purchased=payments[0].items as Array<Record<string,unknown>>;assert.equal(purchased[0].sellerName,'Synthetic Seller');assert.equal(purchased[0].soldBy,'SHIKIMOMO');assert.equal(purchased[0].name,'Shirt');assert.equal(payments.length,1);assert.equal(payments[0].status,'paid');
  const shares=await report('earnings');assert.equal(shares.length,2);assert.equal(shares[0].buyerName,'Test Buyer');assert.equal(shares[0].sellerName,'Synthetic Seller');
  assert.equal(shares.reduce((a,r)=>a+Number(r.sellerCents),0),3600);
  assert.equal(shares.reduce((a,r)=>a+Number(r.platformAfterCouponCents),0),1800);
  assert.ok(shares.every(r=>r.bankConfirmation==='not_connected'));
  assert.deepEqual(await report('payouts'),[]);
  assert.ok(!JSON.stringify(payments).includes('address_line1'));
  await db.exec('reset role');await db.query("insert into public.wallet_transactions(user_id,amount_cents,transaction_type,status,description)values($1,-3600,'payout_debit','completed','Synthetic historical ledger only')",[seller]);
  await identity(db,staff);const payouts=await report('payouts');assert.equal(payouts.length,1);assert.equal(payouts[0].bankConfirmation,'not_connected');assert.equal(payouts[0].amountCents,-3600);
  for(const id of [buyer,seller]) {await identity(db,id);await assert.rejects(report('payments'),/Owner and MFA/);}
  await identity(db,staff,'authenticated','aal1');await assert.rejects(report('payments'),/Owner and MFA/);
  await db.exec("reset role;update public.admin_roles set role='finance'");await identity(db,staff);await assert.rejects(report('payments'),/Owner and MFA/);
  await db.exec("reset role;update public.admin_roles set role='owner'");await identity(db,staff);await assert.rejects(report('invalid'),/Invalid report/);
  await db.exec('reset role;set role anon');await assert.rejects(report('payments'),/permission denied/);
 }finally{await db.close();}
});

test('finance menu is owner-only and pagination rejects unbounded or malformed inputs',()=>{
 for(const role of ['admin','finance','support','warehouse','read_only'])assert.ok(!adminNavigation({role}).some(l=>l.href==='/admin/finance'));
 assert.ok(adminNavigation({role:'owner'}).some(l=>l.href==='/admin/finance'));
 assert.deepEqual(financeFilter('bad','-1'),{kind:'payments',page:1});assert.deepEqual(financeFilter('payouts','2'),{kind:'payouts',page:2});
});
