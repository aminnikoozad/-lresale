# Buyer and seller workspaces

One authenticated customer account has both workspaces. Choosing a workspace is a navigation preference, not a database role, entitlement or authorization change.

## Routes

- `/account`: first-entry chooser. A valid remembered preference redirects to its workspace. `/account?choose=1` always shows the two cards again.
- `/account/buyer`: purchases, order status, reservation cancellation, returns, favorites and price alerts. Shopping bag remains `/cart`.
- `/account/buyer/delivery`: delivery details from the authenticated buyer's ten most recent orders. Customers enter or update an address at checkout; this page is not a separate editable address book.
- `/account/seller`: the existing seller dashboard, collection requests, inventory, commissions and bundles.
- `/account/seller/items`: item operations, inspection/rejection timeline, pricing mandate and unsold-item preferences.
- `/account/seller/earnings`: own pending sale earnings, completed wallet balance and recent ledger activity. Pending credits are not paid-out funds. Existing payout restrictions remain.
- `/account/profile`: shared username/profile and password recovery entry.
- `/account/messages`: shared support conversations and customer-visible team updates. Private staff notes stay excluded.

The old `/account/purchases` and `/account/operations` routes redirect to their corresponding new workspace and preserve query parameters. Checkout links and post-submit destinations now go directly to the correct workspace. Administrator changes invalidate the account layout or the relevant new destination.

## Remembering and switching

A permanent sticky Buyer/Seller switch uses authenticated server actions with fixed destinations. The preference is a secure-in-production, HttpOnly, same-site cookie scoped to `/account`, with its name bound to the authenticated user ID. Direct deep links take priority over the preference and remember the visited workspace. Another account in the same browser does not inherit that selection.

The public navigation never uses this preference to grant admin permissions, change a user role or modify inventory ownership. The existing page authentication and database RLS remain in effect. Shared profile and support navigation follow the active workspace.

## Database status

This UI split requires no new database table or role: both workspaces use the existing account and ownership policies. The previous team-pricing migration remains prepared but NOT applied remotely. The Supabase connector still denies migration-history access and lists no projects for the connected account. Restore authorized access to `lsdhobwrnmlkqnvkamlt`, inspect its migration history and apply the pending migration in order. Do not switch to another database or bypass the refusal with alternate credentials.

The existing Vercel server-credential/project mismatch also remains unresolved; it is separate from workspace selection.

## Validation

Workspace tests cover first entry, remembered selection, explicit re-selection, per-user preference isolation, invalid preference values, deep-link priority, role-specific navigation, legacy query forwarding, real route existence, shared-profile separation and explicit ownership filters on the new private reads. Existing account, order, admin-role and database tests remain required. A signed-in production walkthrough still requires an available test session; do not describe route/auth-wall smoke tests as proof of a completed checkout or seller operation.
