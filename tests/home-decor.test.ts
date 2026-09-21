import { test } from "node:test";
import assert from "node:assert/strict";
import {
  homeFormData,
  galleryOrder,
  homeCollectionMatches,
  HOME_SUBCATEGORIES,
} from "../lib/home-decor.ts";
test("Home form separates staff-only evidence and rejects invalid numeric input", () => {
  const form = new FormData();
  form.set("material", "Ceramic");
  form.set("inspection_notes", "Staff only");
  form.set("seller_reported_age", "200 years");
  form.set("era", "Unknown");
  form.set("height_cm", "12");
  const data = homeFormData(form);
  assert.equal(data.public_data.material, "Ceramic");
  assert.equal(data.public_data.inspection_notes, undefined);
  assert.equal(data.public_data.seller_reported_age, undefined);
  assert.equal(data.staff_data.seller_reported_age, "200 years");
  assert.equal(data.public_data.era, "Unknown");
  for (const value of ["NaN", "Infinity", "-1", "0", "100001"]) {
    form.set("height_cm", value);
    assert.throws(() => homeFormData(form));
  }
  assert.deepEqual([...HOME_SUBCATEGORIES], [
    "Wall Art",
    "Mirrors",
    "Vases",
    "Candle Holders",
    "Decorative Objects",
    "Trays & Decorative Bowls",
    "Small Lamps & Lighting",
    "Clocks",
    "Decorative Tableware",
    "Bookends",
    "Small Home Textiles",
    "Vintage",
    "Collectibles",
    "Other Home Decor",
  ]);
  assert.ok(!HOME_SUBCATEGORIES.some((s) => String(s) === "Antiques"));
});
test("Gallery preserves explicit roles and places disclosed defects last", () => {
  const photos = [
    { url: "1", role: "defect" },
    { url: "2", role: "detail" },
    { url: "3", role: "back" },
    { url: "4", role: "hero" },
  ];
  assert.deepEqual(
    galleryOrder(photos).map((p) => p.url),
    ["4", "3", "2", "1"],
  );
  assert.equal(photos[0].role, "defect");
});
test("Merchandising uses actual attributes, dates and strict price bounds", () => {
  const now = Date.parse("2026-09-21");
  assert.equal(homeCollectionMatches("Under $50", {}, 5000, null, now), false);
  assert.equal(homeCollectionMatches("Under $50", {}, 4999, null, now), true);
  assert.equal(
    homeCollectionMatches(
      "Vintage Finds",
      { era: "Pre-1950" },
      10000,
      null,
      now,
    ),
    false,
  );
  assert.equal(
    homeCollectionMatches(
      "Vintage Finds",
      { subcategory: "Vintage" },
      10000,
      null,
      now,
    ),
    true,
  );
  assert.equal(
    homeCollectionMatches(
      "Collectibles",
      { subcategory: "Collectibles" },
      10000,
      null,
      now,
    ),
    true,
  );
  assert.equal(
    homeCollectionMatches("Recently Added", {}, 10000, "2026-09-20", now),
    true,
  );
  assert.equal(
    homeCollectionMatches("Recently Added", {}, 10000, "2026-07-20", now),
    false,
  );
});
