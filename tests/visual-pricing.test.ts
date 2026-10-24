import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateVisual,safeHttps} from '../lib/pricing/visual.ts';
const now=new Date('2026-10-24T10:00:00Z');
const match=(n:number,currency='CAD',condition='Used',url=`https://shop.example/item/${n}`)=>({title:`Item ${n}`,link:url,source:'Shop',price:{extracted_value:n,currency},condition});
test('visual prices remain listed/unverified, prefer used prices, and never invent exact-match confidence',()=>{
 const r=estimateVisual({visual_matches:[match(10),match(20),match(30),match(100,'CAD','New')]},null,now);
 assert.equal(r.suggestedCents,2000);assert.equal(r.pricedCount,3);assert.equal(r.basis,'used_asking_prices');assert.equal(r.confidence,'low');
 assert.ok(r.matches.every(m=>m.priceType==='listed'&&m.matchType==='visual_unverified'));
});
test('ambiguous dollar signs, missing prices, duplicates and malicious URLs cannot manufacture prices',()=>{
 const r=estimateVisual({visual_matches:[match(10,'$'),match(20,'$','Used','https://shop.example/item/10?utm_source=x'),match(30,'CAD','Used','javascript:alert(1)'),{title:'No price',link:'https://shop.example/no-price'}]},null,now);
 assert.equal(r.suggestedCents,null);assert.equal(r.confidence,'insufficient');assert.equal(r.matches.length,2);
 assert.equal(safeHttps('https://user:password@shop.example/a'),null);assert.equal(safeHttps('https://127.0.0.1/a'),null);
});
test('FX uses explicit currencies with fresh rates; stale/absent rates never guess conversion',()=>{
 const payload={visual_matches:[match(10,'USD')]};
 assert.equal(estimateVisual(payload,{date:'2026-10-23',rates:{USD:1.4}},now).suggestedCents,1400);
 assert.equal(estimateVisual(payload,{date:'2026-10-01',rates:{USD:1.4}},now).suggestedCents,null);
 assert.equal(estimateVisual(payload,null,now).suggestedCents,null);
 assert.equal(estimateVisual({visual_matches:[]},null,now).suggestedCents,null);
 assert.throws(()=>estimateVisual({error:'Bad API key'},null,now));
});
test('even sample sizes use a true median instead of the higher middle price',()=>{
 const r=estimateVisual({visual_matches:[match(10),match(30)]},null,now);
 assert.equal(r.suggestedCents,2000);assert.equal(r.lowCents,1500);assert.equal(r.highCents,2500);
});
test('meaningful product query parameters remain distinct while tracking-only duplicates merge',()=>{
 const r=estimateVisual({visual_matches:[match(10,'CAD','Used','https://shop.example/product?id=a'),match(30,'CAD','Used','https://shop.example/product?id=b'),match(10,'CAD','Used','https://shop.example/product?id=a&utm_source=ad')]},null,now);
 assert.equal(r.pricedCount,2);assert.equal(r.suggestedCents,2000);
});

test('a duplicate with an explicit usable price improves an unpriced match without double counting',()=>{
 const r=estimateVisual({visual_matches:[match(10,'$'),match(20,'CAD','Used','https://shop.example/item/10?utm_source=x')]},null,now);
 assert.equal(r.matches.length,1);assert.equal(r.pricedCount,1);assert.equal(r.suggestedCents,2000);
});
