# Customer and item administration

Entry: /secure-admin-login → /admin → Customers. MFA is mandatory on the new customer workspace. Existing Owner/Admin/operations/warehouse item permissions are reused; only Owner/Admin with MFA may record a sale.

1. Search /admin/customers by username, name or email. Open the customer.
2. Add their item; verify selected username/email before saving. Internal ownership uses the immutable user UUID, never a mutable username.
3. Attach the existing item_operations.item_code label to the physical garment. Processing/warehouse tooling remains intact.
4. Inspect, photograph, propose price, obtain seller approval, publish. Approval locks the commission and owner. Never approve on behalf of a seller.
5. For an independently verified external sale, record the unique receipt/payment reference. The server checks the current listing price, approval, no active reservation and prior credits. It records a pending seller credit atomically once, using final item price × locked seller percentage. Taxes and shipping are excluded. No payment is taken and no payout is sent.
6. Pending credits require a future reconciliation/settlement workflow. Do not mark them available merely because an item was uploaded. Refunds/corrections are not implemented in this manual sale recorder.
7. Account updates explicitly choose Internal or Customer-visible. Only the latter appear at /account/profile. No automatic email/SMS is sent. Live replies continue through the existing support inbox.

New customers choose a unique username. Existing customers may change theirs at /account/profile. No long customer ID is shown in the customer dashboard. IDs and item labels remain intact internally.

## CAPTCHA activation (external configuration required)

- Create a production Cloudflare Turnstile site for lresale.vercel.app and any custom production hostname.
- Put the public site key in Vercel NEXT_PUBLIC_TURNSTILE_SITE_KEY and rebuild.
- In Supabase Authentication → Bot and Abuse Protection, enable CAPTCHA with provider Turnstile and its SECRET key. Never put the secret in NEXT_PUBLIC_ or Git.
- Configure both together and test signup, customer login, admin login and recovery. Supabase must verify tokens; frontend-only verification would leave the direct Auth endpoint unprotected.
- Without a configured site key, no CAPTCHA is displayed. Never claim it is enabled merely because component code exists.
- A persistent IP form-attempt limiter supplements existing Supabase Auth rate limits. Configure a stable private ADMIN_RATE_LIMIT_SALT (32+ characters) to preserve rate keys across deployments. Built-in build salt is fallback. Application rate limiting is not full DDoS prevention; use Vercel firewall/rate-limit controls as appropriate.

Security: new tables use RLS and revoke client mutations; all privileged RPCs check role/MFA. Customer projections contain only their visible messages. Internal staff notes never go to the customer bot or public catalog.
