# Listing photo preparation and ten-photo limit

User-requested update to the direct-listing upload, without changing managed intake or the storefront.

- Local browser preparation accepts supported image originals up to 25 MB, decodes them, keeps aspect ratio, and encodes JPEG at up to 1800 px on the longest side, without upscaling. It tries quality 88/78/68 until output is at most 3 MB. This is resizing/compression, with no AI retouching. Transparent backgrounds are flattened to white.
- JPEG, PNG, WebP, AVIF and browser-decodable HEIC/HEIF are supported. HEIC decoding depends on the browser; unsupported or corrupt files receive an honest error. Sources over 50 megapixels, undersized images and files over 25 MB are rejected for device resource protection.
- Picker shows preparation progress in EN/FR, clears the previous file while processing, and ignores results after unmount. Upload uses the prepared JPEG. Original files are not uploaded.
- The server still enforces actual byte count, actual file decode, 24 MP input, EXIF/GPS removal, private storage, owner/version checks and the existing hourly budget. Its input limits are not raised.
- New active direct-listing photos are capped at ten in both authenticated preflight and service-only registration; the gallery shows the count and disables adding at the limit. Seller evidence has a ten-photo constraint; managed evidence remains 3–8. Historical evidence is preserved using NOT VALID for pre-existing rows, while new/updated evidence must satisfy the constraint. No financial data changes.

## Validation

Nine targeted automated tests pass: browser-helper control flow with mocked image/canvas APIs, actual Sharp decoding/metadata removal, database owner/version/anonymous checks, rate budget, ten-photo preflight and service registration, plus final listing submission. Neon staging migration and hosted function definitions verified. Production build, TypeScript and targeted ESLint pass.

Browser-helper tests are not a real Safari or signed-in end-to-end upload. An attempted local Chromium installation failed because its download was truncated; no browser success is claimed. Real iPhone/Safari testing remains required. Existing payment/shipping/commercial launch blockers in the security report remain unchanged.

## Release and rollback

Apply the additive/replacement migration before the application release. No existing photo, audit, consent or financial history is deleted. To undo this upload-only change, revert the application commit and restore the previous function definitions and seller evidence limit from prior migrations; preserve all photos and receipts. Do not roll back the ledger or enable payments.
