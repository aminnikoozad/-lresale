# Shikimomo interface and Smart Shopping controls

The site-wide English/French selection is stored in a SameSite cookie and supplied to the server-rendered language provider. Public pages, customer tools and administrative screens share the same UI-copy catalog. React rendering localizes displayed text and accessible labels without changing submitted identifiers, form values, action URLs or customer-authored product names/messages. Existing authoritative French/English legal sections are selected by language. Dynamic copy uses bounded source templates; inventory and customer content are not sent to any translation service at runtime.

Smart Shopping uses a red heart mark, including the wordmark ending and the icon-only floating shortcut. Its entry card is labelled Coming soon / Bientôt disponible while activation is pending.

`/admin/smart-shop` provides the authorized administrator with enabled/paused, chat, voice, preference-memory and bilingual service-notice controls, plus owner-host status and a recent change log. Server actions require an authorized selling-rules administrator and AAL2. RLS independently enforces both permissions. Audit rows are not writable by customers or administrators, and private host credentials are never displayed.

The same control switches are checked by the website text, audio and customer-action transports and by the deployed inference Edge gateway. Missing settings disable the assistant. Settings do not grant the assistant any administrative tools. Owner-hosted hardware and browser voice activation still require separate end-to-end validation. Payments remain unconfigured; this release does not charge customers.

Compatibility identifiers for existing database fields, deployed Edge function routes and legacy browser-cart migration remain where needed. Customer-facing and model instruction branding uses Shikimomo.

Validation: automated English/French render tests cover nested copy, accessibility labels, form-value preservation, user-content preservation, selected-language legal text and parameterized amounts. Database tests cover anon/customer denial, MFA requirements, authorized updates and private immutable audit history. Production build, TypeScript and security suite are required. Browser automation is unavailable in the current managed environment, so mobile interaction and full authenticated click-through are not claimed as verified.
