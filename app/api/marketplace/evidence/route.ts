import { NextRequest,NextResponse } from "next/server";
import { marketplaceActor,submitEvidence } from "@/lib/marketplace-media";
import {readBoundedJson,RequestBodyTooLarge} from "@/lib/bounded-request";
const headers={"Cache-Control":"private, no-store"};
export async function POST(req:NextRequest){try{
 if(req.headers.get("origin")!==req.nextUrl.origin)return new Response(null,{status:403,headers});
 const ctx=await marketplaceActor();const {id,version,flaws,noLabel,attest}=await readBoundedJson(req,4096) as Record<string,unknown>;
 if(typeof id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||!Number.isSafeInteger(version)||Number(version)<1||typeof flaws!=="string"||!["no_known_flaws","has_flaws"].includes(flaws)||typeof noLabel!=="boolean"||attest!==true)throw new Error();
 await submitEvidence(ctx,id,version as number,flaws,noLabel,attest);return NextResponse.json({documented:true,purchasable:false},{headers});
 }catch(error){return NextResponse.json({error:error instanceof RequestBodyTooLarge?'request_body_too_large':'evidence_incomplete'},{status:error instanceof RequestBodyTooLarge?413:error instanceof Error&&error.message==='sign_in_required'?401:400,headers});}
}
