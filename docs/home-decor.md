# Home & Decor managed resale

This extends the existing accounts, item intake, pricing approval, catalog, bag, and fulfilment foundation. It does not introduce seller self-publishing, payment processing, payout activation or shipping quotes.

## Operations

1. Receive an item in **Admin → Item Management**, choosing Home & Decor and its seller. Set its proposed price using the existing commission and approval workflow.
2. Open **Home & Decor inspection**. Review the seller's preliminary intake, enter physical inspection findings and measurements, and categorize the item.
3. Add up to eight photos using the existing secure upload endpoint. Assign exactly one hero and appropriate angle, detail, mark and defect roles.
4. Complete packaging and delivery notes. The system does not calculate final shipping rates. Shipping restrictions and pickup-only handling must be confirmed operationally.
5. Resolve missing requirements. Sensitive flags require documented Owner/Admin review. Specialist review requirements persist until documented sign-off. Authentication claims require evidence and Owner/Admin approval.
6. Obtain seller price approval, select Ready to List, then publish through existing Item Management. Saving changes to a live Home listing takes it off sale until republished.

Home acceptance settings are editable by Owner/Admin with the existing MFA requirement. A blank minimum inherits the approved global individual minimum. Existing pickup fees, pickup minimums and locked commissions are unchanged. Bundle eligibility and oversized restrictions are enforced in the database. Antiques is reserved but disabled in the category table; no automatic antique classification exists.

## Data and access

- `collection_requests.home_intake`: seller's preliminary information, under existing request RLS.
- `home_item_details`: staff-only table with explicit public attributes, separate private evidence, checklist, photo roles and review flags.
- `home_acceptance_rules`, `home_subcategories`: publicly readable configuration; no direct customer writes.
- `home_catalog_details`: projects only approved public attribute keys and validated photo roles for listed items. No seller IDs, intake, private inspection notes or evidence.
- Admin RPCs reuse `can_manage_items()` and its existing MFA requirement. Owner/Admin review authority is enforced server-side.
- Existing public catalog RPC signatures are unchanged. Existing commission and financial functions are preserved.

## Verification

`npm run test:security` includes existing auth regressions, Home form and gallery tests, and an isolated Postgres migration test using PGlite. The Postgres fixture uses the existing intake/review function bodies with minimal supporting tables; it is not a substitute for a full production clone. It verifies customer/guest denial, MFA enforcement, warehouse restrictions, public field projection, publication gates, configurable minimums and legacy fashion intake.

Run `npm run lint` and `npm run build` as well. Production anonymous API checks verify that public catalog reads succeed, private Home table reads fail, and anonymous admin mutations fail. No sample merchandise is inserted into production. Empty collections are intentionally hidden.
