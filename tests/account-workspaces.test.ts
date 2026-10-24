import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { accountEntryDestination, accountWorkspaceCookie, accountWorkspaceDestination, accountWorkspaceForNavigation, accountWorkspaceFromPath, legacyAccountDestination, parseAccountWorkspace } from "../lib/account-workspaces.ts";
import { accountNavigationFor } from "../lib/workspace-navigation.ts";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
test("first account entry chooses a workspace; a valid remembered selection skips only that chooser",()=>{
  assert.equal(accountEntryDestination(undefined,false),null);
  assert.equal(accountEntryDestination("buyer",false),"/account/buyer");
  assert.equal(accountEntryDestination("seller",false),"/account/seller");
  assert.equal(accountEntryDestination("buyer",true),null);
  for(const value of ["admin","/admin","//evil.test","buyer/../admin",null,{},""]) assert.equal(parseAccountWorkspace(value),null);
});
test("workspace preferences are isolated per account and never choose another customer's saved mode",()=>{
  const preferences=new Map([[accountWorkspaceCookie("user-one"),"seller"]]);
  assert.equal(accountEntryDestination(preferences.get(accountWorkspaceCookie("user-two")),false),null);
  assert.notEqual(accountWorkspaceCookie("user-one"),accountWorkspaceCookie("user-two"));
});
test("order and item deep links override a remembered different workspace, and shared settings keep the current workspace",()=>{
  assert.equal(accountWorkspaceForNavigation("/account/seller/items","buyer"),"seller");
  assert.equal(accountWorkspaceForNavigation("/account/buyer/delivery","seller"),"buyer");
  assert.equal(accountWorkspaceForNavigation("/account/profile","seller"),"seller");
  assert.equal(accountWorkspaceForNavigation("/account","buyer"),null);
  for(const route of ["/account/buyers","/account/seller-admin","/admin"]) assert.equal(accountWorkspaceFromPath(route),null);
});
test("buyer and seller navigation advertise only their own features, with common profile and support",()=>{
  const buyer=accountNavigationFor("buyer").map(x=>x.href), seller=accountNavigationFor("seller").map(x=>x.href);
  assert.ok(buyer.includes("/account/buyer/delivery"));
  assert.ok(seller.includes("/account/seller/items"));assert.ok(seller.includes("/account/seller/earnings"));
  assert.equal(buyer.some(x=>x.startsWith("/account/seller")),false);
  assert.equal(seller.some(x=>x.startsWith("/account/buyer")),false);
  for(const route of ["/account/profile","/account/messages"]){assert.ok(buyer.includes(route));assert.ok(seller.includes(route));}
  for(const route of [...buyer,...seller]) assert.ok(existsSync(new URL(`../app${route}/page.tsx`,import.meta.url)),route);
});
test("legacy item and purchase destinations preserve notices and never return customers to the wrong workspace",()=>{
  assert.equal(legacyAccountDestination("/account/seller/items",{message:"Price saved & ready",type:"success"}),"/account/seller/items?message=Price+saved+%26+ready&type=success");
  assert.equal(legacyAccountDestination("/account/buyer",{tab:["orders","saved"],next:"https://evil.test"}),"/account/buyer?tab=orders&tab=saved&next=https%3A%2F%2Fevil.test");
  assert.equal(accountWorkspaceDestination("buyer"),"/account/buyer");
  assert.match(read("app/account/operations/page.tsx"),/\/account\/seller\/items/);
  assert.match(read("app/account/purchases/page.tsx"),/\/account\/buyer/);
});
test("shared profile contains no seller ledger and private buyer/seller reads retain explicit ownership filters",()=>{
  assert.doesNotMatch(read("app/account/profile/page.tsx"),/wallet_transactions|Pending sale earnings/);
  assert.match(read("app/account/seller/earnings/page.tsx"),/eq\("user_id",user.id\)/);
  assert.match(read("app/account/buyer/delivery/page.tsx"),/eq\("buyer_id",user.id\)/);
  assert.match(read("app/account/messages/page.tsx"),/redirect\("\/support"\)/);
  const support=read("components/customer-support.tsx");
  assert.match(support,/from\("support_conversations"\).*eq\("customer_id",userId\)/);
  assert.match(support,/from\("support_messages"\).*eq\("conversation_id",id\)/);
  const policies=read("supabase/migrations/20260905184700_security_audit_rls_performance.sql");
  assert.match(policies,/create policy read_messages on public.support_messages[\s\S]*?c.id=support_messages.conversation_id and \(c.customer_id=\(select auth.uid\(\)\) or private.is_support_admin\(\)\)/);
  assert.match(read("app/account/workspace-actions.ts"),/httpOnly: true/);
  assert.match(read("app/account/workspace-actions.ts"),/auth\.getUser\(\)/);
  assert.doesNotMatch(read("app/account/workspace-actions.ts"),/admin_roles|updateUser|user_metadata/);
});
