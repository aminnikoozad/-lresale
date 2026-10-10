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

import {
  catalogLocation,
  catalogHistoryMode,
  emptyCatalogFilters,
  priceCents,
  readCatalogLocation,
} from "../lib/catalog-navigation.ts";

test("search links initialize the catalog search without requiring a category", () => {
  assert.equal(readCatalogLocation("?q=linen", "#shop", labels).query, "linen");
  assert.equal(readCatalogLocation("?q=linen", "", labels).category, "all");
});

test("facets, search, prices and sort survive a shareable URL round trip", () => {
  const state = {
    ...emptyCatalogFilters("women", "linen shirt"),
    subcategories: ["Shirts & Blouses", "Tops"],
    brands: ["A & B"], sizes: ["M"], conditions: ["Like New"],
    minPrice: "12.50", maxPrice: "85", sort: "price_low" as const,
  };
  const url = new URL(catalogLocation("/", "?campaign=spring&q=old", state), "https://rewear.example");
  assert.equal(url.searchParams.get("campaign"), "spring");
  assert.deepEqual(readCatalogLocation(url.search, url.hash, labels), state);
});

test("category links drop incompatible facets and keep search", () => {
  const state = readCatalogLocation("?catalog=home_decor&q=blue&subcategories=Vases&eras=1980s&minPrice=30", "#women", labels);
  assert.deepEqual(state, emptyCatalogFilters("women", "blue"));
});

test("clearing search and filters removes every catalog facet and restores default sorting", () => {
  const url = new URL(catalogLocation("/", "?catalog=women&q=linen&brands=Arket&sizes=M&maxPrice=60&sort=price_low", emptyCatalogFilters("women")), "https://rewear.example");
  assert.equal(url.search, "?catalog=women");
  assert.deepEqual(readCatalogLocation(url.search, url.hash, labels), emptyCatalogFilters("women"));
});

test("Back and Forward can restore independently serialized category/filter snapshots", () => {
  const states = [emptyCatalogFilters(), { ...emptyCatalogFilters("women"), sizes: ["S"], brands: ["Arket"] }, { ...emptyCatalogFilters("home_decor"), eras: ["1980s"], homeFlags: ["handmade"], collection: "Vintage Finds" }];
  const urls = states.map((state) => new URL(catalogLocation("/", "", state), "https://rewear.example"));
  for (const index of [0, 1, 2, 1, 0, 1, 2]) assert.deepEqual(readCatalogLocation(urls[index].search, urls[index].hash, labels), states[index]);
});

test("malformed price and sort parameters cannot poison catalog results", () => {
  const state = readCatalogLocation("?minPrice=NaN&maxPrice=Infinity&sort=invalid&brands=A&brands=A", "#women", labels);
  assert.equal(state.minPrice, "");
  assert.equal(state.maxPrice, "");
  assert.equal(state.sort, "newest");
  assert.deepEqual(state.brands, ["A"]);
  assert.equal(priceCents(""), null);
  assert.equal(priceCents("-1"), null);
  assert.equal(priceCents("12.34"), 1234);
  assert.equal(priceCents("0"), 0);
});

test("disabled category links never activate disabled inventory", () => {
  assert.equal(readCatalogLocation("?catalog=electronics&brands=Sony", "#electronics", labels).category, "all");
});

test("unrelated page anchors preserve a valid catalog selection", () => {
  const state = readCatalogLocation("?catalog=women&sizes=M&q=linen", "#how-it-works", labels);
  assert.equal(state.category, "women");
  assert.deepEqual(state.sizes, ["M"]);
  assert.equal(state.query, "linen");
});


test("a saved category in the query string works without a hash", () => {
  const categoryLabels = [...labels, { value: "men", label: "Men" }];
  const state = readCatalogLocation("?catalog=men&q=linen&sizes=M", "", categoryLabels);
  assert.equal(state.category, "men");
  assert.equal(state.query, "linen");
  assert.deepEqual(state.sizes, ["M"]);
  assert.equal(readCatalogLocation("?catalog=men", "#shop", categoryLabels).category, "all");
});

test("typing search and prices replaces the current history entry", () => {
  const previous = { ...emptyCatalogFilters("women"), brands: ["Arket"] };
  assert.equal(catalogHistoryMode(previous, { ...previous, query: "linen" }), "replace");
  assert.equal(catalogHistoryMode(previous, { ...previous, minPrice: "20", maxPrice: "80" }), "replace");
  assert.equal(catalogHistoryMode(previous, { ...previous }), "replace");
});

test("discrete category, facet, collection and sort changes retain Back steps", () => {
  const previous = emptyCatalogFilters("women");
  for (const next of [
    { ...previous, category: "men" },
    { ...previous, brands: ["Arket"] },
    { ...previous, sizes: ["S"] },
    { ...previous, collection: "Vintage Finds" },
    { ...previous, sort: "price_low" as const },
  ]) assert.equal(catalogHistoryMode(previous, next), "push");
});

test("header GET search initializes q at the shop anchor", () => {
  const state = readCatalogLocation("?q=linen+shirt", "#shop", labels);
  assert.deepEqual(state, emptyCatalogFilters("all", "linen shirt"));
});
