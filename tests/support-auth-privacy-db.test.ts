import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// SQL unit regressions with explicitly simulated Auth identity. Genuine HTTP
// Auth/TOTP/PostgREST evidence is produced separately by native-role-permissions.
const patch=readFileSync(new URL('../supabase/migrations/20261017140611_workflow_security_reconciliation.sql',import.meta.url),'utf8').split('-- SECTION: 20261013181000_support_audit_privacy_and_result_types.sql\n')[1].split('-- END SECTION')[0];
const workflowPatch=readFileSync(new URL('../supabase/migrations/20261017140611_workflow_security_reconciliation.sql',import.meta.url),'utf8').split('-- SECTION: 20261013181800_support_rpc_only_transitions.sql\n')[1].split('-- END SECTION')[0];
const hardening=readFileSync(new URL('../supabase/migrations/20260905183500_security_audit_hardening.sql',import.meta.url),'utf8');
const quickReply=readFileSync(new URL('../supabase/migrations/20260907195800_support_quick_knowledge_reply.sql',import.meta.url),'utf8');
function fn(source:string,name:string){const start=source.indexOf('create or replace function '+name+'(');assert(start>=0);const end=source.indexOf('$$;',start);assert(end>start);return source.slice(start,end+3);}
const owner='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',staff='00000000-0000-4000-8000-000000000004',independent='00000000-0000-4000-8000-000000000005',conversation='00000000-0000-4000-8000-000000000010';
const permissions=['view','test','suggest_training','edit_training','approve_training','manage_behavior_rules'];
async function fixture(applyPatch=true){
 const db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('test.aal',true),'role',current_setting('test.role',true),'is_anonymous',false)$$;
 grant usage on schema public,private,auth to authenticated,service_role;
 grant execute on all functions in schema auth to authenticated,service_role;
 create table auth.users(id uuid primary key,email varchar(255));
 insert into auth.users values('${owner}','owner@example.invalid'),('${customer}','customer@example.invalid'),('${other}','other@example.invalid'),('${staff}','staff@example.invalid'),('${independent}','independent@example.invalid');
 create table profiles(id uuid primary key,full_name text,phone text,customer_code text,username text);
 insert into profiles values('${customer}','Synthetic Customer','5550000000','SYNTHETIC','synthetic');
 create table admin_roles(user_id uuid primary key,role text,require_mfa boolean default true,can_support boolean default true,${permissions.map(p=>'can_ai_'+p+' boolean default true').join(',')});
 insert into admin_roles(user_id,role) values('${owner}','owner'),('${staff}','support'),('${independent}','finance');
 create table support_admins(user_id uuid primary key,role text,display_name text,active boolean default true,availability_status text default 'offline');
 insert into support_admins values('${owner}','owner','Synthetic Owner',true),('${staff}','agent','Synthetic Staff',true);
 create function private.is_support_admin() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.admin_roles ar join public.support_admins sa on sa.user_id=ar.user_id and sa.active where ar.user_id=auth.uid() and (ar.role='owner' or ar.can_support) and (not ar.require_mfa or coalesce(auth.jwt()->>'aal','aal1')='aal2'))$$;
 grant execute on function private.is_support_admin() to authenticated;
 create table support_conversations(id uuid primary key,customer_id uuid,subject text,status text,priority text,category text,subcategory text,assigned_to uuid,human_requested boolean default false,ai_enabled boolean default true,internal_summary text,recommended_action text,ai_confidence numeric,pickup_id uuid,item_id uuid,external_order_ref text,created_at timestamptz default now(),last_message_at timestamptz,last_customer_message_at timestamptz,updated_at timestamptz default now(),waiting_since timestamptz,first_human_requested_at timestamptz,assigned_at timestamptz,resolved_at timestamptz,reopened_at timestamptz,closed_at timestamptz,ai_last_processed_message_id uuid);
 insert into support_conversations(id,customer_id,subject,status,priority,category,subcategory) values('${conversation}','${customer}','Synthetic','ai','normal','Other','General Question');
 create table support_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid,sender_id uuid,sender_kind text,sender_display_name text,body text,created_at timestamptz default now(),ai_confidence numeric,metadata jsonb);
 create table support_audit_logs(actor_id uuid,conversation_id uuid,action text,previous_value jsonb,new_value jsonb);
 create table support_notifications(admin_id uuid,event_type text,conversation_id uuid,title text,body text,priority text);
 create table support_assignments(conversation_id uuid,admin_id uuid,assigned_by uuid,action text);
 create function private.support_check_customer_rate(p_action text) returns void language sql as $$select$$;
 create function private.support_quick_reply(p_body text) returns text language sql as $$select null::text$$;
 create function private.audit_support_change() returns trigger language plpgsql security definer set search_path='' as $$begin if auth.uid() is null or not private.is_support_admin() then raise exception 'Support access required';end if;new.updated_at=now();insert into public.support_audit_logs values(auth.uid(),new.id,'conversation.updated',to_jsonb(old),to_jsonb(new));return new;end;$$;
 create trigger audit_support_change before update on support_conversations for each row execute function private.audit_support_change();
 alter table support_conversations enable row level security;
 create policy read_conversations on support_conversations for select to authenticated using(customer_id=auth.uid() or private.is_support_admin());
 create policy manage_conversations on support_conversations for update to authenticated using(private.is_support_admin()) with check(private.is_support_admin());
 grant select,update(status,priority,category,assigned_to) on support_conversations to authenticated;
 grant select,update on support_conversations to service_role;
 `);
 await db.exec(fn(hardening,'public.support_request_human'));
 await db.exec(fn(quickReply,'public.support_send_customer_message'));
 await db.exec(fn(hardening,'public.support_take_over'));
 await db.exec(fn(hardening,'public.support_claim_ai_turn'));
 await db.exec('revoke all on function public.support_claim_ai_turn(uuid,uuid,uuid) from public,anon,authenticated;grant execute on function public.support_claim_ai_turn(uuid,uuid,uuid) to service_role;');
 await db.exec(`grant execute on function public.support_request_human(uuid),public.support_send_customer_message(uuid,text),public.support_take_over(uuid,boolean) to authenticated;`);
 if(applyPatch)await db.exec(patch);
 return db;
}
async function identity(db:PGlite,uid:string,aal='aal2',role='authenticated'){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.aal',$2,false),set_config('test.role',$3,false)",[uid,aal,role]);await db.exec('set role '+role)}
async function state(db:PGlite){await db.exec('reset role');return (await db.query<{status:string;human_requested:boolean;ai_enabled:boolean;assigned_to:string|null}>('select status,human_requested,ai_enabled,assigned_to from support_conversations')).rows[0]}

test('legacy trigger failure is reproduced, then own customer handoff works and remains audited',async()=>{
 const db=await fixture(false);try{
  await identity(db,customer);await assert.rejects(db.query('select support_request_human($1)',[conversation]),/Support access required/);
  await db.exec('reset role');await db.exec(patch);await identity(db,customer);
  await db.query('select support_request_human($1)',[conversation]);assert.deepEqual(await state(db),{status:'waiting',human_requested:true,ai_enabled:false,assigned_to:null});
  const audit=(await db.query<{actor_id:string;action:string;old_status:string;new_status:string}>("select actor_id,action,previous_value->>'status' old_status,new_value->>'status' new_status from support_audit_logs")).rows;
  assert(audit.some(a=>a.actor_id===customer&&a.action==='conversation.updated'&&a.old_status==='ai'&&a.new_status==='waiting'));
  await identity(db,other);await assert.rejects(db.query('select support_request_human($1)',[conversation]),/Conversation not available/);
  await identity(db,customer);assert.equal((await db.query('update support_conversations set status=$1 where id=$2 returning id',['closed',conversation])).rows.length,0);assert.equal((await state(db)).status,'waiting');
 }finally{await db.close()}
});

test('own customer messages succeed while cross-customer messages fail; staff updates keep actor audit',async()=>{
 const db=await fixture();try{
  await identity(db,customer);await db.query('select support_send_customer_message($1,$2)',[conversation,'Synthetic follow-up']);
  await identity(db,other);await assert.rejects(db.query('select support_send_customer_message($1,$2)',[conversation,'Must not post']),/Conversation not available/);
  await identity(db,staff,'aal1');await assert.rejects(db.query('select support_take_over($1,false)',[conversation]),/Support access required/);
  await identity(db,staff);await db.query('select support_take_over($1,false)',[conversation]);assert.equal((await state(db)).assigned_to,staff);
  const actors=(await db.query<{actor_id:string}>("select actor_id from support_audit_logs where action='conversation.updated'")).rows.map(x=>x.actor_id);assert(actors.includes(customer));assert(actors.includes(staff));
  assert.equal((await db.query('select id from support_messages')).rows.length,1);
  await identity(db,'','aal1','service_role');await db.query("update support_conversations set ai_confidence=.8 where id=$1",[conversation]);await db.exec('reset role');assert((await db.query('select 1 from support_audit_logs where actor_id is null')).rows.length>0);
 }finally{await db.close()}
});

test('disabled support membership revokes all six retained AI flags without changing independent grants or MFA setting',async()=>{
 const db=await fixture();try{
  const allowed=async()=>{const result=await db.query<{value:boolean}>('select private.support_has_permission(p) value from unnest($1::text[]) p',[permissions.map(x=>'ai.'+x)]);return result.rows.map(x=>x.value)};
  await identity(db,staff);assert.deepEqual(await allowed(),permissions.map(()=>true));
  await db.exec('reset role');await db.query('update support_admins set active=false where user_id=$1',[staff]);await identity(db,staff);assert.deepEqual(await allowed(),permissions.map(()=>false));assert.equal((await db.query('select * from support_admin_context()')).rows.length,0);
  await db.exec('reset role');await db.query('update support_admins set active=true where user_id=$1',[staff]);await identity(db,staff,'aal1');assert.deepEqual(await allowed(),permissions.map(()=>false));
  await db.exec('reset role');await db.query('update admin_roles set require_mfa=false where user_id=$1',[staff]);await identity(db,staff,'aal1');assert.deepEqual(await allowed(),permissions.map(()=>true));
  await identity(db,independent);assert.deepEqual(await allowed(),permissions.map(()=>true));
  await identity(db,customer);assert.deepEqual(await allowed(),permissions.map(()=>false));
 }finally{await db.close()}
});

test('AI RLS denies disabled staff private knowledge reads and behavior writes',async()=>{
 const db=await fixture();try{
  await db.exec(`create table knowledge_base(id int primary key,body text);insert into knowledge_base values(1,'Synthetic private');alter table knowledge_base enable row level security;create policy kb_read on knowledge_base for select to authenticated using(private.support_has_permission('ai.view'));grant select on knowledge_base to authenticated;
  create table ai_behavior_rules(id int primary key,body text);alter table ai_behavior_rules enable row level security;create policy behavior_insert on ai_behavior_rules for insert to authenticated with check(private.support_has_permission('ai.manage_behavior_rules'));grant insert on ai_behavior_rules to authenticated;`);
  await identity(db,staff);assert.equal((await db.query('select * from knowledge_base')).rows.length,1);await db.query("insert into ai_behavior_rules values(1,'Synthetic')");
  await db.exec('reset role');await db.query('update support_admins set active=false where user_id=$1',[staff]);await identity(db,staff);assert.equal((await db.query('select * from knowledge_base')).rows.length,0);await assert.rejects(db.query("insert into ai_behavior_rules values(2,'Denied')"),/row-level security/);
 }finally{await db.close()}
});

test('support detail uses genuine Auth varchar email type and still denies customers, inactive staff and AAL1',async()=>{
 const db=await fixture();try{
  await identity(db,staff);const rows=(await db.query<{customer_email:string}>('select * from support_admin_conversation($1)',[conversation])).rows;assert.equal(rows[0].customer_email,'customer@example.invalid');assert.equal((await db.query<{customer_email:string}>('select * from support_admin_inbox()')).rows[0].customer_email,'customer@example.invalid');
  await db.exec('reset role');await db.query('update auth.users set email=null where id=$1',[customer]);await identity(db,staff);assert.equal((await db.query<{customer_email:null}>('select * from support_admin_conversation($1)',[conversation])).rows[0].customer_email,null);assert.equal((await db.query<{customer_email:null}>('select * from support_admin_inbox()')).rows[0].customer_email,null);
  await identity(db,customer);await assert.rejects(db.query('select * from support_admin_conversation($1)',[conversation]),/Support access required/);
  await identity(db,staff,'aal1');await assert.rejects(db.query('select * from support_admin_conversation($1)',[conversation]),/Support access required/);
  await db.exec('reset role');await db.query('update support_admins set active=false where user_id=$1',[staff]);await identity(db,staff);await assert.rejects(db.query('select * from support_admin_conversation($1)',[conversation]),/Support access required/);
 }finally{await db.close()}
});


test('customer direct writes cannot forge assignment, state, ownership, summary or AI identifiers',async()=>{
 const db=await fixture();try{
  for(const who of [customer,other]){await identity(db,who);
   for(const [column,value] of [['status','closed'],['priority','urgent'],['category','Payment'],['assigned_to',staff]])assert.equal((await db.query(`update support_conversations set ${column}=$1 where id=$2 returning id`,[value,conversation])).rows.length,0);
   for(const [column,value] of [['customer_id',other],['internal_summary','Must not write'],['ai_last_processed_message_id',conversation],['ai_confidence',0.9]])await assert.rejects(db.query(`update support_conversations set ${column}=$1 where id=$2`,[value,conversation]),/permission denied/);
  }
  const current=await state(db);assert.equal(current.status,'ai');assert.equal(current.assigned_to,null);assert.equal((await db.query('select 1 from support_audit_logs')).rows.length,0);
 }finally{await db.close()}
});

test('service-role AI claim remains idempotent and audited, authenticated callers cannot claim',async()=>{
 const db=await fixture();try{
  const message='00000000-0000-4000-8000-000000000099';await db.query('insert into support_messages(id,conversation_id,sender_id,sender_kind,body) values($1,$2,$3,$4,$5)',[message,conversation,customer,'customer','Synthetic']);
  await identity(db,customer);await assert.rejects(db.query('select support_claim_ai_turn($1,$2,$3)',[conversation,customer,message]),/permission denied/);
  await identity(db,'','aal1','service_role');assert.equal((await db.query<{claimed:boolean}>('select support_claim_ai_turn($1,$2,$3) claimed',[conversation,customer,message])).rows[0].claimed,true);assert.equal((await db.query<{claimed:boolean}>('select support_claim_ai_turn($1,$2,$3) claimed',[conversation,customer,message])).rows[0].claimed,false);
  await db.exec('reset role');assert.equal((await db.query('select 1 from support_audit_logs where actor_id is null')).rows.length,1);
 }finally{await db.close()}
});


test('RPC-only conversations close raw write bypass while staff workflows and service writes still work',async()=>{
 const db=await fixture();try{
  await db.exec(fn(hardening,'public.support_return_to_ai'));await db.exec(fn(hardening,'public.support_resolve'));
  // This checked RPC's implementation is kept local to the fixture because its
  // base migration is an imported schema history, not a checked-in migration.
  await db.exec(`create function public.unit_set_priority(p_id uuid,p_priority text) returns void language plpgsql security definer set search_path='' as $$begin if not private.is_support_admin() then raise exception 'Support access required';end if;if p_priority not in ('low','normal','high','urgent') then raise exception 'Invalid priority';end if;update public.support_conversations set priority=p_priority where id=p_id;end;$$;`);
  await db.exec(workflowPatch);
  for(const who of [customer,staff,owner]){await identity(db,who);for(const [column,value] of [['status','closed'],['priority','urgent'],['category','Payment'],['assigned_to',staff]])await assert.rejects(db.query(`update support_conversations set ${column}=$1 where id=$2`,[value,conversation]),/permission denied/);}
  await identity(db,staff);await assert.rejects(db.query('select support_return_to_ai($1)',[conversation]),/Not assigned to you/);
  await db.query('select unit_set_priority($1,$2)',[conversation,'urgent']);await db.query('select unit_set_priority($1,$2)',[conversation,'normal']);
  await db.query('select support_take_over($1,false)',[conversation]);await db.query('select support_return_to_ai($1)',[conversation]);assert.equal((await state(db)).assigned_to,null);
  await identity(db,owner);await db.query('select support_resolve($1)',[conversation]);assert.equal((await state(db)).status,'resolved');
  await identity(db,owner);await db.query('select support_return_to_ai($1)',[conversation]);assert.equal((await state(db)).status,'ai');
  await identity(db,'','aal1','service_role');await db.query('update support_conversations set ai_confidence=.95 where id=$1',[conversation]);
  await db.exec('reset role');assert.equal((await db.query<{ai_confidence:string}>('select ai_confidence::text as ai_confidence from support_conversations')).rows[0].ai_confidence,'0.95');
 }finally{await db.close()}
});


// Execute the exact deployment artifact, not only isolated sections, to guard
// against accidental loss of its all-or-nothing security boundary.
test('combined security migration commits all dependent authorization changes together',async()=>{
 const db=await fixture(false);try{
  await db.exec(`
   alter table admin_roles add column can_manage_pickups boolean default false;
   create table orders(id uuid primary key,buyer_id uuid,status text,payment_status text);
   create table order_items(id uuid primary key,order_id uuid);
   create table return_requests(buyer_id uuid,status text,order_id uuid,order_item_id uuid);
   alter table return_requests enable row level security;
   create policy return_requests_insert_own on return_requests for insert to authenticated with check(auth.uid()=buyer_id);
   create table collection_requests(user_id uuid);
   alter table collection_requests enable row level security;
   create policy collection_requests_select_authenticated on collection_requests for select to authenticated using(user_id=auth.uid());
  `);
  const combined=readFileSync(new URL('../supabase/migrations/20261017140611_workflow_security_reconciliation.sql',import.meta.url),'utf8');
  await db.exec(combined);
  const policy=(await db.query<{with_check:string}>("select with_check from pg_policies where tablename='return_requests' and cmd='INSERT'")).rows[0].with_check;
  assert.match(policy,/submitted/);
  assert.equal((await db.query<{allowed:boolean}>("select has_column_privilege('authenticated','support_conversations','status','UPDATE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query<{allowed:boolean}>("select has_column_privilege('authenticated','support_conversations','assigned_to','UPDATE') allowed")).rows[0].allowed,false);
  await identity(db,customer);await db.query('select support_request_human($1)',[conversation]);
  assert.equal((await state(db)).human_requested,true);
 }finally{await db.close()}
});
