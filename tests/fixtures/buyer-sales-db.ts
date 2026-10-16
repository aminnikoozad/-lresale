import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
export const buyer='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',staff='00000000-0000-4000-8000-000000000003',seller='00000000-0000-4000-8000-000000000004';
export const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004'];
const sql=(name:string)=>readFileSync(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
export async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role',current_setting('test.role',true),'aal',current_setting('test.aal',true))$$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create function public.can_manage_items() returns boolean language sql stable as $$select auth.uid()='${staff}'::uuid$$;
 create function public.can_manage_selling_rules() returns boolean language sql stable as $$select auth.uid()='${staff}'::uuid$$;
 create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key);
 insert into auth.users values('${buyer}'),('${other}'),('${staff}'),('${seller}');insert into public.profiles select id from auth.users;
 create table public.audit_logs(id uuid default gen_random_uuid(),admin_user_id uuid,action text,entity_type text,entity_id text,previous_value jsonb,new_value jsonb,reason text,created_at timestamptz default now());
 create table public.items(id uuid primary key,owner_id uuid, name text default 'Shirt',brand text default 'Test',category text default 'women',subcategory text default 'Tops',size text default 'M',item_condition text default 'Good',color text default 'Blue',material text,pattern text,condition_notes text,photo_urls text[] default array['https://example.test/front','https://example.test/back','https://example.test/label'],description text,listed_price_cents integer,initial_approved_price_cents integer,status text default 'listed',published_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now(),inspected_at timestamptz default now(),seller_pricing_approved_at timestamptz default now(),locked_seller_commission_bps integer default 6000,locked_platform_commission_bps integer default 4000,sold_price_cents integer,final_seller_earnings_cents integer,final_platform_earnings_cents integer);
 create table public.orders(id uuid primary key default gen_random_uuid(),buyer_id uuid,status text,payment_status text,subtotal_cents integer,shipping_cents integer,tax_cents integer,total_cents integer,currency text default 'CAD',payment_provider text,provider_payment_id text,provider_checkout_id text,paid_at timestamptz,cancelled_at timestamptz,refunded_at timestamptz,reservation_expires_at timestamptz,recipient_name text,address_line1 text,address_line2 text,city text,province text,postal_code text,buyer_terms_version text,return_policy_version text,privacy_notice_version text,buyer_terms_accepted_at timestamptz,updated_at timestamptz default now(),created_at timestamptz default now());
 create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid references public.orders(id),item_id uuid references public.items(id),item_name text,brand text,size text,item_condition text,unit_price_cents integer);
 create table public.inventory_reservations(id uuid primary key default gen_random_uuid(),order_id uuid,item_id uuid,buyer_id uuid,status text,expires_at timestamptz,updated_at timestamptz default now());
 create unique index inventory_one_active on public.inventory_reservations(item_id) where status='active';
 create table public.wallet_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,item_id uuid,amount_cents integer,transaction_type text,status text,description text);
 create function public.create_postal_checkout(uuid,text,text,text,text,text,text,text) returns uuid language plpgsql as $$begin raise exception 'Postal fixture disabled';end$$;
 alter table public.orders enable row level security;alter table public.order_items enable row level security;
 grant select on public.orders,public.order_items to authenticated;
 create policy own_orders on public.orders for select to authenticated using(buyer_id=auth.uid());
 create policy own_lines on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()));
 `);
 const checkout=sql('20260921141207_checkout_reservation_and_admin_rate_limit_hardening').split('create or replace function public.catalog_items()')[0];await db.exec(checkout);
 await db.exec(sql('20260925131500_payment_idempotency_and_order_invariants'));
 await db.exec(sql('20261001023500_pre_payment_order_lifecycle'));
 await db.exec(sql('20260921170708_catalog_taxonomy_foundation_v2').split('create or replace function public.catalog_items_v3()')[1].split('create or replace function public.catalog_item_detail_v3')[0].replace(/^/,'create or replace function public.catalog_items_v3()'));
 await db.exec(sql('20260925214500_paid_order_seller_wallet_credit'));
 for(let i=0;i<ids.length;i++)await db.query('insert into public.items(id,owner_id,listed_price_cents,initial_approved_price_cents) values($1,$2,$3,$3)',[ids[i],seller,[800,5200,4000,4000][i]]);
 for(const name of ['20261016030302_buyer_sales_catalog','20261016030427_buyer_first_purchase','20261016030435_buyer_consent_measurement','20261016030734_buyer_verified_payments','20261016031156_buyer_guest_support']) await db.exec(sql(name));

 return db;
}
export async function identity(db:PGlite,id:string,role='authenticated',aal='aal2'){await db.exec(`reset role;select set_config('test.uid','${id}',false);select set_config('test.role','${role}',false);select set_config('test.aal','${aal}',false);set role ${role};`);}
export async function enable(db:PGlite){await identity(db,staff);await db.query('select public.admin_save_buyer_offer(true,1000,6000,800,1)');}
export async function offer(db:PGlite,items=ids.slice(0,2)){return (await db.query<{v:{code:string;discountCents:number}}>('select public.my_first_purchase_offer($1::uuid[]) v',[items])).rows[0].v;}
export async function prepare(db:PGlite,code:string,items=ids.slice(0,2)){
 const {rows}=await db.query<{id:string}>(`select public.prepare_buyer_checkout($1::uuid[],null,null,'Test Buyer','123 Main Street',null,'Montreal','QC','H1A 1A1','2026-09-25','2026-09-25','2026-09-25',$2) id`,[items,code]);return rows[0].id;
}
export async function attempt(db:PGlite,order:string){await db.exec('reset role');await db.query('update public.orders set shipping_cents=500,tax_cents=100,total_cents=subtotal_cents-discount_cents+600 where id=$1',[order]);await db.exec(`update private.buyer_payment_connection set provider='fixture-provider',enabled=true where id`);return (await db.query<{id:string;amount:number}>(`insert into public.order_payment_attempts(order_id,buyer_id,provider,provider_checkout_id,expected_total_cents,status) select id,buyer_id,'fixture-provider',id::text,total_cents,'pending' from public.orders where id=$1 returning id,expected_total_cents amount`,[order])).rows[0];}
