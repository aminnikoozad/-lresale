import "server-only";
import { neon } from "@neondatabase/serverless";
import type { DraftAction,MarketplaceDraft } from "./marketplace";
export const stagingActors = {
  a:"71000000-0000-4000-8000-000000000001",
  b:"71000000-0000-4000-8000-000000000002",
} as const;
export type StagingActor = keyof typeof stagingActors;
export function isNeonStaging() {
  return process.env.VERCEL_ENV === "preview" && process.env.SHIKIMOMO_NEON_STAGING === "true" && process.env.NEXT_PUBLIC_STAGING_BACKEND === "neon";
}
function client() {
  if(!isNeonStaging()) throw new Error("SQL staging is unavailable");
  const connection=process.env.SHIKIMOMO_STAGING_DATABASE_URL;
  if(!connection) throw new Error("Staging database is not configured");
  const url=new URL(connection);
  if(!["postgres:","postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech") || url.pathname!=="/shikimomo_staging" || url.username!=="staging_gateway") throw new Error("Wrong staging connection");
  return neon(connection);
}
function claims(actor:StagingActor) {
  return JSON.stringify({sub:stagingActors[actor],role:"authenticated",aal:"aal1",is_anonymous:false});
}
export async function stagingDrafts(actor:StagingActor) {
  const sql=client();
  const result=await sql.transaction([
    sql`select public.assert_synthetic_staging()`,
    sql`select set_config('request.jwt.claims',${claims(actor)},true)`,
    sql`set local role authenticated`,
    sql`select public.my_marketplace_drafts() as drafts`,
  ]);
  return result[3][0].drafts as MarketplaceDraft[];
}
export async function saveStagingDraft(actor:StagingActor,id:string|null,version:number,fields:Record<string,unknown>) {
  const sql=client();
  const result=await sql.transaction([
    sql`select public.assert_synthetic_staging()`,
    sql`select set_config('request.jwt.claims',${claims(actor)},true)`,
    sql`set local role authenticated`,
    sql`select public.save_marketplace_draft(${id}::uuid,${version}::integer,${JSON.stringify(fields)}::jsonb) as saved`,
  ]);
  return result[3][0].saved as {id:string;version:number};
}
export async function manageStagingDraft(actor:StagingActor,id:string,version:number,operation:DraftAction,request:string) {
  const sql=client();
  const result=await sql.transaction([
    sql`select public.assert_synthetic_staging()`,
    sql`select set_config('request.jwt.claims',${claims(actor)},true)`,
    sql`set local role authenticated`,
    sql`select public.manage_marketplace_draft(${id}::uuid,${version}::integer,${operation}::text,${request}::uuid) as managed`,
  ]);
  return result[3][0].managed as {id:string;version:number};
}
export type RegisteredPhoto={item:string;owner:string;version:number;asset:string;role:string;defect:string;provider:string;key:string;sha:string;width:number;height:number;bytes:number};
export async function stagingRegisterPhoto(actor:StagingActor,p:RegisteredPhoto) {
  const sql=client();
  const result=await sql.transaction([sql`select public.assert_synthetic_staging()`,sql`select set_config('request.jwt.claims',${claims(actor)},true)`,
    sql`select public.register_marketplace_photo(${p.item}::uuid,${p.owner}::uuid,${p.version}::integer,${p.asset}::uuid,${p.role},${p.defect},${p.provider},${p.key},${p.sha},${p.width}::integer,${p.height}::integer,${p.bytes}::integer) as saved`]);
  return result[2][0].saved;
}
export async function stagingPhoto(actor:StagingActor,id:string) {
  const sql=client();
  const result=await sql.transaction([sql`select public.assert_synthetic_staging()`,sql`select set_config('request.jwt.claims',${claims(actor)},true)`,sql`set local role authenticated`,sql`select public.my_marketplace_photo(${id}::uuid) as photo`]);
  return result[3][0].photo as {key:string;provider:string;item:string}|null;
}
export async function stagingWithdrawPhoto(actor:StagingActor,id:string,version:number) {
  const sql=client();await sql.transaction([sql`select public.assert_synthetic_staging()`,sql`select set_config('request.jwt.claims',${claims(actor)},true)`,sql`set local role authenticated`,sql`select public.withdraw_marketplace_photo(${id}::uuid,${version}::integer)`]);
}
export async function stagingSubmitEvidence(actor:StagingActor,id:string,version:number,flaws:string,noLabel:boolean,attest:boolean) {
  const sql=client();const result=await sql.transaction([sql`select public.assert_synthetic_staging()`,sql`select set_config('request.jwt.claims',${claims(actor)},true)`,sql`set local role authenticated`,sql`select public.submit_marketplace_evidence(${id}::uuid,${version}::integer,${flaws},${noLabel},${attest}) as evidence`]);return result[3][0].evidence;
}

/** Only static, reviewed community RPC definitions may reach this adapter. */
export async function stagingCommunity(actor:StagingActor,name:import('./marketplace-community-types').CommunityRpc,args:Record<string,unknown>) {
  const {communityRpcDefinitions}=await import('./marketplace-community-types');
  if(!Object.hasOwn(communityRpcDefinitions,name)) throw new Error('Unknown action');
  const definition=communityRpcDefinitions[name];
  const query=`select public.${name}(${definition.map((d,i)=>`$${i+1}::${d[1]}`).join(',')}) as value`;
  const sql=client();const result=await sql.transaction([sql`select public.assert_synthetic_staging()`,sql`select set_config('request.jwt.claims',${claims(actor)},true)`,sql`set local role authenticated`,sql.query(query,definition.map(d=>args[d[0]]??null))]);
  return result[3][0].value;
}
