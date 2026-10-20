# Canada Post label purchases

The existing production credentials and Rating API remain in use. Do not create another production app. Add **Shipping** to that app. Official JSON/OAuth contract: https://developer-developpeur.canadapost-postescanada.ca/devportal-portaildesdeveloppeurs/product/shipping/api/shipping-api-1.0.0 (OpenAPI document 4685, inspected 2026-10-20).

Apply `supabase/migrations/20261020031044_canada_post_order_labels.sql` before deploying. The purchase ledger has RLS enabled, no browser grants, and service-only access. Existing server-only Supabase credentials are required. All application access additionally requires shipping permission and MFA.

## Production settings

Set these in Vercel Production and redeploy. Never put secrets in chat or `NEXT_PUBLIC_` variables.

- Existing `CANADA_POST_CLIENT_ID`, `CANADA_POST_CLIENT_SECRET`, `CANADA_POST_MODE=production`.
- `CANADA_POST_CUSTOMER_NUMBER`: the business account's customer number (preserve leading zeroes).
- `CANADA_POST_PAYMENT_METHOD=CreditCard` to use the default card already registered with Canada Post. Use `Account` only with an eligible contract and `CANADA_POST_CONTRACT_ID`.
- `CANADA_POST_SENDER_JSON`: the actual sender, formatted as below. No card details go into this value.
- `CANADA_POST_LABELS_ENABLED=true`: set only after Shipping API access, payment and sender details are verified and sandbox acceptance is complete. Until then purchasing fails closed.

Example shape only; replace every sample value with the real warehouse details:

```json
{"company":"SHIKIMOMO","contactPhone":"613-555-0100","addressDetails":{"addressLine1":"123 Example St","city":"Ottawa","provState":"ON","countryCode":"CA","postalZipCode":"K1A0B1"}}
```

Street lines and company/recipient names support 44 characters; city 40. Use two-letter province codes. The production endpoint is explicitly fixed; test credentials must never replace production credentials for buyer quotes.

## Staff flow

Orders → Canada Post label / tracking → enter the final packed order's weight and dimensions → select service and mailing date → get estimate → verify sender/destination and confirm the postage charge → open PDF and print at 100%.

This initial release supports **one consolidated domestic parcel per order**, packed and measured by staff. Multi-parcel, tube, unpackaged and international orders require manual shipping. Buyer checkout rates continue using their existing per-item parcel policy; consolidating the order can produce a different postage cost. An estimate is not a carrier-enforced price cap. Canada Post can adjust charges.

The immediate-transmit workflow charges the configured account/card during Create Shipment; it does not need a later manifest. It is intended for non-contract or eligible low-volume workflows; contract customers requiring warehouse manifests must not enable this workflow. Purchases do not mark orders shipped. At handover, copy the label's tracking into the existing “Mark shipped” form.

## Failure recovery

Each order has one ledger row and a unique carrier `customerRequestId`. An atomic database transition consumes a quote before the carrier call. There is no automatic retry, including on authentication errors or timeouts. A second click cannot submit the same purchase. Quotes last 10 minutes; changed addresses/settings require a new quote.

If the state is `submitting` or `review_required`, check Canada Post using the displayed request reference. The carrier supports retrieving shipments by that reference. Recover the existing shipment and its PDF; do not delete the ledger and repurchase. Recovery is currently an operator procedure, not an automated retry feature. A process crash after carrier success also requires this check.

PDFs are fetched through an authenticated admin route with a strict carrier artifact URL allowlist, redirect rejection, MIME/PDF validation and a 5 MB streamed limit. Artifact links, shipment metadata and the original request remain private in the ledger; no public label URLs are generated.

## Validation and rollout

Run `npm test` with Node 22. Run the dedicated label tests with `node --test tests/canada-post-label.test.ts tests/order-label-db.test.ts`.

Before enabling production, use an isolated sandbox deployment/database with the official test endpoint and test Shipping subscription to exercise create, receipt/tracking, PDF printing and timeout recovery. The shipped application intentionally does not route production purchases to a test endpoint. Mock tests do not establish live account access. No real postage should be bought as a smoke test without explicit cost authorization.
