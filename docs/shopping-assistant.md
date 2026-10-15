# Shikimomo personal shopping assistant

Replaces the legacy customer support bot UI and trainer with a two-mode storefront: `/` offers a choice, `/shop` retains the catalog, and `/assistant` handles conversation, product cards and reviewed customer operations. The cart is shared. The SVG mark is provisional and lightweight.

## Owner-hosted inference activation

The current source uses only the owner's inference service. OpenAI chat/realtime calls and the browser's OpenAI network permission have been removed. The service package, hardware prerequisites and installation steps are in `services/local-ai/README.md`. Configure `SELF_HOSTED_AI_URL` and `SELF_HOSTED_AI_TOKEN` as server-only secrets in Supabase and Vercel after installing on the owner's machine. There is no fallback to a cloud AI provider. The website remains hosted on Vercel/Supabase.

Text uses a fixed HTTPS inference host. Continuous voice uses a same-origin audio transport, an AudioWorklet, owner-hosted faster-whisper/Piper and the same shopping logic as text. The inference service has no database keys or customer mutation endpoints. If the local host is absent, the site reports unavailable; this is not a live deployment. Image search is hidden and explicitly rejected until a local vision model is added.

Guest browsing remains intentional. The Edge validates the application key and any real bearer session; private reads and actions retain customer ownership checks. Model tools propose operations, and writes use authenticated customer routes or the original pickup server action and RLS. The model never receives a service-role key.

Migration `20261014235000_shopping_assistant.sql` is additive and has been applied. It stores account shopping preferences, explicitly requested in-app stock watches, and service-only usage counters. Account preferences have visible controls to edit through conversation, disable or erase. Memory accepts explicitly stated size, style, brand, budget, color, fit, occasion and dislikes. Repeated verified favorites/bag feedback may produce a separately labelled tentative style inference; a single click or a gift request must not become a lasting personal preference. Sensitive traits and addresses are excluded. Conversations are stored in sessionStorage scoped by signed-in user; signing out switches to a separate guest history. Stock watches are checked when opening the assistant and notify inside that interface. Email/push/SMS notification delivery is not implemented.

The owner-hosted assistant Edge version is deployed; it returns `self_hosted_not_configured` until the owner host is connected. The legacy function retirement source returns HTTP 410. Do not deploy that retirement or release this branch to production until text and voice have been tested against the owner-hosted inference service. Legacy records are retained as support history; the historical SQL migrations remain unchanged. Staff still have human support; the removed trainer and correction controls do not update the new assistant.

## Implemented operations

Inventory search across all enabled catalog categories with exact matches and labelled alternatives; natural-language requests in English/French;  product details; add/remove bag; delivery detail draft and checkout handoff; save/unsave favorites; arrange a pickup using the existing validated server action; confirm/cancel pickup; set unsold disposition; cancel a prepared checkout; request a return; change username; mark price alerts read. Private account context is queried as the user, scoped by ownership. Human support is available through assistant settings and uses existing customer support RPCs and subscriptions.

The existing checkout has no active payment gateway. It explicitly saves an awaiting-payment order without charging. This change does not activate payments. All monetary writes show a review card and require a button. Voice confirmation of final writes is not enabled; the voice model can prepare the same review cards. Pickup legal consent boxes cannot be filled by a model.

## Verification

Run `npm run test:security`, `npm run generate:admin-salt`, `npx tsc --noEmit`, and `npm run build`. New tests cover multilingual inventory filters, searches beyond 250 items, labelled alternatives, operation allowlists, RLS isolation and persistent quotas. After connecting the owner-hosted service, manually verify English and French text, unsupported-image rejection, continuous voice, interruptions, microphone release on route exit, cart continuity, account switches, pickup validation, concurrent submissions, in-app watch opt-in and deletion, and unavailable-stock handling. Successful build and unit tests are not a substitute for those local-model/browser checks.

## Follow-up UI and authorization fixes

The entry page now contains only the two choices (Enter website / Smart Shopping, translated in French), plus brand and language switch. Smart Shopping exposes explicit Chat / Live voice controls and a Start live voice button, including after a chat has begun. Switching back to chat or leaving the route releases microphone tracks; cancelled permission requests cannot silently start a late session. Typed and spoken requests share the same conversation and customer authorization path.

Every private write uses a positive ownership check at the server gateway before the underlying RLS/RPC checks. This check applies even when the signed-in person also has an administrative role. The model has no tools for arbitrary RPCs, table names, server URLs, role selection, inventory administration, policy editing or payment confirmation. The service-role client in the Edge function is used only by the fixed quota implementation, never exposed as a model tool. Existing seller snapshot SQL was checked to restrict items to `owner_id = auth.uid()`.

The owner-hosted service URL and private token must be configured before activation. No cloud AI key is required by the current source.

## Strict customer-only boundary

Pricing approval and automatic publication were removed from Smart Shopping in response to the owner's explicit scope correction. This applies even when the customer owns the item and even if that person also has a staff role. The customer operation schema, authorization gate and execution route all reject these commands. Neither chat nor live voice can change/approve prices, publish or edit inventory, approve refunds/payouts, manage users or configure policies. Existing customer portal and administrative pages are unchanged; the assistant cannot invoke their pricing or publication actions. Cached legacy action cards are rejected safely.

## Styling and customer context

Styling instructions cover fit, silhouettes, colour combinations, fabrics, layering, occasion and budget. Recommendations must use verified listings, with no invented size, fabric, condition or current-fashion claims. The most recent product-card order is preserved so follow-ups such as “the second one, but cheaper” refer to the correct products. Bag and favorites context is rebuilt from real catalog records rather than trusting client-supplied attributes.

Read-only customer context also includes the customer's visible account messages, return statuses, price-drop alerts, bundles and basic profile, always under explicit ownership filters. Histories are bounded and failed reads are marked unavailable; they cannot be used to claim a complete wallet balance. Bundle context grants no pricing or publication actions.

The target remains parity with public/customer features, subject to the explicit exclusion of pricing and administration. Conversational shipping quote execution and a deterministic earnings estimator are not implemented yet; customers can still use the existing site tools. Local-model stylist accuracy and voice latency require the hardware/browser activation checks above.

## Self-hosted verification checkpoint

Local runtime dependencies installed from `requirements.lock`. Piper generated actual English and French speech; faster-whisper small transcribed both generated utterances correctly using the gateway PCM path (CPU, roughly one second per short test utterance; not an end-to-end customer latency benchmark). Six HTTP gateway tests, four host/audio/worklet/response tests, and existing customer authorization tests passed. The owner's machine, network reachability, GPU/CPU capacity, Docker/TLS deployment, actual Qwen tool-calling quality and browser voice remain unverified until the host is identified. No owner-machine installation has occurred.

## Production shell release — 2026-10-15
The owner authorized publication of the interface before hardware activation. The storefront preserves current Shikimomo branding. The server renders Smart Shopping unavailable unless its private owner-host configuration exists; chat submissions and microphone starts are disabled in that state, with links to the shop and account. This release does not activate AI or retire legacy deployed Edge functions. End-to-end model and voice validation remains pending.
