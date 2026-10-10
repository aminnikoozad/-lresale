import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind } from "typescript";
import { emptyCatalogFilters, readCatalogLocation, type CatalogFilters } from "../lib/catalog-navigation.ts";
import type { FilterableCatalogProduct } from "../lib/catalog-filtering.ts";

// Resolve existing extensionless application imports for Node's isolated TS tests.
const source = readFileSync(new URL("../lib/catalog-filtering.ts", import.meta.url), "utf8")
  .replace('"./home-decor"', JSON.stringify(new URL("../lib/home-decor.ts", import.meta.url).href))
  .replace('"./catalog-navigation"', JSON.stringify(new URL("../lib/catalog-navigation.ts", import.meta.url).href));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext } }).outputText).toString("base64")}`;
const { filterCatalogProducts } = await import(moduleUrl) as {
  filterCatalogProducts: <T extends FilterableCatalogProduct>(products: readonly T[], filters: CatalogFilters, now: number) => T[];
};
const now = Date.parse("2026-10-10T12:00:00Z");
const fixture = (id: string, changes: Partial<FilterableCatalogProduct> = {}) => ({
  id, name: "Linen shirt", brand: "Test Brand", category: "women", subcategory: "Shirts & Blouses",
  size: "M", condition: "Like New", priceCents: 2500, color: "Blue", material: "Linen", pattern: "Solid",
  publishedAt: "2026-10-01T12:00:00Z", ...changes,
});
const departmentFixtures = [
  fixture("women-shirt"),
  fixture("men-shirt", { category: "men", subcategory: "Shirts", size: "L", priceCents: 3000 }),
  fixture("kids-shirt", { category: "kids", subcategory: "Tops & T-Shirts", size: "6", priceCents: 1200 }),
];
const ids = (products: { id: string }[]) => products.map((product) => product.id);

test("Women, Men and Kids isolate inventory, and All finds includes each department", () => {
  for (const [category, id] of [["women", "women-shirt"], ["men", "men-shirt"], ["kids", "kids-shirt"]]) {
    assert.deepEqual(ids(filterCatalogProducts(departmentFixtures, emptyCatalogFilters(category), now)), [id]);
  }
  assert.equal(filterCatalogProducts(departmentFixtures, emptyCatalogFilters(), now).length, 3);
  assert.deepEqual(filterCatalogProducts([], emptyCatalogFilters("kids"), now), []);
});

test("search, subcategory, size, brand, condition and inclusive prices combine with AND", () => {
  const products = [
    fixture("match"),
    fixture("wrong-search", { name: "Cotton shirt", material: "Cotton" }),
    fixture("wrong-subcategory", { subcategory: "Dresses" }),
    fixture("wrong-size", { size: "S" }),
    fixture("missing-size", { size: null }),
    fixture("wrong-brand", { brand: "Other Brand" }),
    fixture("wrong-condition", { condition: "Good" }),
    fixture("below-price", { priceCents: 2499 }),
    fixture("above-price", { priceCents: 2501 }),
    fixture("wrong-department", { category: "men" }),
  ];
  const filters = {
    ...emptyCatalogFilters("women", "  LINEN  "), subcategories: ["Shirts & Blouses"], sizes: ["M"],
    brands: ["Test Brand"], conditions: ["Like New"], minPrice: "25", maxPrice: "25",
  };
  assert.deepEqual(ids(filterCatalogProducts(products, filters, now)), ["match"]);
});

test("facet selections use OR within a facet and preserve color/material/pattern filters", () => {
  const products = [fixture("medium"), fixture("small", { size: "S" }), fixture("large", { size: "L" }), fixture("red", { color: "Red" })];
  const filters = { ...emptyCatalogFilters("women"), sizes: ["S", "M"], colors: ["Blue"], materials: ["Linen"], patterns: ["Solid"] };
  assert.deepEqual(ids(filterCatalogProducts(products, filters, now)), ["medium", "small"]);
  assert.deepEqual(filterCatalogProducts(products, { ...filters, patterns: ["Striped"] }, now), []);
});

test("all sort modes are deterministic and leave the input order untouched", () => {
  const products = [
    fixture("b", { brand: "B", priceCents: 3000, publishedAt: "2026-10-02" }),
    fixture("az", { brand: "A", name: "Z shirt", priceCents: 2000, publishedAt: "2026-10-03" }),
    fixture("aa", { brand: "A", name: "A shirt", priceCents: 1000, publishedAt: "2026-10-01" }),
  ];
  const expected = { newest: ["az", "b", "aa"], price_low: ["aa", "az", "b"], price_high: ["b", "az", "aa"], brand: ["aa", "az", "b"] };
  for (const sort of ["newest", "price_low", "price_high", "brand"] as const) {
    assert.deepEqual(ids(filterCatalogProducts(products, { ...emptyCatalogFilters(), sort }, now)), expected[sort]);
  }
  assert.deepEqual(ids(products), ["b", "az", "aa"]);
});

test("department navigation clears incompatible facets while preserving search", () => {
  const labels = ["all", "women", "men", "kids"].map((value) => ({ value, label: value }));
  const previous = "?catalog=women&q=linen&subcategories=Shirts+%26+Blouses&sizes=M&brands=Test+Brand&minPrice=20";
  const next = readCatalogLocation(previous, "#kids", labels);
  assert.deepEqual(next, emptyCatalogFilters("kids", "linen"));
  assert.deepEqual(ids(filterCatalogProducts(departmentFixtures, next, now)), ["kids-shirt"]);
  assert.equal(filterCatalogProducts(departmentFixtures, { ...emptyCatalogFilters("kids"), sizes: ["M"] }, now).length, 0);
});

test("Home collection, era and boolean predicates retain their existing semantics", () => {
  const home = { subcategory: "Vintage", era: "1980s", handmade: true, designer: "Test Maker", keywords: "ceramic" };
  const products = [
    fixture("home-match", { category: "home_decor", home, priceDrop: true }),
    fixture("not-handmade", { category: "home_decor", home: { ...home, handmade: false }, priceDrop: true }),
    fixture("not-price-drop", { category: "home_decor", home }),
    fixture("old", { category: "home_decor", home, priceDrop: true, publishedAt: "2026-01-01" }),
    fixture("wrong-era", { category: "home_decor", home: { ...home, era: "1970s" }, priceDrop: true }),
    fixture("wrong-collection", { category: "home_decor", home: { ...home, subcategory: "Vases" }, priceDrop: true }),
  ];
  const filters = { ...emptyCatalogFilters("home_decor", "ceramic"), collection: "Vintage Finds", eras: ["1980s"], homeFlags: ["handmade", "price_drop", "new_arrivals"] };
  assert.deepEqual(ids(filterCatalogProducts(products, filters, now)), ["home-match"]);
  assert.deepEqual(filterCatalogProducts(products, { ...filters, query: "unknown designer" }, now), []);
});
