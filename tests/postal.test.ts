import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightBand, validPostal, validateItemIds } from '../lib/postal.ts';
import { mailingScenario, parseRates, combineRates, canadaPostRates } from '../lib/canada-post.ts';
const parcel={itemId:'00000000-0000-4000-8000-000000000001',weightGrams:501,lengthMm:100,widthMm:300,heightMm:200,mailingTube:false,unpackaged:false,band:2};
const response=[{serviceCode:'DOM.RP',serviceName:'Regular Parcel',priceDetails:{due:12.34,taxes:{gst:{amt:0.59}}},serviceStandard:{expectedTransitTime:3}}];
test('Four contiguous weight bands, boundaries and invalid weights',()=>{
 for(const [grams,band] of [[1,1],[500,1],[501,2],[2000,2],[2001,3],[5000,3],[5001,4],[30000,4],[30001,null],[0,null],[NaN,null],[Infinity,null]])assert.equal(weightBand(grams!),band);
 assert.equal(weightBand(1000,[1000,3000,10000,25000]),1);
 assert.throws(()=>weightBand(10,[500,500,1000,30000]));
 assert.ok(validPostal(' h2x 1y4 '));assert.ok(!validPostal('W1A 1A1'));assert.ok(!validPostal('H2X!1Y4'));
 assert.ok(validateItemIds([parcel.itemId]));assert.ok(!validateItemIds([parcel.itemId,parcel.itemId]));assert.ok(!validateItemIds(['------------------------------------']));
});
test('Actual grams and dimensions reach Canada Post; account rates are explicit',()=>{
 const body=mailingScenario(parcel,'H2X1Y4','K1A0B1',{clientId:'test',clientSecret:'secret'});
 assert.equal(body.parcelCharacteristics.weight,0.501);assert.deepEqual(body.parcelCharacteristics.dimensions,{length:30,width:20,height:10});assert.equal(body.quoteType,'counter');assert.equal(body.customerNumber,undefined);
 assert.throws(()=>mailingScenario({...parcel,weightGrams:NaN},'H2X1Y4','K1A0B1',{clientId:'test',clientSecret:'secret'}));
});
test('Carrier amount includes all charges exactly once; malformed rates never become free shipping',()=>{
 const rates=parseRates(response);assert.equal(rates[0].totalCents,1234);assert.equal(rates[0].taxCents,59);
 const combined=combineRates([rates,rates]);assert.equal(combined[0].totalCents,2468);assert.equal(combined[0].taxCents,118);
 assert.deepEqual(combineRates([rates,[]]),[]);
 for(const due of [null,'',-1,'NaN',12.345])assert.throws(()=>parseRates([{...response[0],priceDetails:{due}}]));
});
test('OAuth + JSON rating uses fixed endpoints; no label purchase or fallback rate',async()=>{
 const calls:{url:string;init?:RequestInit}[]=[];
 const mock:typeof fetch=async(input,init)=>{calls.push({url:String(input),init});return new Response(JSON.stringify(calls.length===1?{access_token:'token'}:response),{status:200});};
 const result=await canadaPostRates([parcel],'H2X1Y4','K1A0B1',{clientId:'test',clientSecret:'secret'},mock);
 assert.equal(result[0].totalCents,1234);assert.equal(calls.length,2);assert.match(calls[0].url,/oauth2\/token$/);assert.match(calls[1].url,/rating\/v1\/prices$/);assert.equal(calls[1].init?.redirect,'error');
 assert.equal(JSON.parse(String(calls[1].init?.body)).destination.domestic.postalCode,'K1A0B1');
 const unavailable:typeof fetch=async()=>new Response('',{status:503});
 await assert.rejects(canadaPostRates([parcel],'H2X1Y4','K1A0B1',{clientId:'test',clientSecret:'secret'},unavailable));
});
