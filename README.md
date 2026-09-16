# REWEAR

REWEAR is a managed second-hand resale marketplace. Customers can shop published inventory or use their account to arrange seller collection, follow managed resale items, review pricing and commission, and contact AI + human support.

## Current product scope

- Managed resale, not peer-to-peer self-listing.
- Customer account with items, pickup / Bag requests, commission guide, wallet records and support history.
- Current commission is locked from the initial approved item price.
- Montréal-area seller pickup uses configured service areas and time slots; current business rules support free priority pickup at the configured threshold and per-item paid pickup below it.
- Buyer delivery policy is separate from seller pickup and is configured independently.
- Public catalog only shows staff-published items.

## Managed resale quality workflow

Published inventory now has a structured trust workflow:

1. Rewear receives and reviews the item.
2. Staff records a standardized condition grade and customer-facing inspection notes/checks.
3. Seller pricing approval and the existing locked commission rules remain unchanged.
4. New listings cannot be published until the Rewear inspection is recorded and at least one photo exists.
5. Product detail pages can show the recorded condition and inspection report.
6. The customer account shows a resale progress timeline and can record a Return-to-me or Donate end-of-cycle preference for eligible items.
7. The admin quality workspace can show an internal historical sold-price median when enough comparable Rewear sales exist. This is a pricing signal only, not an automated or guaranteed sale price.
8. Listed items nearing the configured selling-period end can be labeled Last Chance. The label does not change the locked commission percentage or automatically apply a markdown.

### Deliberately not presented as live

- A Rewear inspection is **not** a brand-authentication guarantee unless a separate authenticity check is explicitly implemented and recorded.
- Saving Return-to-me / Donate is a preference; it does not itself create a return shipment or donation transaction.
- Store-credit bonus UI appears only when a non-zero bonus is configured in business rules.
- Buyer checkout/payment, payout execution, refund automation, Canada-wide seller mail-in labels and one-click resale from purchase history must not be presented as live until their underlying integrations exist.

## Support AI

The support system uses approved Rewear knowledge, deterministic live business-rule calculations, authenticated own-account reads, and human handoff. A generative provider is optional and must remain grounded in approved knowledge. The assistant must not invent unavailable features, financial actions, exceptions, authentication claims or another customer's private information.

## Security and CI

GitHub Actions run dependency installation from the lockfile, production dependency audit, security regression tests, lint, TypeScript/build, and CodeQL. Admin and customer-sensitive database RPCs enforce their own authorization checks in addition to application routing.
