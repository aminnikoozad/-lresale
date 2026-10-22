import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareListingPhoto} from '../lib/prepare-listing-photo.ts';

test('browser preparation rejects unsupported files and oversized originals before decoding',async()=>{
 await assert.rejects(prepareListingPhoto(new File(['<svg/>'],'item.svg',{type:'image/svg+xml'})),/format/);
 await assert.rejects(prepareListingPhoto(new File([new Uint8Array(25_000_001)],'item.jpg')),/source_size/);
});

test('browser preparation bounds dimensions, retries encoding, returns upload-ready JPEG and cleans up on errors',async t=>{
 const originalImage=globalThis.Image, originalDocument=globalThis.document;
 const revoked:string[]=[];let failDecode=false;let encodes=0;let outputTooBig=false;
 t.mock.method(URL,'createObjectURL',()=> 'blob:local-only');t.mock.method(URL,'revokeObjectURL',(url:string)=>revoked.push(url));
 const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){},drawImage(_image:unknown,_x:number,_y:number,w:number,h:number){assert.equal(w,1800);assert.equal(h,1350);}}),toBlob(callback:(blob:Blob)=>void,type:string){encodes++;assert.equal(type,'image/jpeg');callback(new Blob([new Uint8Array(outputTooBig||encodes===1?3_000_001:500_000)],{type}));}};
 Object.defineProperty(globalThis,'Image',{configurable:true,writable:true,value:class{naturalWidth=4000;naturalHeight=3000;onload=()=>{};onerror=()=>{};set src(value:string){if(value)queueMicrotask(()=>failDecode?this.onerror():this.onload());}}});
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement:()=>canvas}});
 try{
 const result=await prepareListingPhoto(new File([new Uint8Array(5_000_000)],'shirt.PNG'));
 assert.equal(result.type,'image/jpeg');assert.equal(result.name,'shirt.jpg');assert.equal(result.size,500_000);assert.equal(encodes,2);assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.equal(revoked.length,1);
 failDecode=true;await assert.rejects(prepareListingPhoto(new File(['broken'],'item.jpg')),/decode/);assert.equal(revoked.length,2);
 failDecode=false;outputTooBig=true;await assert.rejects(prepareListingPhoto(new File(['photo'],'item.jpg')),/compression/);assert.equal(canvas.width,0);assert.equal(revoked.length,3);
 }finally{Object.defineProperty(globalThis,'Image',{configurable:true,writable:true,value:originalImage});Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:originalDocument});}
});
