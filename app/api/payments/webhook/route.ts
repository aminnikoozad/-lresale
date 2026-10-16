import {NextResponse} from "next/server";
/** Attach a provider-specific signature verifier and verify the complete payment story before enabling. */
export async function POST(){return NextResponse.json({error:"payment_provider_not_configured"},{status:503});}
