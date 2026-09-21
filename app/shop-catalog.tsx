"use client";

import {
  HOME_COLLECTIONS,
  homeCollectionMatches,
  type HomeData,
} from "@/lib/home-decor";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AddToCartButton,
  FavoriteButton,
} from "@/components/storefront-actions";

export type CatalogCategory =
  | "women"
  | "men"
  | "kids"
  | "shoes"
  | "accessories"
  | "electronics"
  | "home_decor";
type TabValue = "all" | CatalogCategory;
type SortValue = "newest" | "price_low" | "price_high" | "brand";

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string;
  priceCents: number;
  category: CatalogCategory;
  condition: string | null;
  size: string | null;
  color: string | null;
  material: string | null;
  pattern: string | null;
  photoUrl: string;
  publishedAt: string | null;
  home?: HomeData;
  priceDrop?: boolean;
};

const labels: { value: TabValue; label: string }[] = [
  { value: "all", label: "All items" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "shoes", label: "Shoes" },
  { value: "accessories", label: "Accessories" },
  { value: "electronics", label: "Electronics" },
  { value: "home_decor", label: "Home & Decor" },
];

function hashCategory(hash: string): TabValue | null {
  const value = hash.replace(/^#/, "").toLowerCase();
  return labels.some((entry) => entry.value === value)
    ? (value as TabValue)
    : null;
}
function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
function unique(values: (string | null)[]) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function ShopCatalog({
  products,
  now,
}: {
  products: CatalogProduct[];
  now: number;
}) {
  const [activeCategory, setActiveCategory] = useState<TabValue>("all");
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [eras, setEras] = useState<string[]>([]);
  const [homeFlags, setHomeFlags] = useState<string[]>([]);
  const [collection, setCollection] = useState("");
  const [query, setQuery] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<SortValue>("newest");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    const syncHash = () => {
      const next = hashCategory(window.location.hash);
      if (next) {
        setActiveCategory(next);
        setBrands([]);
        setSizes([]);
        setConditions([]);
        setColors([]);
        setMaterials([]);
        setPatterns([]);
        setSubcategories([]);
        setEras([]);
        setHomeFlags([]);
        setCollection("");
        setMinPrice("");
        setMaxPrice("");
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!filterOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [filterOpen]);

  const categoryProducts = useMemo(
    () =>
      activeCategory === "all"
        ? products
        : products.filter((product) => product.category === activeCategory),
    [activeCategory, products],
  );
  const options = useMemo(
    () => ({
      brands: unique(categoryProducts.map((product) => product.brand)),
      sizes: unique(categoryProducts.map((product) => product.size)),
      conditions: unique(categoryProducts.map((product) => product.condition)),
      colors: unique(categoryProducts.map((product) => product.color)),
      materials: unique(categoryProducts.map((product) => product.material)),
      patterns: unique(categoryProducts.map((product) => product.pattern)),
    }),
    [categoryProducts],
  );

  const minCents =
    minPrice.trim() === ""
      ? null
      : Math.max(0, Math.round(Number(minPrice) * 100));
  const maxCents =
    maxPrice.trim() === ""
      ? null
      : Math.max(0, Math.round(Number(maxPrice) * 100));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = categoryProducts.filter((product) => {
      const haystack =
        `${product.name} ${product.brand} ${product.category} ${product.color || ""} ${product.material || ""} ${product.pattern || ""} ${product.home?.designer || ""} ${product.home?.era || ""} ${product.home?.subcategory || ""} ${product.home?.keywords || ""}`.toLowerCase();
      return (
        (!subcategories.length ||
          subcategories.includes(String(product.home?.subcategory))) &&
        (!eras.length || eras.includes(String(product.home?.era))) &&
        homeFlags.every((f) =>
          f === "price_drop"
            ? product.priceDrop
            : f === "new_arrivals"
              ? homeCollectionMatches(
                  "Recently Added",
                  product.home ?? {},
                  product.priceCents,
                  product.publishedAt,
                  now,
                )
              : product.home?.[f] === true,
        ) &&
        (!collection ||
          (product.home &&
            homeCollectionMatches(
              collection,
              product.home,
              product.priceCents,
              product.publishedAt,
              now,
            ))) &&
        (!q || haystack.includes(q)) &&
        (!brands.length || brands.includes(product.brand)) &&
        (!sizes.length || (product.size && sizes.includes(product.size))) &&
        (!conditions.length ||
          (product.condition && conditions.includes(product.condition))) &&
        (!colors.length || (product.color && colors.includes(product.color))) &&
        (!materials.length ||
          (product.material && materials.includes(product.material))) &&
        (!patterns.length ||
          (product.pattern && patterns.includes(product.pattern))) &&
        (minCents == null || product.priceCents >= minCents) &&
        (maxCents == null || product.priceCents <= maxCents)
      );
    });
    return [...next].sort((a, b) => {
      if (sort === "price_low") return a.priceCents - b.priceCents;
      if (sort === "price_high") return b.priceCents - a.priceCents;
      if (sort === "brand")
        return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
      return (
        new Date(b.publishedAt || 0).getTime() -
        new Date(a.publishedAt || 0).getTime()
      );
    });
  }, [
    categoryProducts,
    query,
    brands,
    sizes,
    conditions,
    colors,
    materials,
    patterns,
    minCents,
    maxCents,
    sort,
    subcategories,
    eras,
    homeFlags,
    collection,
    now,
  ]);

  const activeFilterCount =
    subcategories.length +
    eras.length +
    homeFlags.length +
    (collection ? 1 : 0) +
    brands.length +
    sizes.length +
    conditions.length +
    colors.length +
    materials.length +
    patterns.length +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0);
  const clearFilters = () => {
    setSubcategories([]);
    setEras([]);
    setHomeFlags([]);
    setCollection("");
    setBrands([]);
    setSizes([]);
    setConditions([]);
    setColors([]);
    setMaterials([]);
    setPatterns([]);
    setMinPrice("");
    setMaxPrice("");
  };
  const changeCategory = (value: string) => {
    const next = value as TabValue;
    setActiveCategory(next);
    clearFilters();
    setFilterOpen(false);
    const hash = next === "all" ? "shop" : next;
    window.history.replaceState(null, "", `#${hash}`);
  };

  const filterPanel = (
    <>
      <FilterPanel
        activeCategory={activeCategory}
        options={options}
        state={{ brands, sizes, conditions, colors, materials, patterns }}
        setters={{
          setBrands,
          setSizes,
          setConditions,
          setColors,
          setMaterials,
          setPatterns,
        }}
        minPrice={minPrice}
        maxPrice={maxPrice}
        setMinPrice={setMinPrice}
        setMaxPrice={setMaxPrice}
        clearFilters={clearFilters}
      />
      {activeCategory === "home_decor" ? (
        <details className="home-filters" open>
          <summary>Home &amp; Decor filters</summary>
          <FilterGroup
            title="Subcategory"
            values={unique(
              categoryProducts.map(
                (p) => String(p.home?.subcategory ?? "") || null,
              ),
            )}
            selected={subcategories}
            onToggle={(v) => toggle(setSubcategories, v)}
          />
          <FilterGroup
            title="Era"
            values={unique(
              categoryProducts.map((p) => String(p.home?.era ?? "") || null),
            )}
            selected={eras}
            onToggle={(v) => toggle(setEras, v)}
          />
          {[
            ["handmade", "Handmade"],
            ["signed_marked", "Signed / Marked"],
            ["fragile", "Fragile"],
            ["new_arrivals", "New arrivals (30 days)"],
            ["price_drop", "Price drops"],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={homeFlags.includes(value)}
                onChange={() => toggle(setHomeFlags, value)}
              />
              {label}
            </label>
          ))}
          <button type="button" onClick={clearFilters}>
            Clear all filters
          </button>
        </details>
      ) : null}
    </>
  );

  return (
    <section id="shop" className="shop-catalog section-wrap">
      <div className="catalog-hash-anchors" aria-hidden="true">
        {labels
          .filter((entry) => entry.value !== "all")
          .map((entry) => (
            <span id={entry.value} key={entry.value} />
          ))}
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow dark">Available now</p>
          <h2>Curated finds. Another life.</h2>
        </div>
        <p>
          Search inspected items and narrow by price, brand, size, condition,
          colour, material and pattern.
        </p>
      </div>
      <div className="catalog-searchbar">
        <label>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search brand, item, colour…"
          />
        </label>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortValue)}
          aria-label="Sort items"
        >
          <option value="newest">Newest</option>
          <option value="price_low">Price: low to high</option>
          <option value="price_high">Price: high to low</option>
          <option value="brand">Brand A–Z</option>
        </select>
      </div>

      {activeCategory === "home_decor" ? (
        <>
          <p className="home-catalog-note">
            Selected decorative, vintage and collectible pieces, physically
            inspected and listed by REWEAR. We handle the seller’s item,
            photography and fulfilment.
          </p>
          <div className="home-collections" aria-label="Home collections">
            {HOME_COLLECTIONS.filter((c) =>
              categoryProducts.some(
                (p) =>
                  p.home &&
                  homeCollectionMatches(
                    c,
                    p.home,
                    p.priceCents,
                    p.publishedAt,
                    now,
                  ),
              ),
            ).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={collection === c}
                onClick={() => setCollection(collection === c ? "" : c)}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <Tabs value={activeCategory} onValueChange={changeCategory}>
        <TabsList className="catalog-shortcuts" aria-label="Shop by category">
          {labels.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {labels.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <div className="catalog-body">
              <aside
                className="catalog-filter desktop-filter"
                aria-label="Product filters"
              >
                {filterPanel}
              </aside>
              <div className="catalog-results">
                <div className="catalog-toolbar">
                  <div className="catalog-result-count">
                    <strong>{filtered.length}</strong>{" "}
                    {filtered.length === 1 ? "item" : "items"}
                  </div>
                  <button
                    className="mobile-filter-toggle"
                    type="button"
                    onClick={() => setFilterOpen(true)}
                  >
                    <SlidersHorizontal /> Filters{" "}
                    {activeFilterCount > 0 ? (
                      <span>{activeFilterCount}</span>
                    ) : null}
                  </button>
                </div>
                <ProductGrid
                  homeCategory={activeCategory === "home_decor"}
                  products={filtered}
                  filtersActive={activeFilterCount > 0 || Boolean(query)}
                />
              </div>
            </div>
            {filterOpen ? (
              <>
                <button
                  className="filter-sheet-backdrop"
                  type="button"
                  aria-label="Close filters"
                  onClick={() => setFilterOpen(false)}
                />
                <aside
                  className="catalog-filter filter-sheet"
                  aria-label="Mobile product filters"
                >
                  <div className="filter-sheet-head">
                    <strong>Filters</strong>
                    <button
                      type="button"
                      aria-label="Close filters"
                      onClick={() => setFilterOpen(false)}
                    >
                      <X />
                    </button>
                  </div>
                  {filterPanel}
                  <div className="filter-sheet-footer">
                    <Button type="button" onClick={() => setFilterOpen(false)}>
                      Show {filtered.length}{" "}
                      {filtered.length === 1 ? "item" : "items"}
                    </Button>
                  </div>
                </aside>
              </>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function toggle(
  setter: React.Dispatch<React.SetStateAction<string[]>>,
  value: string,
) {
  setter((current) =>
    current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value],
  );
}

function FilterPanel({
  activeCategory,
  options,
  state,
  setters,
  minPrice,
  maxPrice,
  setMinPrice,
  setMaxPrice,
  clearFilters,
}: {
  activeCategory: TabValue;
  options: {
    brands: string[];
    sizes: string[];
    conditions: string[];
    colors: string[];
    materials: string[];
    patterns: string[];
  };
  state: {
    brands: string[];
    sizes: string[];
    conditions: string[];
    colors: string[];
    materials: string[];
    patterns: string[];
  };
  setters: {
    setBrands: React.Dispatch<React.SetStateAction<string[]>>;
    setSizes: React.Dispatch<React.SetStateAction<string[]>>;
    setConditions: React.Dispatch<React.SetStateAction<string[]>>;
    setColors: React.Dispatch<React.SetStateAction<string[]>>;
    setMaterials: React.Dispatch<React.SetStateAction<string[]>>;
    setPatterns: React.Dispatch<React.SetStateAction<string[]>>;
  };
  minPrice: string;
  maxPrice: string;
  setMinPrice: (value: string) => void;
  setMaxPrice: (value: string) => void;
  clearFilters: () => void;
}) {
  const any =
    Object.values(state).some((values) => values.length) ||
    minPrice ||
    maxPrice;
  return (
    <>
      <div className="filter-title">
        <span>
          <SlidersHorizontal /> Filters
        </span>
        {any ? (
          <button type="button" onClick={clearFilters}>
            <X /> Clear
          </button>
        ) : null}
      </div>
      <div className="filter-price">
        <legend>Price</legend>
        <div>
          <input
            inputMode="decimal"
            type="number"
            min="0"
            placeholder="Min $"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
          />
          <input
            inputMode="decimal"
            type="number"
            min="0"
            placeholder="Max $"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
          />
        </div>
      </div>
      <FilterGroup
        title={activeCategory === "home_decor" ? "Maker / Brand" : "Brand"}
        values={options.brands}
        selected={state.brands}
        onToggle={(value) => toggle(setters.setBrands, value)}
      />
      <FilterGroup
        title={activeCategory === "shoes" ? "Shoe size" : "Size"}
        values={options.sizes}
        selected={state.sizes}
        onToggle={(value) => toggle(setters.setSizes, value)}
      />
      <FilterGroup
        title="Condition"
        values={options.conditions}
        selected={state.conditions}
        onToggle={(value) => toggle(setters.setConditions, value)}
      />
      <FilterGroup
        title="Colour"
        values={options.colors}
        selected={state.colors}
        onToggle={(value) => toggle(setters.setColors, value)}
      />
      <FilterGroup
        title="Material"
        values={options.materials}
        selected={state.materials}
        onToggle={(value) => toggle(setters.setMaterials, value)}
      />
      <FilterGroup
        title={activeCategory === "home_decor" ? "Style" : "Pattern"}
        values={options.patterns}
        selected={state.patterns}
        onToggle={(value) => toggle(setters.setPatterns, value)}
      />
    </>
  );
}

function FilterGroup({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!values.length) return null;
  return (
    <fieldset className="filter-group">
      <legend>{title}</legend>
      {values.map((value) => (
        <label key={value}>
          <input
            type="checkbox"
            checked={selected.includes(value)}
            onChange={() => onToggle(value)}
          />
          <span>{value}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ProductGrid({
  products,
  filtersActive,
  homeCategory,
}: {
  products: CatalogProduct[];
  filtersActive: boolean;
  homeCategory: boolean;
}) {
  if (!products.length)
    return (
      <div className="catalog-empty">
        <h3>
          {filtersActive
            ? "No matching items"
            : homeCategory
              ? "Thoughtful finds for your home, coming soon."
              : "Nothing live here yet"}
        </h3>
        <p>
          {filtersActive
            ? "Try changing your search or removing a filter."
            : homeCategory
              ? "Our team is preparing selected Home & Decor pieces. Explore other categories or offer a piece for REWEAR to review."
              : "Published inventory will appear here automatically."}
        </p>
      </div>
    );
  return (
    <div className="catalog-grid">
      {products.map((product) => {
        const cartItem = {
          id: product.id,
          name: product.name,
          brand: product.brand,
          priceCents: product.priceCents,
          photoUrl: product.photoUrl,
          size: product.size,
          condition: product.condition,
        };
        return (
          <article className="shop-card" key={product.id}>
            <div className="catalog-photo live-photo">
              <Link
                href={`/item/${product.id}`}
                aria-label={`View ${product.brand} ${product.name}`}
              >
                <Image
                  src={product.photoUrl}
                  alt={`${product.brand} ${product.name}`}
                  fill
                  sizes="(max-width: 700px) 50vw, 260px"
                />
              </Link>
              <div className="card-favorite">
                <FavoriteButton itemId={product.id} compact />
              </div>
              {product.condition ? (
                <span className="condition-badge">{product.condition}</span>
              ) : null}
            </div>
            <div className="shop-card-copy">
              <small>{product.brand}</small>
              <Link href={`/item/${product.id}`}>
                <h3>{product.name}</h3>
              </Link>
              <span>
                {product.size
                  ? `Size ${product.size}`
                  : product.category === "home_decor"
                    ? "Home & Decor"
                    : product.category}
              </span>
              <div>
                <b>{cad(product.priceCents)}</b>
                <AddToCartButton item={cartItem} compact />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
