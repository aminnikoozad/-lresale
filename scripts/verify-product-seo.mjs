import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const cwd=process.cwd();
let mode='available';
const id='00000000-0000-4000-8000-000000000001';
const item={item_id:id,name:'Blue cotton shirt',brand:'Example',category:'women',subcategory:null,size:'M',item_condition:'Good',color:'Blue',material:'Cotton',pattern:null,condition_notes:null,description:'Light wear on the cuffs.',photo_urls:['http://127.0.0.1/shirt.webp'],photo_url:'http://127.0.0.1/shirt.webp',price_cents:1250,published_at:'2026-10-24T00:00:00Z',inspected_at:null};
const requests=[];
const mock=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;requests.push(path);
 let body='';for await(const chunk of req)body+=chunk;
 res.setHeader('Content-Type','application/json');
 if(mode==='outage'&&path.includes('/rpc/')){res.statusCode=503;res.end(JSON.stringify({code:'TEST_OUTAGE',message:'Fixture unavailable'}));return;}
 let data=[];
 if(path.endsWith('/pilot_settings'))data={enabled:true,categories:['women'],item_cap:null,pickup_days:[0,6],duration_weeks:8,started_at:null};
 else if(path.endsWith('/rpc/catalog_items_v3'))data=[item,{...item,item_id:'00000000-0000-4000-8000-000000000002',category:'electronics'}];
 else if(path.endsWith('/rpc/buyer_catalog_item_detail'))data=JSON.parse(body).target_item_id===id?[{...item,availability:mode}]:[];
 else if(path.endsWith('/rpc/get_shipping_policy'))data={};
 res.end(JSON.stringify(data));
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const port=mock.address().port;
const next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3213','--hostname','127.0.0.1'],{cwd,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${port}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_fixture',NEXT_PUBLIC_APP_ENV:'staging',VERCEL_ENV:'development',NEXT_TELEMETRY_DISABLED:'1'}});
let logs='';next.stdout.on('data',x=>logs+=x);next.stderr.on('data',x=>logs+=x);
next.on('error',error=>{logs+=String(error);});
// HTML-only crawlers receive blocking metadata, so status-code checks are deterministic.
const get=(path,userAgent='Googlebot')=>fetch(`http://127.0.0.1:3213${path}`,{headers:{'User-Agent':userAgent},signal:AbortSignal.timeout(10000)});
try{
 let ready=false;
 for(let n=0;n<20;n++){if(next.exitCode!==null)break;try{const r=await get('/robots.txt');if(r.ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,1000));}
 assert(ready,'Next dev did not start');
 for(const [state,expected] of [['available','InStock'],['reserved','OutOfStock'],['sold','SoldOut']]){
  mode=state;const response=await get(`/item/${id}?sizes=M`);assert.equal(response.status,200);
  const html=await response.text();
  assert(html.includes('<title>Blue cotton shirt | Shikimomo</title>'));
  assert(html.includes(`rel="canonical" href="https://shikimomo.com/item/${id}"`));
  const blocks=[...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1]));
  const product=blocks.find(b=>b['@type']==='Product');assert(product);
  assert.equal(product.offers.availability,`https://schema.org/${expected}`);assert.equal(product.offers.price,'12.50');
 }
 mode='available';
 const sitemap=await get('/sitemap.xml');assert.equal(sitemap.status,200);const xml=await sitemap.text();
 assert(xml.includes(`/item/${id}`));assert(!xml.includes('00000000-0000-4000-8000-000000000002'));
 assert(!xml.includes('/account'));assert(!xml.includes('<loc>https://shikimomo.com/</loc>'));
 const missing=await get('/item/00000000-0000-4000-8000-000000000099','Twitterbot');
 const missingHtml=await missing.text();assert([200,404].includes(missing.status));assert(/name="robots" content="noindex/.test(missingHtml));assert(!missingHtml.includes('schema.org/InStock'));
 const invalid=await get('/item/------------------------------------','Twitterbot');
 const invalidHtml=await invalid.text();assert([200,404].includes(invalid.status));assert(/name="robots" content="noindex/.test(invalidHtml));
 const login=await get('/login');assert(login.headers.get('x-robots-tag')?.includes('noindex'));
 const shop=await get('/shop');assert.equal(shop.status,200);assert.equal(shop.headers.get('x-robots-tag'),'all');
 mode='outage';const outage=await get('/sitemap.xml');assert.equal(outage.status,500);
 const unavailable=await get(`/item/${id}`,'Twitterbot');const unavailableHtml=await unavailable.text();assert(!unavailableHtml.includes('schema.org/InStock'));assert(unavailable.status===500 || unavailableHtml.includes('Item temporarily unavailable'));
 console.log('PASS: real Next HTTP responses verified for available/reserved/sold product metadata + JSON-LD, canonical query removal, sitemap pilot filtering, missing/invalid item exclusion (including streamed not-found responses), private noindex, public shop indexing, and database failure handling.');
 console.log('Mock only received public catalogue/policy reads:',[...new Set(requests)].join(', '));
}catch(e){console.error(e);console.error(logs.slice(-4000));process.exitCode=1;}
finally{next.kill('SIGTERM');mock.closeAllConnections();mock.close();}
