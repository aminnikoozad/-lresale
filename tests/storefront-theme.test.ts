import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/market-refresh.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

function luminance(hex: string) {
  const components = hex.match(/[a-f\d]{2}/gi)!.map((part) => parseInt(part, 16) / 255);
  const linear = components.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("storefront identity uses neutral tokens instead of the rejected palette", () => {
  assert.match(css, /--brand:#242424/);
  assert.match(css, /--page:#ffffff/);
  assert.match(css, /--brand-soft:#f1f1f1/);
  assert.doesNotMatch(css, /#(?:763f51|582d3b|f2e8ec|faf8f4|e7ede4|f0e5e8|0400d2|e8ff45)\b/i);
  assert.match(css, /\.filter-sheet\{[^}]*--brand:#242424/);
  assert.match(css, /\.seller-guide-shell \.guide-fees\{background:#f5f5f5!important/);
});

test("primary and secondary neutral text meet normal-text contrast", () => {
  for (const [foreground, background] of [["242424", "ffffff"], ["ffffff", "242424"], ["616161", "f5f5f5"], ["555555", "f5f5f5"]]) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
  }
});

test("simple hero removes decorative lettering and card numbering without removing search/navigation", () => {
  assert.doesNotMatch(page, /market-image-caption|market-discover-number|<em>/);
  assert.match(page, /Secondhand,<br \/>made simple\./);
  assert.match(page, /name="q"/);
  assert.match(page, /aria-label="Shop departments"/);
});
