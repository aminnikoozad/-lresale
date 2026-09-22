# Canada Post rating and four weight bands

Adds to REWEAR's existing managed-resale checkout. No label purchases, buyer charges, seller payouts or commission changes. Canadian domestic destinations only. The existing seller-pickup and verified Montréal local-delivery rules remain separate.

## Weight groups

Defaults (inclusive upper bounds): Light 1–500 g; Small 501–2,000 g; Medium 2,001–5,000 g; Heavy 5,001–30,000 g. Admin → Postal Shipping can change all four bounds atomically. The 30 kg ceiling is a conservative automatic-rating limit; unsupported dimensions and heavier parcels require manual review. Bands are labels, never flat rates. Canada Post receives real weight in kg and sorted outer dimensions in cm, allowing it to calculate dimensional pricing, remote-area charges and applicable surcharges.

Each item/listing bundle is one separately packed parcel. Do not assume multiple items fit one box. All parcels must have a common service before a cart quote can be offered; prices are summed in integer CAD cents. An entire quote fails safely if one parcel cannot be rated.

## Activation

1. Obtain a Canada Post **Production** app with access to Rating API through https://developer-developpeur.canadapost-postescanada.ca/devportal-portaildesdeveloppeurs/developer-guide . Test apps return stubbed data and are not appropriate for checkout.
2. Set server-only Vercel environment variables: `CANADA_POST_CLIENT_ID`, `CANADA_POST_CLIENT_SECRET`, `CANADA_POST_MODE=production`, and `SUPABASE_SECRET_KEY` (or existing `SUPABASE_SERVICE_ROLE_KEY`). Never prefix these with NEXT_PUBLIC and never put them in source control.
3. Optionally set `CANADA_POST_CUSTOMER_NUMBER` and, for contract customers only, `CANADA_POST_CONTRACT_ID`. Without a customer number the adapter explicitly requests counter rates. API credential registration still requires the carrier account.
4. Redeploy. In `/admin/postal`, enter the real warehouse origin postal code, review bands and enable live quotes. Readiness indicators check presence only; they do not prove the carrier credentials work.
5. Record verified **packed** weight in grams and outer dimensions in millimetres for inventory. Clear manual review only after inspection. For Home & Decor, existing inspection packaging fields are reused unless overridden; existing shipping restrictions, local-only, oversize and manual-review flags still block automatic quoting.
6. Sign in with a buyer test account, put a listed measured item in the bag, use an outside-Montréal Canadian destination and obtain a real rate. Compare it with the Canada Post account rate tool, including taxes and surcharges. Test at least two destinations and a multi-parcel cart. This is the remaining activation gate when credentials are absent.

The code uses the April 2026 **JSON + OAuth 2.0** API, not the older XML/Basic-auth endpoint:
- POST `/cpc-api-native-oauth-provider/oauth2/token`
- POST `/rating/v1/prices`
- Fixed host `api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs`
- Official OpenAPI: https://developer-developpeur.canadapost-postescanada.ca/devportal-portaildesdeveloppeurs/download/4671/document

## Security and checkout

Authenticated requests only; 1–25 distinct listed IDs; no buyer-supplied prices or measurements. Shared Postgres rate limiter permits five quote preparations per account per minute. Carrier requests have timeouts, redirects disabled and bounded concurrency. No carrier payloads or credentials enter logs. No fallback fabricated price is used.

Only the server service credential inserts carrier quotes. RLS allows buyers to read only their own quote records. Admin changes use the existing shipping permission plus mandatory AAL2 MFA and audit entries. Public catalog RPCs are unchanged; staff inspection notes are not returned.

A quote lasts 10 minutes and is bound to buyer, item set, destination, package/inspection revisions and configuration revision. Checkout locks inventory and verifies this snapshot, selected service and expiry, then calls the existing atomic checkout RPC. It stores `orders.shipping_cents` including shipping taxes. It leaves final total unset and payment `not_configured`: item taxes and payment remain a separate future integration. Never add shipping tax twice. A future payment activation MUST revalidate or refresh the quote and must not charge an order with missing shipping.

Customers can still save delivery details without a quote for manual review. UI explicitly says shipping is unconfirmed. City name alone does not grant free Montréal delivery. Changes to the existing flat-fee mode pause automatic postal rating rather than silently override that policy.

## Verification

`npm run test:security`, lint and build. Tests include all band boundaries, malformed/negative carrier amounts, OAuth request shape, multi-parcel common-service intersection, provider failure, Postgres RLS and role denial, MFA, quote forgery prevention, wrong buyer/destination/service, expiry, edited parcels, one-use checkout and rate limiting. Database tests use isolated Postgres fixtures and the actual existing checkout function. Production credentials are not replaced by mocked success.

Pending live acceptance when credentials are absent: real carrier response/rate comparison and authenticated mobile checkout. Default configuration is paused, with no invented warehouse address. No emails, labels or charges are triggered.

The separate unmerged `shipping-canada-configurable-20260922` branch was inspected but not merged: it implements internal rate formulas, not this live carrier adapter. This implementation uses `postal_*` names to avoid silently overwriting that work.
