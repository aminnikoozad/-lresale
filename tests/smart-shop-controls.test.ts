import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const sql=readFileSync(new URL('../supabase/migrations/20261015061508_smart_shop_admin_controls.sql',import.meta.url),'utf8');
const owner='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002';
test('only a verified authorized admin can change availability; audit is private and immutable',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${customer}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
 create function public.can_manage_selling_rules() returns boolean language sql stable as $$select auth.uid()='${owner}'::uuid$$;
 grant usage on schema auth,public to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;`);
 await db.exec(sql);
 const as=async(id:string,aal='aal2')=>db.exec(`reset role;select set_config('test.uid','${id}',false);select set_config('test.aal','${aal}',false);set role authenticated;`);
 await db.exec('set role anon');assert.equal((await db.query<{enabled:boolean}>('select enabled from public.smart_shop_settings')).rows[0].enabled,false);
 await assert.rejects(db.exec('update public.smart_shop_settings set enabled=true'));
 await as(customer);assert.equal((await db.query('update public.smart_shop_settings set enabled=true returning id')).rows.length,0);assert.equal((await db.query('select * from public.smart_shop_settings_audit')).rows.length,0);
 await assert.rejects(db.exec('insert into public.smart_shop_settings(id) values(1)'));
 await as(owner,'aal1');assert.equal((await db.query('update public.smart_shop_settings set enabled=true returning id')).rows.length,0);
 await as(owner);await db.exec('update public.smart_shop_settings set enabled=true,voice_enabled=false where id=1');
 assert.equal((await db.query('select * from public.smart_shop_settings_audit')).rows.length,1);
 await assert.rejects(db.exec('delete from public.smart_shop_settings_audit'));
 await assert.rejects(db.exec("update public.smart_shop_settings set notice_en=repeat('a',301)"));
 await as(customer);const status=await db.query<{enabled:boolean;voice_enabled:boolean}>('select enabled,voice_enabled from public.smart_shop_settings');assert.deepEqual(status.rows,[{enabled:true,voice_enabled:false}]);
 assert.equal((await db.query('select * from public.smart_shop_settings_audit')).rows.length,0);
 }finally{await db.close();}
});
