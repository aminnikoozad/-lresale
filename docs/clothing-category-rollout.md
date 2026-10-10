# Women / Men / Kids rollout

The catalog taxonomy, customer collection form, item intake RPC and physical
inspection checks already support all three clothing departments. The remaining
launch gate is the saved `public.pilot_settings.categories` value. Shipping the
frontend alone does not change that saved setting.

## Apply after production authorization

1. Record the current singleton settings row and column default before applying:

   ```sql
   select id, enabled, categories, item_cap, pickup_days, duration_weeks,
          started_at, updated_at
   from public.pilot_settings where id = true;

   select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'pilot_settings'
     and column_name = 'categories';
   ```

2. Apply `20261010000121_expand_clothing_pilot.sql` through the project's normal
   migration process. It updates only the original `['women']` selection to
   `['women','men','kids']` and changes the default for newly created settings.
   A customized selection is deliberately preserved. If a different selection
   exists, review it before changing anything; do not disable the pilot to open
   the new categories.
3. Read the row again. Confirm Women, Men and Kids are enabled, the item cap,
   pickup days, enabled flag and duration are unchanged, and the migration is
   recorded as applied.
4. Verify the catalog category links, collection category selector, and staff
   category/subcategory selectors. An empty department is valid when there is
   no inspected, seller-approved published stock. Never create fake live stock
   to make the department appear populated.

The $8 individual item minimum and $60 collection minimum remain governed by the
existing selling rules. This migration does not change fees, commissions, seller
approval, MFA, photo requirements or recorded physical-inspection gates.

## Rollback

Only if the original snapshot was the legacy women-only setting, restore the
categories with a compare-and-set check so later admin edits are not overwritten:

```sql
update public.pilot_settings
set categories = array['women']::text[], updated_at = now()
where id = true and categories = array['women','men','kids']::text[];
```

Restore the exact column default captured in step 1 in a new corrective migration.
Do not blindly undo unrelated pilot settings. Rolling back category availability
can hide already-listed Men's/Kids' items and prevent new collection requests;
review pending collections and live inventory before doing it. Historical item
and collection rows remain intact.

## Local verification

`node --test tests/clothing-pilot.test.ts tests/item-inspection-publication-db.test.ts`

The tests exercise default and customized settings, the scoped migration and
repeat application, collection/listing triggers for all three departments,
non-clothing rejection, and MFA/recorded inspection for every clothing category.
