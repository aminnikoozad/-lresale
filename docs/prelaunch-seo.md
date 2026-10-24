# Prelaunch SEO checkpoint

## Verified baseline (2026-10-24)

- Google URL Inspection: `/` was indexed; `/shop` was discovered but not yet indexed. The root now permanently redirects to `/shop` in Next configuration.
- Live `/shop` returned HTTP 200 and `X-Robots-Tag: all`, with a canonical pointing to `/shop`. No catalogue items were displayed. This does not prove why Google has not indexed it, or verify all bot firewall rules.
- English/French currently share URLs and select language with a cookie; no `hreflang` links were present. Locale-specific URLs remain a separate prelaunch task.

## This change

- Public item detail reads are shared between metadata and the page within one request.
- Product-specific title, description, canonical, social images, and safely serialized Product/Offer JSON-LD.
- CAD prices from the listing; reserved and sold items never claim InStock. No fabricated reviews, ratings, identifiers, shipping or return promises.
- Sitemap includes eligible items from the existing anonymous catalogue RPC, respecting pilot categories and cap. A catalogue failure produces an error instead of silently returning a successful empty product sitemap. No admin/draft reads or schema changes.
- Account, auth, cart, checkout and staging utility routes receive noindex headers. This is indexing hygiene, not access control.
- Product metadata fails on transient database errors rather than emitting noindex for a real item.

## Validation and limits

- Dedicated product SEO and preview-isolation tests pass. Lint has no errors; one existing img warning remains. Production build and TypeScript pass. Production dependency audit reports zero vulnerabilities.
- Full regression suite now passes on the supported Node 22 runtime: 226 tests, zero failures. Restored common profile/support navigation and updated stale support/storefront expectations and JSX test stubs without removing ownership or privacy assertions. The initial Node 24-only bounded-stream issue does not reproduce on Node 22.
- Production HTTP fixture test passes against the built Next server with a fake, loopback-only Supabase endpoint. Covers available/reserved/sold Product offers, canonical query removal, public sitemap/pilot filtering, missing and malformed item exclusion, account/auth noindex, shop indexing headers and database outage behavior. The workflow now runs this check after build.
- Next may send HTTP 200 for streamed not-found responses; the test requires the noindex directive and absence of an available-product offer. Transient product failures render the unavailable state with no Product offer, and the sitemap returns an error. This is HTTP fixture coverage, not a visual browser check or Google's Rich Results Test. Real published-product inspection still awaits inventory.
- Existing public catalogue RPC returns up to 1,000 available items and omits reservations. Before that scale, add a paginated public sitemap feed/index. Sold detail pages remain available with SoldOut markup; they are not in this current catalogue feed.

## Remaining prelaunch work, in order

1. Verify the deployed change, including one real published item when stock is ready.
2. Add stable English/French URLs with reciprocal language links, correct canonicals, locale-specific sitemaps and consistent internal navigation.
3. Validate priority search terms for Montreal in both languages; build useful category pages only where real inventory supports them. Current category filters use fragments, not standalone search landing pages.
4. Review mobile performance, real product photos, actual shipping/return policy markup and verified Googlebot access through platform firewall rules.
5. Reinspect `/shop`, seller guide and a published product in Search Console after deployment. Submission and inspection do not guarantee indexing or ranking.
