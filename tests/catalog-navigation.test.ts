import { test } from "node:test";
import assert from "node:assert/strict";
import { hashCategory } from "../lib/catalog-navigation.ts";

const labels = [
  { value: "all", label: "All items" },
  { value: "women", label: "Women" },
  { value: "home_decor", label: "Home & Decor" },
] as const;

test("All finds and Explore shop links reset the selected category", () => {
  assert.equal(hashCategory("#shop", labels), "all");
  assert.equal(hashCategory("#all", labels), "all");
  assert.equal(hashCategory("", labels), "all");
});

test("category links resolve only enabled categories", () => {
  assert.equal(hashCategory("#women", labels), "women");
  assert.equal(hashCategory("#HOME_DECOR", labels), "home_decor");
  assert.equal(hashCategory("#electronics", labels), null);
  assert.equal(hashCategory("#sell", labels), null);
});
