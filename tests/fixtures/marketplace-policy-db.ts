import {readFileSync} from 'node:fs';
import type {PGlite} from '@electric-sql/pglite';
export async function applySellerPolicy(db:PGlite){
 // PGlite has a fixed postgres database identity; hosted acceptance independently
 // checks the actual shikimomo_staging marker and database before writing.
 await db.exec('create function public.assert_synthetic_staging() returns void language plpgsql as $$begin return;end$$;');
 const s=readFileSync(new URL('../../supabase/migrations/20261021124346_marketplace_seller_policy_acceptance.sql',import.meta.url),'utf8');
 await db.exec(s.replace("current_database()<>'shikimomo_staging'","current_database()<>'postgres'"));
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261021203658_marketplace_final_submission.sql',import.meta.url),'utf8'));
}
