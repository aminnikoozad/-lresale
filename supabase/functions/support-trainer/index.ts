import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response(JSON.stringify({error:"This legacy bot has been retired. Open /assistant for the REWEAR shopping assistant."}),{status:410,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}));
