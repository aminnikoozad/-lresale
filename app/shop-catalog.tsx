"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Heart, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CatalogCategory = "women" | "men" | "kids" | "shoes" | "accessories" | "electronics";
type TabValue = "all" | CatalogCategory;

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string;
  priceCents: number;
  category: CatalogCategory;
  condition: string | null;
  size: string | null;
  photoUrl: string;
};

const labels: { value: TabValue; label: string }[] = [
  { value: "all", label: "All items" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "shoes", label: "Shoes" },
  { value: "accessories", label: "Accessories" },
  { value: "electronics", label: "Electronics" },
];

function hashCategory(hash: string): TabValue | null {
  const value = hash.replace(/^#/, "").toLowerCase();
  return labels.some((entry) => entry.value === value) ? (value as TabValue) : null;
}

function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function ShopCatalog({ products }: { products: CatalogProduct[] }) {
  const [activeCategory, setActiveCategory] = useState<TabValue>("all");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    const syncHash = () => {
      const next = hashCategory(window.location.hash);
      if (next) setActiveCategory(next);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!filterOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [filterOpen]);

  const categoryProducts = useMemo(
    () => activeCategory === "all" ? products : products.filter((product) => product.category === activeCategory),
    [activeCategory, products],
  );

  const brands = useMemo(
    () => [...new Set(categoryProducts.map((product) => product.brand))].sort((a, b) => a.localeCompare(b)),
    [categoryProducts],
  );

  const sizes = useMemo(
    () => [...new Set(categoryProducts.map((product) => product.size).filter((size): size is string => Boolean(size)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [categoryProducts],
  );

  const filteredProducts = useMemo(
    () => categoryProducts.filter((product) =>
      (!selectedBrands.length || selectedBrands.includes(product.brand)) &&
      (!selectedSizes.length || (product.size && selectedSizes.includes(product.size))),
    ),
    [categoryProducts, selectedBrands, selectedSizes],
  );

  const activeFilterCount = selectedBrands.length + selectedSizes.length;
  const hasFilterOptions = brands.length > 0 || sizes.length > 0;

  const clearFilters = () => {
    setSelectedBrands([]);
    setSelectedSizes([]);
  };

  const changeCategory = (value: string) => {
    const next = value as TabValue;
    setActiveCategory(next);
    clearFilters();
    setFilterOpen(false);
    if (typeof window !== "undefined") {
      const hash = next === "all" ? "shop" : next;
      window.history.replaceState(null, "", `#${hash}`);
    }
  };

  const filterPanel = (
    <FilterPanel
      activeCategory={activeCategory}
      brands={brands}
      sizes={sizes}
      selectedBrands={selectedBrands}
      selectedSizes={selectedSizes}
      clearFilters={clearFilters}
      setSelectedBrands={setSelectedBrands}
      setSelectedSizes={setSelectedSizes}
    />
  );

  return (
    <section id="shop" className="shop-catalog section-wrap">
      <div className="catalog-hash-anchors" aria-hidden="true">
        {labels.filter((entry) => entry.value !== "all").map((entry) => <span id={entry.value} key={entry.value} />)}
      </div>
      <div className="section-heading">
        <div><p className="eyebrow dark">Available now</p><h2>Curated secondhand, ready to wear.</h2></div>
        <p>Only inspected items published by Rewear staff appear here. Filter by brand and size to find the right fit.</p>
      </div>

      <Tabs value={activeCategory} onValueChange={changeCategory}>
        <TabsList className="catalog-shortcuts" aria-label="Shop by category">
          {labels.map((entry) => <TabsTrigger key={entry.value} value={entry.value}>{entry.label}</TabsTrigger>)}
        </TabsList>

        {labels.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <div className={`catalog-body ${hasFilterOptions ? "" : "no-filter-options"}`}>
              {hasFilterOptions ? (
                <aside className="catalog-filter desktop-filter" aria-label="Product filters">
                  {filterPanel}
                </aside>
              ) : null}

              <div className="catalog-results">
                <div className="catalog-toolbar">
                  <div className="catalog-result-count">
                    <strong>{filteredProducts.length}</strong> {filteredProducts.length === 1 ? "item" : "items"}
                  </div>
                  {hasFilterOptions ? (
                    <button className="mobile-filter-toggle" type="button" onClick={() => setFilterOpen(true)}>
                      <SlidersHorizontal /> Filters {activeFilterCount > 0 ? <span>{activeFilterCount}</span> : null}
                    </button>
                  ) : null}
                </div>
                <ProductGrid products={filteredProducts} filtersActive={activeFilterCount > 0} />
              </div>
            </div>

            {filterOpen && hasFilterOptions ? (
              <>
                <button className="filter-sheet-backdrop" type="button" aria-label="Close filters" onClick={() => setFilterOpen(false)} />
                <aside className="catalog-filter filter-sheet" aria-label="Mobile product filters">
                  <div className="filter-sheet-head">
                    <strong>Filters</strong>
                    <button type="button" aria-label="Close filters" onClick={() => setFilterOpen(false)}><X /></button>
                  </div>
                  {filterPanel}
                  <div className="filter-sheet-footer">
                    <Button type="button" onClick={() => setFilterOpen(false)}>
                      Show {filteredProducts.length} {filteredProducts.length === 1 ? "item" : "items"}
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

function FilterPanel({
  activeCategory,
  brands,
  sizes,
  selectedBrands,
  selectedSizes,
  clearFilters,
  setSelectedBrands,
  setSelectedSizes,
}: {
  activeCategory: TabValue;
  brands: string[];
  sizes: string[];
  selectedBrands: string[];
  selectedSizes: string[];
  clearFilters: () => void;
  setSelectedBrands: Dispatch<SetStateAction<string[]>>;
  setSelectedSizes: Dispatch<SetStateAction<string[]>>;
}) {
  return (
    <>
      <div className="filter-title">
        <span><SlidersHorizontal /> Filters</span>
        {(selectedBrands.length > 0 || selectedSizes.length > 0) && (
          <button type="button" onClick={clearFilters}><X /> Clear</button>
        )}
      </div>

      <FilterGroup
        title="Brand"
        values={brands}
        selected={selectedBrands}
        onToggle={(brand) => setSelectedBrands((current) =>
          current.includes(brand) ? current.filter((value) => value !== brand) : [...current, brand],
        )}
      />

      {sizes.length > 0 && (
        <FilterGroup
          title={activeCategory === "shoes" ? "Shoe size" : "Size"}
          values={sizes}
          selected={selectedSizes}
          onToggle={(size) => setSelectedSizes((current) =>
            current.includes(size) ? current.filter((value) => value !== size) : [...current, size],
          )}
        />
      )}
    </>
  );
}

function FilterGroup({ title, values, selected, onToggle }: {
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
          <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />
          <span>{value}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ProductGrid({ products, filtersActive }: { products: CatalogProduct[]; filtersActive: boolean }) {
  if (!products.length) {
    return (
      <div className="catalog-empty">
        <h3>{filtersActive ? "No matching items" : "Nothing live here yet"}</h3>
        <p>{filtersActive ? "Try removing one of the filters." : "Published inventory will appear here automatically."}</p>
      </div>
    );
  }

  return (
    <div className="catalog-grid">
      {products.map((product) => (
        <article className="shop-card" key={product.id}>
          <div className="catalog-photo live-photo">
            <Image src={product.photoUrl} alt={`${product.brand} ${product.name}`} fill sizes="(max-width: 700px) 50vw, 260px" />
            <button aria-label={`Save ${product.name}`}><Heart /></button>
            {product.condition ? <span className="condition-badge">{product.condition}</span> : null}
          </div>
          <div className="shop-card-copy">
            <small>{product.brand}</small>
            <h3>{product.name}</h3>
            <span>{product.size ? `Size ${product.size}` : product.category}</span>
            <div><b>{cad(product.priceCents)}</b><Button size="icon-sm" aria-label={`Add ${product.name} to bag`}><ShoppingBag /></Button></div>
          </div>
        </article>
      ))}
    </div>
  );
}
