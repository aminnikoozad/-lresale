/** Count received bytes, including chunked bodies; Content-Length is only an early hint. */
export class RequestBodyTooLarge extends Error {
 constructor(){super('request_body_too_large');}
}
export async function readBoundedBytes(request:Request,limit:number):Promise<Uint8Array>{
 if(!Number.isSafeInteger(limit)||limit<1)throw new Error('Invalid request limit');
 const length=request.headers.get('content-length');
 if(length&&/^\d+$/.test(length)&&Number(length)>limit){await request.body?.cancel();throw new RequestBodyTooLarge();}
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>limit){await reader.cancel();throw new RequestBodyTooLarge();}chunks.push(next.value);}}finally{reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
export async function readBoundedJson(request:Request,limit:number):Promise<unknown>{return JSON.parse(new TextDecoder().decode(await readBoundedBytes(request,limit)));}
export async function readBoundedFormData(request:Request,limit:number){
 const bytes=await readBoundedBytes(request,limit);
 return new Response(Buffer.from(bytes),{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();
}
