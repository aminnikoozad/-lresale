import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { validPushEndpoint } from "../lib/admin-push-policy.ts";

test("push delivery only contacts supported HTTPS push providers",()=>{
 for(const endpoint of ["https://fcm.googleapis.com/fcm/send/token","https://updates.push.services.mozilla.com/wpush/v2/token","https://web.push.apple.com/token","https://a.notify.windows.com/token"])assert.equal(validPushEndpoint(endpoint),true,endpoint);
 for(const endpoint of ["http://fcm.googleapis.com/token","https://fcm.googleapis.com.attacker.test/token","https://attacker.test/push.apple.com","https://localhost/token","https://127.0.0.1/token","https://fcm.googleapis.com:8443/token","https://user:pass@fcm.googleapis.com/token","file:///etc/passwd"])assert.equal(validPushEndpoint(endpoint),false,endpoint);
});
test("service worker handles push and restricts click destinations to admin",async()=>{
 const listeners={};
 let shown,opened,pending;
 const self={location:{origin:"https://shikimomo.com"},addEventListener:(type,handler)=>{listeners[type]=handler;},skipWaiting:()=>{},registration:{showNotification:(title,options)=>{shown={title,...options};return Promise.resolve();}},clients:{claim:()=>Promise.resolve()}};
 const clients={matchAll:async()=>[],openWindow:async(url)=>{opened=url;}};
 vm.runInNewContext(readFileSync(new URL("../public/admin-sw.js",import.meta.url),"utf8"),{self,clients,URL});
 listeners.push({data:{json:()=>({title:"Shikimomo",body:"New support activity.",tag:"support:test",url:"/admin/support"})},waitUntil:(p)=>{pending=p;}});
 await pending;assert.equal(shown.body,"New support activity.");assert.equal(shown.data.url,"/admin/support");
 listeners.notificationclick({notification:{close:()=>{},data:{url:"https://attacker.test"}},waitUntil:(p)=>{pending=p;}});
 await pending;assert.equal(opened,"/admin");
 listeners.notificationclick({notification:{close:()=>{},data:{url:"/admin/support/123"}},waitUntil:(p)=>{pending=p;}});
 await pending;assert.equal(opened,"/admin/support/123");
});
