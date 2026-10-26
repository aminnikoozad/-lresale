import { readPublicListingPhoto } from "@/lib/marketplace-media";
export const runtime="nodejs";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return new Response(null,{status:404,headers});
 try {const bytes=await readPublicListingPhoto(id);return new Response(Buffer.from(bytes),{headers:{...headers,"Content-Type":"image/webp"}});}catch{return new Response(null,{status:404,headers});}
}
