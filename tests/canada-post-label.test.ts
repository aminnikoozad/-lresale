import test from 'node:test';
import assert from 'node:assert/strict';
import { labelRequest, artifactUrl, createLabel, downloadLabel, type LabelInput } from '../lib/canada-post-label.ts';
const credentials={clientId:'id',clientSecret:'secret',customerNumber:'0001315168'};
const address={addressLine1:'123 Main St',city:'Ottawa',provState:'ON',countryCode:'CA' as const,postalZipCode:'K1A0B1'};
const input:LabelInput={requestId:'abc123',serviceCode:'DOM.RP',sender:{company:'Shop',contactPhone:'613-555-0100',addressDetails:address},destination:{name:'Buyer',addressDetails:address},parcel:{itemId:'x',weightGrams:500,lengthMm:300,widthMm:200,heightMm:100,mailingTube:false,unpackaged:false,band:1},mailingDate:'2026-10-20',payment:'CreditCard'};
const artifact='https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/shipping/v1/artifacts/123/shipping/456/0';
test('purchase uses immediate transmit, unique reference, packed dimensions and private PDF',()=>{
 const body=labelRequest(input,credentials); assert.equal(body.transmitShipment,true); assert.equal(body.customerRequestId,'abc123');
 assert.equal(body.deliverySpec.parcelCharacteristics.weight,.5); assert.equal(body.deliverySpec.settlementInfo.paidByCustomer,'0001315168'); assert.equal(body.deliverySpec.printPreferences.encoding,'PDF');
 assert.equal('createPublicKey' in body,false); assert.equal('groupId' in body,false);
 assert.throws(()=>labelRequest({...input,payment:'Account'},credentials));
 assert.throws(()=>labelRequest({...input,parcel:{...input.parcel,weightGrams:30001}},credentials));
 assert.throws(()=>labelRequest({...input,destination:{name:'Buyer',addressDetails:{...address,addressLine1:'x'.repeat(45)}}},credentials));
});
test('artifact fetch rejects off-origin, credentials, query strings and arbitrary carrier paths',()=>{
 assert.equal(artifactUrl(artifact),artifact);
 for(const url of ['https://evil.test/a',artifact+'?url=evil','https://user@api.canadapost-postescanada.ca'+new URL(artifact).pathname,artifact.replace('/artifacts/','/anything/')])assert.throws(()=>artifactUrl(url));
});
test('successful purchase parses actual charge and performs exactly one shipment POST',async()=>{
 const calls:string[]=[];
 const fetcher=(async(url)=>{calls.push(String(url));return calls.length===1?Response.json({access_token:'token'}):Response.json({shipmentId:'123',trackingPin:'123456789012',shipmentPrice:{dueAmount:12.34},links:[{rel:'label',href:artifact,mediaType:'application/pdf'}]});}) as typeof fetch;
 assert.deepEqual(await createLabel(input,credentials,fetcher),{shipmentId:'123',tracking:'123456789012',artifact,chargedCents:1234}); assert.equal(calls.length,2);assert.ok(calls[1].endsWith('/0001315168/0001315168/shipments'));
});
test('ambiguous purchase failure is never retried',async()=>{
 let posts=0;const fetcher=(async()=>{if(++posts===1)return Response.json({access_token:'token'});throw new Error('timeout');}) as typeof fetch;
 await assert.rejects(createLabel(input,credentials,fetcher));assert.equal(posts,2);
});
test('PDF route validates magic bytes and bounded content',async()=>{
 let calls=0; const fetcher=(async()=>++calls===1?Response.json({access_token:'token'}):new Response('%PDF-test',{headers:{'Content-Type':'application/pdf'}})) as typeof fetch;
 assert.equal(new TextDecoder().decode(await downloadLabel(artifact,credentials,fetcher)),'%PDF-test');
 calls=0; const invalid=(async()=>++calls===1?Response.json({access_token:'token'}):new Response('not PDF',{headers:{'Content-Type':'application/pdf'}})) as typeof fetch;
 await assert.rejects(downloadLabel(artifact,credentials,invalid));
});
