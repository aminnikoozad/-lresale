import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedBytes,readBoundedJson,readBoundedFormData,RequestBodyTooLarge} from '../lib/bounded-request.ts';
function streamed(parts:string[],length?:string){let cancelled=false;const enc=new TextEncoder();const stream=new ReadableStream<Uint8Array>({start(c){for(const p of parts)c.enqueue(enc.encode(p));},cancel(){cancelled=true;}});return{request:new Request('https://example.test',{method:'POST',body:stream,duplex:'half',headers:length?{'content-length':length}:{}} as RequestInit),cancelled:()=>cancelled};}
test('received chunked bytes enforce limits without trusting absent or understated Content-Length',async()=>{
 for(const length of [undefined,'1']){const r=streamed(['abc','def'],length);await assert.rejects(readBoundedBytes(r.request,5),RequestBodyTooLarge);assert.equal(r.cancelled(),true);}
 const tooBig=streamed(['x'],'99');await assert.rejects(readBoundedBytes(tooBig.request,5),RequestBodyTooLarge);assert.equal(tooBig.cancelled(),true);
});
test('byte limits count UTF-8 bytes; exact-boundary JSON remains valid',async()=>{
 const text='{"v":"é"}';const bytes=new TextEncoder().encode(text);assert.deepEqual(await readBoundedJson(new Request('https://example.test',{method:'POST',body:text}),bytes.length),{v:'é'});await assert.rejects(readBoundedJson(new Request('https://example.test',{method:'POST',body:text}),bytes.length-1),RequestBodyTooLarge);
});
test('bounded multipart still returns file bytes and fields; oversize is rejected before parsing',async()=>{
 const make=()=>{const f=new FormData();f.set('role','defect');f.set('file',new File([Uint8Array.of(1,2,3)],'sample.webp',{type:'image/webp'}));return new Request('https://example.test',{method:'POST',body:f});};
 const f=await readBoundedFormData(make(),4096);assert.equal(f.get('role'),'defect');assert.deepEqual(new Uint8Array(await (f.get('file') as File).arrayBuffer()),Uint8Array.of(1,2,3));await assert.rejects(readBoundedFormData(make(),4),RequestBodyTooLarge);
});
