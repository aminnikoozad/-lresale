# French copy and customer support

`/support` is the public contact/help route, linked from the store navigation, the account menu, returns and every page footer. It is independent of Smart Shopping availability. Guests can read contact details/policies and reach password recovery. Signed-in customers use the existing private support conversation service and staff continue to reply in `/admin/support`.

Direct contacts are only displayed when configured. Publish the owner's real values using `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_BUSINESS_PHONE`, `NEXT_PUBLIC_BUSINESS_ADDRESS`, `NEXT_PUBLIC_SUPPORT_HOURS_EN` and `NEXT_PUBLIC_SUPPORT_HOURS_FR`. Do not use example addresses or imply a response-time guarantee. A direct contact is still needed to help customers who cannot access their account or recovery email. `NEXT_PUBLIC_PRIVACY_EMAIL` remains the separate privacy contact setting.

Conversation loading errors are visible, the latest 100 messages are shown chronologically, the first saved message loads immediately, and a failed human handoff can be retried without creating another first message. Contact email links open the visitor's email app; this change does not configure SMTP, SMS or external messaging providers.

French corrections cover the identified customer-facing terminology, launch-offer places, fixed fees, collection eligibility, seller earnings, account labels and complete fee sentences. Dynamic amounts, thresholds and offer counts stay supplied by the existing business rules. The root and main public-policy page titles/descriptions now follow the selected language. Existing authoritative bilingual legal sections are preserved.

Validation: project regression suite including French fee/consent parameter preservation and guest/signed-in support rendering; TypeScript, ESLint and production build. A real signed-in send, staff reply and realtime delivery still require browser authentication and the deployed support database services. Rendering tests do not verify those services or email delivery.
