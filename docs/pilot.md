# Reversible Montréal pilot

Admin → Pilot Settings (`/admin/pilot`), selling-rules permission plus MFA required.

Defaults: Women only, 30 total inventory records, Saturdays in America/Toronto, eight-week target. Start date is unset until the owner is ready. Six to eight weeks can be selected. Booking slots are not invented; staff must create real Saturday windows. Existing bookings and items remain stored. The intake cap counts every inventory record, including sold records, so sales do not silently open extra intake capacity.

To restore a category, check it and save. To restore all categories and pickup days, disable Pilot mode. This does **not** enable financial services, erase data, change locked commissions, or revert the no-show policy. Historical items remain accessible to their owner and authorized staff. New intake and reservations of paused categories are blocked in PostgreSQL, not only hidden in navigation.

Log actual minutes and costs for every item in Pilot Settings. Include collection, inspection, photos, listing, support, packing and fulfilment. Record labour cost as well as minutes to include it in contribution. The displayed contribution is provisional, not verified net profit. Set explicit acceptable sell-through, labour and net-margin thresholds before starting; no automatic go/no-go or policy changes occur. The calendar target does not automatically cancel customer orders or delete records.

Guest product questions use an isolated private table; anonymous users can only call the bounded submit RPC (3/hour/email, 50/hour overall). A honeypot is included. This is basic spam protection, not CAPTCHA. Authorized MFA staff can read and resolve questions in Pilot Settings; responses are manual through an approved channel. No outbound email or new notification integration is activated. No guest access to account/support history is granted.

No-show: first confirmed miss no charge; from the second, pickup suspended pending human review. Each request counts once. No missed-fee wallet entries or debt increases permitted. Deposit payments remain unavailable. Conflicting old knowledge is archived, not deleted; the owner-approved replacement is seeded. Supabase support-ai must also be deployed from the matching commit.

## Remaining launch prerequisites
- Independently confirm automatic database backup coverage, image/object backup and a tested restore. Project health does not prove backups. Current MCP project metadata does not expose backup coverage.
- Configure actual payment/tax and carrier credentials in appropriate test environments; nothing in this change enables real payment or payouts.
- Populate real approved inventory and real pickup slots.
- Formal privacy contact, retention schedule and complete commercial return/payment terms require owner confirmation. New policy pages describe current operations and do not assert legal compliance.
- Test authenticated owner and customer flows on mobile and restore/toggle categories in Preview before expanding.
