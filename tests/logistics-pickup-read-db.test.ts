import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Explicit SQL-unit identity simulation; native-role-permissions separately
// verifies the same gates using genuine Auth-issued AAL1/AAL2 sessions.
const migration=readFileSync(new URL('../supabase/migrations/20261013182300_logistics_pickup_read_capability.sql',import.meta.url),'utf8');
const itemCapabilities=readFileSync(new URL('../supabase/migrations/20260905154500_enforce_mfa_on_legacy_admin_rpcs.sql',import.meta.url),'utf8');
const customer='00000000-0000-4000-8000-000000000001',staff='00000000-0000-4000-8000-000000000002';
async function fixture(){const db=new PGlite();await db.exec(`
 create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
 grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;
 create table admin_roles(user_id uuid primary key,role text,can_manage_pickups boolean default false,require_mfa boolean default true,can_manage_selling_rules boolean default false);
 insert into admin_roles(user_id,role) values('${staff}','logistics');
 create table collection_requests(id int primary key,user_id uuid);insert into collection_requests values(1,'${customer}');
 alter table collection_requests enable row level security;
 create policy collection_requests_select_authenticated on collection_requests for select to authenticated using(user_id=auth.uid() or exists(select 1 from admin_roles ar where ar.user_id=auth.uid() and ar.role in ('owner','admin','operations_manager','warehouse','pickup_logistics') and (not ar.require_mfa or coalesce(auth.jwt()->>'aal','aal1')='aal2')));
 grant select on collection_requests,admin_roles to authenticated;
 `);await db.exec(itemCapabilities);await db.exec(migration);return db;}
async function identity(db:PGlite,uid:string,aal='aal2'){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.aal',$2,false)",[uid,aal]);await db.exec('set role authenticated')}
async function count(db:PGlite){return (await db.query('select id from collection_requests')).rows.length}

test('logistics requires explicit pickup capability and existing MFA, without acquiring item editing',async()=>{
 const db=await fixture();try{
  await identity(db,staff);assert.equal(await count(db),0);
  await db.exec('reset role');await db.query('update admin_roles set can_manage_pickups=true where user_id=$1',[staff]);await identity(db,staff,'aal1');assert.equal(await count(db),0);
  await identity(db,staff);assert.equal(await count(db),1);assert.equal((await db.query<{allowed:boolean}>('select can_manage_items() allowed')).rows[0].allowed,false);
  await db.exec('reset role');await db.query('update admin_roles set require_mfa=false where user_id=$1',[staff]);await identity(db,staff,'aal1');assert.equal(await count(db),1);
  await db.exec('reset role');await db.query('update admin_roles set can_manage_pickups=false where user_id=$1',[staff]);await identity(db,staff,'aal1');assert.equal(await count(db),0);
 }finally{await db.close()}
});

test('owner/admin/operations/warehouse readers keep access without pickup flag and retain MFA',async()=>{
 const db=await fixture();try{
  for(const role of ['owner','admin','operations_manager','warehouse']){await db.exec('reset role');await db.query('update admin_roles set role=$1,can_manage_pickups=false,require_mfa=true where user_id=$2',[role,staff]);await identity(db,staff);assert.equal(await count(db),1,role);await identity(db,staff,'aal1');assert.equal(await count(db),0,role+' AAL1');}
 }finally{await db.close()}
});

test('own-customer reads remain; unrelated unprivileged roles and anonymous callers stay denied',async()=>{
 const db=await fixture();try{
  await identity(db,customer,'aal1');assert.equal(await count(db),1);
  for(const role of ['support','finance','read_only']){await db.exec('reset role');await db.query('update admin_roles set role=$1,can_manage_pickups=false where user_id=$2',[role,staff]);await identity(db,staff);assert.equal(await count(db),0,role);}
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select id from collection_requests'),/permission denied/);
 }finally{await db.close()}
});
