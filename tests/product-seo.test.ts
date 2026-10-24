import test from "node:test";
import assert from "node:assert/strict";
import { isItemId, productSeo, serializeJsonLd, type SeoProduct } from "../lib/product-seo.ts";
import { isPrivateSearchRoute } from "../lib/indexing.ts";

const product: SeoProduct = {
  item_id: "00000000-0000-4000-8000-000000000001", name: "Blue cotton shirt", brand: "Example",
  size: "M", item_condition: "Good", description: "Light wear on the cuffs.",
  photo_urls: ["https://example.com/shirt.webp"], price_cents: 1250,
};

test("product price, canonical and social preview come from the public listing", () => {
  const seo = productSeo(product, "https://shikimomo.com");
  assert.equal(seo.metadata.alternates.canonical, `https://shikimomo.com/item/${product.item_id}`);
  assert.equal(seo.metadata.title.absolute, "Blue cotton shirt | Shikimomo");
  assert.equal(seo.structuredData.offers?.price, "12.50");
  assert.equal(seo.structuredData.offers?.priceCurrency, "CAD");
  assert.equal(seo.structuredData.offers?.itemCondition, "https://schema.org/UsedCondition");
  assert.deepEqual(seo.metadata.openGraph.images, product.photo_urls);
  assert.equal(productSeo(product, "https://shikimomo.com", true).metadata.openGraph.locale, "fr_CA");
});

test("reserved and sold pieces never advertise an available offer", () => {
  for (const [availability, expected] of [["available", "InStock"], ["reserved", "OutOfStock"], ["sold", "SoldOut"]] as const) {
    assert.equal(productSeo({ ...product, availability }, "https://shikimomo.com").structuredData.offers?.availability, `https://schema.org/${expected}`);
  }
});

test("invalid prices, placeholder brands and invented reviews are not published in markup", () => {
  for (const price_cents of [0, -1, NaN, 12.5]) {
    const seo = productSeo({ ...product, price_cents, brand: "Unbranded" }, "https://shikimomo.com");
    assert.equal(seo.structuredData.offers, undefined);
    assert.equal(seo.structuredData.brand, undefined);
    assert.equal("aggregateRating" in seo.structuredData, false);
  }
});

test("seller text cannot close the JSON-LD script", () => {
  const hostile = { ...product, name: '</script><script>alert("x")</script>' };
  const data = productSeo(hostile, "https://shikimomo.com").structuredData;
  const serialized = serializeJsonLd(data);
  assert.equal(serialized.includes("<"), false);
  assert.deepEqual(JSON.parse(serialized), data);
});

test("item identifiers reject malformed paths", () => {
  assert.equal(isItemId(product.item_id), true);
  for (const id of ["-".repeat(36), "../../account", "not-an-id", `${product.item_id}?sizes=M`]) assert.equal(isItemId(id), false);
});

test("private search exclusions respect path segment boundaries", () => {
  for (const path of ["/account", "/account/purchases", "/admin", "/admin/items", "/checkout", "/cart", "/auth/complete", "/login", "/signup", "/staging/community"]) assert.equal(isPrivateSearchRoute(path), true, path);
  for (const path of ["/shop", "/seller-terms", "/sell", "/shipping-policy", `/item/${product.item_id}`, "/accounting"]) assert.equal(isPrivateSearchRoute(path), false, path);
});
