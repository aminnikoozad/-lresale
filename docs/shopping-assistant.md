# REWEAR personal shopping assistant

Replaces the legacy customer support bot UI and trainer with a two-mode storefront: `/` offers a choice, `/shop` retains the catalog, and `/assistant` handles conversation, product cards and reviewed customer operations. The cart is shared. The SVG mark is provisional and lightweight.

## Activation blocker

The deployed `rewear-assistant` Supabase function currently returns HTTP 503 because `OPENAI_API_KEY` is not configured. Add a project-scoped OpenAI key in Supabase Edge Function Secrets; never put it in frontend code or a NEXT_PUBLIC variable. Optionally set `OPENAI_SUPPORT_MODEL` and `OPENAI_REALTIME_MODEL` for tested model access. Defaults are `gpt-5-mini` and `gpt-realtime-2.1`. Verify model access and provider spend limits before launch. Realtime uses WebRTC through the unified calls interface, not browser speech recognition. No audio recordings are saved by the app.

`ALLOWED_APP_ORIGINS` must contain the actual production origin and any selected preview origin, comma-separated. The production default is `https://lresale.vercel.app`. Anonymous browsing is intentional; the Edge function validates the application API key, validates bearer user sessions, and enforces DB-backed identity and global quotas before paid model requests. Guest access does not grant account access. Model tools only propose operations; writes use authenticated customer routes or the original pickup server action and RLS. The model never receives the service-role key.

Migration `20261014235000_shopping_assistant.sql` is additive and has been applied. It stores account shopping preferences, explicitly requested in-app stock watches, and service-only usage counters. Account preferences have visible controls to edit through conversation, disable or erase. Only explicitly stated size, style, brand, budget and color are eligible. Conversations are stored in sessionStorage scoped by signed-in user; signing out switches to a separate guest history. Stock watches are checked when opening the assistant and notify inside that interface. Email/push/SMS notification delivery is not implemented.

The new assistant Edge function is deployed. The legacy function retirement source returns HTTP 410. Do not deploy that retirement or release this branch to production until text and voice have been tested with a working provider key. Legacy records are retained as support history; the historical SQL migrations remain unchanged. Staff still have human support; the removed trainer and correction controls do not update the new assistant.

## Implemented operations

Inventory search across all enabled catalog categories with exact matches and labelled alternatives; natural-language requests in English/French; optional image input; product details; add/remove bag; delivery detail draft and checkout handoff; save/unsave favorites; arrange a pickup using the existing validated server action; confirm/cancel pickup; approve item/bundle price; schedule automatic publication; set unsold disposition; cancel a prepared checkout; request a return; change username; mark price alerts read. Private account context is queried as the user, scoped by ownership. Human support is available through assistant settings and uses existing customer support RPCs and subscriptions.

The existing checkout has no active payment gateway. It explicitly saves an awaiting-payment order without charging. This change does not activate payments. All monetary writes show a review card and require a button. Voice confirmation of final writes is not enabled; the voice model can prepare the same review cards. Pickup legal consent boxes cannot be filled by a model.

## Verification

Run `npm run test:security`, `npm run generate:admin-salt`, `npx tsc --noEmit`, and `npm run build`. New tests cover multilingual inventory filters, searches beyond 250 items, labelled alternatives, operation allowlists, RLS isolation and persistent quotas. After configuring the key, manually verify English and French text, image input, continuous voice, interruptions, microphone release on route exit, cart continuity, account switches, pickup validation, concurrent submissions, in-app watch opt-in and deletion, and unavailable-stock handling. Successful build and unit tests are not a substitute for those provider/browser checks.
