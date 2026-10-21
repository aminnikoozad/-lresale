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
