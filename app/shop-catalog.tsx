"use client";
import { BuyerViewEvent } from "@/components/buyer-view-event";
import { recordBuyerEvent } from "@/lib/buyer-analytics";
import { Localize, useLocale } from "@/components/site-language";


import {
  HOME_COLLECTIONS,
  homeCollectionMatches,
  type HomeData,
} from "@/lib/home-decor";
import { catalogAttributeOptions } from "@/lib/catalog-attributes";
import { translate } from "@/lib/translations";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { changeCatalogCategory, hashCategory, catalogLocation, catalogHistoryMode, readCatalogLocation, emptyCatalogFilters, priceCents, type CatalogFilters } from "@/lib/catalog-navigation";
import { clothingCollectionMatches, filterCatalogProducts } from "@/lib/catalog-filtering";
import { subcategoriesFor } from "@/lib/catalog-taxonomy";
import { Dialog as DialogPrimitive } from "radix-ui";
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
  subcategory: string | null;
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

const allLabels: { value: TabValue; label: string }[] = [
  { value: "all", label: "All items" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "shoes", label: "Shoes" },
  { value: "accessories", label: "Accessories" },
  { value: "electronics", label: "Electronics" },
  { value: "home_decor", label: "Home & Decor" },
];

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
  activeCategories,
  loadError = false,
}: {
  products: CatalogProduct[];
  now: number;
  activeCategories: CatalogCategory[];
  loadError?: boolean;
}) {
  const labels = useMemo(
    () => allLabels.filter((entry) => entry.value === "all" || activeCategories.includes(entry.value as CatalogCategory)),
    [activeCategories],
  );
  const { locale } = useLocale();
  const [filters, setFilters] = useState<CatalogFilters>(() => emptyCatalogFilters());
  const { subcategories, eras, homeFlags, collection, query, brands, sizes, conditions, colors, materials, patterns, minPrice, maxPrice, sort } = filters;
  const activeCategory = filters.category as TabValue;
  const departmentLabel = labels.find((entry) => entry.value === activeCategory)?.label ?? "All finds";
  const field = <K extends keyof CatalogFilters>(key: K): React.Dispatch<React.SetStateAction<CatalogFilters[K]>> => (value) => {
    setFilters((current) => ({ ...current, [key]: typeof value === "function" ? (value as (previous: CatalogFilters[K]) => CatalogFilters[K])(current[key]) : value }));
  };
  const setSubcategories = field("subcategories");
  const setEras = field("eras");
  const setHomeFlags = field("homeFlags");
  const setCollection = field("collection");
  const setQuery = field("query");
  const setBrands = field("brands");
  const setSizes = field("sizes");
  const setConditions = field("conditions");
  const setColors = field("colors");
  const setMaterials = field("materials");
  const setPatterns = field("patterns");
  const setMinPrice = field("minPrice");
  const setMaxPrice = field("maxPrice");
  const setSort = field("sort");
  const [filterOpen, setFilterOpen] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const restoredFilters = useRef<CatalogFilters | null>(null);
  const previousFilters = useRef(filters);

  useEffect(() => {
    const syncLocation = () => {
      const next = readCatalogLocation(window.location.search, window.location.hash, labels);
      restoredFilters.current = next;
      previousFilters.current = next;
      setFilters(next);
      setFilterOpen(false);
      setLocationReady(true);
    };
    // A repeated category link must work even when the fragment is unchanged.
    const followCategory = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.target || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return;
      const category = hashCategory(url.hash, labels);
      if (!category) return;
      event.preventDefault();
      setFilters((current) => changeCatalogCategory(current, category));
      setFilterOpen(false);
      document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });
    };
    syncLocation();
    window.addEventListener("popstate", syncLocation);
    window.addEventListener("hashchange", syncLocation);
    document.addEventListener("click", followCategory, true);
    return () => {
      window.removeEventListener("popstate", syncLocation);
      window.removeEventListener("hashchange", syncLocation);
      document.removeEventListener("click", followCategory, true);
    };
  }, [labels]);

  useEffect(() => {
    if (!locationReady || restoredFilters.current === filters) return;
    const next = catalogLocation(window.location.pathname, window.location.search, filters);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== next) {
      if (catalogHistoryMode(previousFilters.current, filters) === "replace") {
        window.history.replaceState(null, "", next);
      } else {
        window.history.pushState(null, "", next);
      }
    }
    previousFilters.current = filters;
  }, [filters, locationReady]);

  const categoryProducts = useMemo(
    () =>
      activeCategory === "all"
        ? products
        : products.filter((product) => product.category === activeCategory),
    [activeCategory, products],
  );
  const options = useMemo(
    () => {
      const shared = catalogAttributeOptions(activeCategory);
      return ({
      brands: unique([...shared.brands, ...categoryProducts.map((product) => product.brand)]),
      sizes: unique([...shared.sizes, ...categoryProducts.map((product) => product.size)]),
      conditions: unique([...shared.conditions, ...categoryProducts.map((product) => product.condition)]),
      colors: unique([...shared.colors, ...categoryProducts.map((product) => product.color)]),
      materials: unique([...shared.materials, ...categoryProducts.map((product) => product.material)]),
      patterns: unique([...shared.patterns, ...categoryProducts.map((product) => product.pattern)]),
    });
    },
    [activeCategory, categoryProducts],
  );
  const categorySubcategories = useMemo(
    () => unique([...(activeCategory === "all" ? activeCategories.flatMap(category => subcategoriesFor(category)) : subcategoriesFor(activeCategory)), ...categoryProducts.map((product) => product.subcategory)]),
    [activeCategory, activeCategories, categoryProducts],
  );

  const minCents = priceCents(minPrice);
  const maxCents = priceCents(maxPrice);
  const invalidPriceRange = minCents !== null && maxCents !== null && minCents > maxCents;
  const filtered = useMemo(
    () => filterCatalogProducts(products, filters, now),
    [products, filters, now],
  );

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
  const clearFilters = () => setFilters(emptyCatalogFilters(activeCategory));
  const changeCategory = (value: string) => {
    if (!labels.some((label) => label.value === value)) return;
    setFilters(current => changeCatalogCategory(current, value));
    setFilterOpen(false);
  };
  const chips = [
    ...(["subcategories", "eras", "homeFlags", "brands", "sizes", "conditions", "colors", "materials", "patterns"] as const).flatMap((key) => filters[key].map((value) => ({
      key: `${key}:${value}`,
      label: `${key === "sizes" ? "Size: " : ""}${value.replaceAll("_", " ")}`,
      remove: () => setFilters((current) => ({ ...current, [key]: current[key].filter((entry) => entry !== value) })),
    }))),
    ...(["query", "collection", "minPrice", "maxPrice"] as const).filter((key) => filters[key]).map((key) => ({
      key,
      label: key === "query" ? `Search: ${query}` : key === "minPrice" ? `From $${minPrice} CAD` : key === "maxPrice" ? `Up to $${maxPrice} CAD` : collection === "clothing-new" ? "New arrivals" : collection === "clothing-under-25" ? "Under $25 CAD" : collection,
      remove: () => setFilters((current) => ({ ...current, [key]: "" })),
    })),
  ];

  const filterPanel = (
    <>
      <fieldset className="filter-group"><legend>Sort items</legend>
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
      </fieldset>
      <fieldset className="filter-group"><legend>Category</legend>
        <select aria-label="Filter by category" value={activeCategory} onChange={event => setFilters(current => changeCatalogCategory(current, event.target.value))}>
          {labels.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
      </fieldset>
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
        extraActiveCount={subcategories.length + eras.length + homeFlags.length + (collection ? 1 : 0) + (query ? 1 : 0)}
      />
      {categorySubcategories.length > 0 ? (
        <FilterGroup
          title="Subcategory"
          values={categorySubcategories}
          selected={subcategories}
          onToggle={(value) => toggle(setSubcategories, value)}
        />
      ) : null}
      {activeCategory === "home_decor" ? (
        <details className="home-filters" open>
          <summary>Home &amp; Decor filters</summary>
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

  return <Localize>{(
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
          <p className="catalog-breadcrumb">All finds{activeCategory !== "all" ? ` / ${departmentLabel}` : ""}</p>
          <p className="eyebrow dark">The Shikimomo collection</p>
          <h2>{activeCategory === "all" ? "Curated finds. Another life." : `Shop ${departmentLabel}`}</h2>
        </div>
        <p>
          Search inspected items and narrow by category, subcategory, price,
          brand, size, condition, colour, material and pattern.
        </p>
      </div>
      <div className="catalog-searchbar">
        <label>
          <Search />
          <input
            aria-label="Search items"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search type, brand or size"
          />
        </label>

      </div>

      <div className="home-collections" aria-label="Clothing collections">
        {[["clothing-new", "New arrivals"], ["clothing-under-25", "Under $25 CAD"]].filter(([key]) => categoryProducts.some(p => clothingCollectionMatches(p, key, now))).map(([key, label]) => <button key={key} type="button" aria-pressed={collection === key} onClick={() => setCollection(collection === key ? "" : key)}>{label}</button>)}
        {unique(categoryProducts.filter(p => ["women", "men", "kids"].includes(p.category)).map(p => p.brand)).map(brand => <button key={brand} type="button" aria-pressed={brands.includes(brand)} onClick={() => toggle(setBrands, brand)} translate="no">{brand}</button>)}
      </div>
      {activeCategory === "home_decor" ? (
        <>
          <p className="home-catalog-note">
            Selected decorative, vintage and collectible pieces, physically
            inspected and listed by Shikimomo. We handle the seller’s item,
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
        {activeCategory !== "all" && categorySubcategories.length > 0 ? <div className="catalog-subcategories" aria-label="Shop by subcategory">
          {categorySubcategories.map((value) => <button key={value} type="button" aria-pressed={subcategories.includes(value)} onClick={() => toggle(setSubcategories, value)}>{value}</button>)}
        </div> : null}
        {labels.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <div className="catalog-body catalog-body-filter-rail">
              <aside className="catalog-filter-rail" aria-label={locale === "fr" ? "Filtres" : "Filters"}>
                  <button className="catalog-filter-toggle" type="button" aria-expanded={filterOpen} aria-controls="catalog-inline-filters" onClick={()=>setFilterOpen(open=>!open)}>
                    <SlidersHorizontal /> Filters {activeFilterCount > 0 ? <span>{activeFilterCount}</span> : null}<span aria-hidden="true">{filterOpen ? "⌃" : "⌄"}</span>
                  </button>
                {filterOpen ? <section id="catalog-inline-filters" className="catalog-filter catalog-inline-filter" aria-label={locale === "fr" ? "Filtres du catalogue" : "Product filters"}>
                  {filterPanel}
                  <div className="catalog-inline-filter-footer"><Button type="button" onClick={()=>setFilterOpen(false)}>{locale === "fr" ? "Appliquer les filtres" : "Apply filters"}</Button></div>
                </section> : null}
              </aside>
              <div className="catalog-results">
                <div className="catalog-toolbar catalog-inline-toolbar">

                  <div className="catalog-result-count" role="status" aria-live="polite">{loadError ? "Catalog unavailable" : <><strong>{filtered.length}</strong>{" "}{filtered.length===1?"item":"items"}</>}</div>
                </div>

                {chips.length > 0 ? <div className="catalog-active-filters" aria-label="Active filters">
                  {chips.map((chip) => <button type="button" key={chip.key} onClick={chip.remove} aria-label={`Remove ${chip.label}`}><span>{chip.label}</span><X aria-hidden="true" /></button>)}
                  <button type="button" onClick={clearFilters}>Clear all</button>
                </div> : null}
                {invalidPriceRange ? <p className="catalog-price-hint" role="status">Minimum price must be less than or equal to maximum price.</p> : null}
                <ProductGrid
                  loadError={loadError}
                  departmentLabel={activeCategory === "all" ? null : departmentLabel}
                  clearFilters={clearFilters}
                  homeCategory={activeCategory === "home_decor"}
                  products={filtered}
                  selectedSizes={sizes}
                  filtersActive={activeFilterCount > 0 || Boolean(query)}
                />
              </div>
            </div>

          </TabsContent>
        ))}
      </Tabs>
    </section>
  )}</Localize>;
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
  extraActiveCount,
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
  extraActiveCount: number;
}) {
  const any =
    Object.values(state).some((values) => values.length) ||
    minPrice ||
    maxPrice ||
    extraActiveCount > 0;
  return <Localize>{(
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
      <fieldset className="filter-price">
        <legend>Price (CAD)</legend>
        <div>
          <input
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            aria-label="Minimum price in Canadian dollars"
            placeholder="Min $"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
          />
          <input
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            aria-label="Maximum price in Canadian dollars"
            placeholder="Max $"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
          />
        </div>
      </fieldset>
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
  )}</Localize>;
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
  const { locale } = useLocale();
  const [search, setSearch] = useState("");
  const choices = unique([...values, ...selected]);
  const matching = choices.filter(value => translate(locale, value).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) || value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <Localize><details className="catalog-filter-dropdown">
    <summary style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 76px", gap: 8, fontSize: 14 }}><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{title}</span><span className="catalog-filter-choice" style={{ minWidth: 0, width: "100%", boxSizing: "border-box" }}>{selected.length ? String(selected.length) : "Any"}<span aria-hidden="true">⌄</span></span></summary>
    <div className="catalog-filter-options">
      <input type="search" aria-label={locale === "fr" ? `Rechercher : ${title}` : `Search ${title}`} placeholder="Search options" value={search} onChange={event => setSearch(event.target.value)} />
      <fieldset className="filter-group">
        <legend className="sr-only">{title}</legend>
        {matching.map(value => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} /><span translate={title === "Brand" || title === "Maker / Brand" ? "no" : undefined}>{value}</span></label>)}
        {!matching.length ? <p role="status">No matching options</p> : null}
      </fieldset>
    </div>
  </details></Localize>;
}

export function ProductGrid({
  products,
  filtersActive,
  homeCategory,
  departmentLabel,
  loadError,
  clearFilters,
  selectedSizes = [],
}: {
  selectedSizes?: string[];
  products: CatalogProduct[];
  filtersActive: boolean;
  homeCategory: boolean;
  departmentLabel: string | null;
  loadError: boolean;
  clearFilters: () => void;
}) {
  if (loadError) return <Localize>{<div className="catalog-empty catalog-unavailable" role="status">
    <h3>We couldn’t load the collection</h3>
    <p>Please try again in a moment. Your filters are saved in this page’s address.</p>
    <button type="button" onClick={() => window.location.reload()}>Try again</button>
  </div>}</Localize>;
  if (!products.length)
    return <Localize>{(
      <div className="catalog-empty">
        <h3>
          {filtersActive
            ? "No matching items"
            : homeCategory
              ? "Thoughtful finds for your home, coming soon."
              : departmentLabel ? `Nothing live in ${departmentLabel} yet` : "Nothing live here yet"}
        </h3>
        <p>
          {filtersActive
            ? "Try changing your search or removing a filter."
            : homeCategory
              ? "Our team is preparing selected Home & Decor pieces. Explore other categories or offer a piece for Shikimomo to review."
              : departmentLabel ? `Check back for inspected ${departmentLabel.toLowerCase()} pieces or explore another department.` : "Our team is preparing inspected pieces. Check back soon."}
        </p>
        {filtersActive ? <button type="button" onClick={clearFilters}>Clear search and filters</button> : null}
      </div>
    )}</Localize>;
  return <Localize>{(
    <div className="catalog-grid">
      <BuyerViewEvent name="view_item_list" ids={products.map(p=>p.id)} />
      {products.map((product) => {
        const cartItem = {
          id: product.id,
          name: product.name,
          brand: product.brand,
          priceCents: product.priceCents,
          photoUrl: product.photoUrl,
          size: product.size,
          condition: product.condition,
          category: product.category,
          weightKg: typeof product.home?.weight_kg === "number" ? product.home.weight_kg : null,
        };
        return (
          <article className="shop-card" key={product.id}>
            <div className="catalog-photo live-photo">
              <Link
                href={`/item/${product.id}${selectedSizes.length ? `?${new URLSearchParams(selectedSizes.map(size=>["sizes",size])).toString()}` : ""}`} onClick={()=>void recordBuyerEvent("select_item",[product.id])}
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
              <Link href={`/item/${product.id}${selectedSizes.length ? `?${new URLSearchParams(selectedSizes.map(size=>["sizes",size])).toString()}` : ""}`} onClick={()=>void recordBuyerEvent("select_item",[product.id])}>
                <h3 translate="no">{product.name}</h3>
              </Link>
              <span>
                {product.subcategory
                  ? product.size
                    ? `${product.subcategory} · Size ${product.size}`
                    : product.subcategory
                  : product.size
                    ? `Size ${product.size}`
                    : product.category === "home_decor"
                      ? "Home & Decor"
                      : product.category}
              </span>
              {product.color ? <span translate="no">{product.color}</span> : null}
              <QuickView product={product} selectedSizes={selectedSizes} />
              <div>
                <b>{cad(product.priceCents)}</b>
                <AddToCartButton item={cartItem} compact />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  )}</Localize>;
}

function QuickView({ product, selectedSizes }: { product: CatalogProduct; selectedSizes:string[] }) {
  return <Localize><DialogPrimitive.Root><DialogPrimitive.Trigger asChild><button type="button" className="quick-view-trigger">Quick view</button></DialogPrimitive.Trigger><DialogPrimitive.Portal><DialogPrimitive.Overlay className="filter-sheet-backdrop" /><DialogPrimitive.Content className="quick-view" aria-describedby={undefined}><Localize><DialogPrimitive.Title>{product.brand}</DialogPrimitive.Title><DialogPrimitive.Close asChild><button className="quick-view-close" aria-label="Close quick view"><X /></button></DialogPrimitive.Close><div className="quick-view-photo"><Image src={product.photoUrl} alt={product.name} fill sizes="(max-width: 600px) 90vw, 400px" /></div><h2 translate="no">{product.name}</h2><dl><dt>Type</dt><dd translate="no">{product.subcategory || product.category}</dd><dt>Size</dt><dd translate="no">{product.size || "—"}</dd><dt>Colour</dt><dd translate="no">{product.color || "—"}</dd><dt>Condition</dt><dd>{product.condition || "—"}</dd></dl><b>{cad(product.priceCents)} CAD</b><p>Availability and price are checked before checkout.</p><Link href={`/item/${product.id}${selectedSizes.length ? `?${new URLSearchParams(selectedSizes.map(size=>["sizes",size])).toString()}` : ""}`} onClick={()=>void recordBuyerEvent("select_item",[product.id])}>View full details</Link></Localize></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root></Localize>;
}


